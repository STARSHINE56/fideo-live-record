import { useMemo } from 'react'
import { useMount } from 'react-use'
import { useTranslation } from 'react-i18next'

import StreamConfigCard from './components/StreamConfigCard'

import {
  SUCCESS_CODE,
  FFMPEG_ERROR_CODE,
  errorCodeToI18nMessage,
  UNKNOWN_CODE
} from '../../../../code'
import emitter from '@/lib/bus'
import { RECORD_END_NOT_USER_STOP } from '../../../../const'

import { useStreamConfigStore } from '@/store/useStreamConfigStore'
import { useDefaultSettingsStore } from '@renderer/store/useDefaultSettingsStore'
import { useNavSelectedStatusStore } from '@renderer/store/useNavSelectedStatusStore'
import { useFfmpegProgressInfoStore } from '@/store/useFfmpegProgressInfoStore'
import { StreamStatus, useXizhiToPushNotification } from '@renderer/lib/utils'
import { useToast } from '@renderer/hooks/useToast'

const unknownErrorRetryTimesMap: Record<string, number> = {}

const maxRetryTimes = 3
const alreadyCallbackOneTimeSet = new Set()

export default function StreamConfigList() {
  const navSelectedStatus = useNavSelectedStatusStore((state) => state.navSelectedStatus)
  const { streamConfigList } = useStreamConfigStore((state) => ({
    streamConfigList: state.streamConfigList
  }))
  const selectedStreamConfigIdList = useMemo(() => {
    if (navSelectedStatus === '-1') {
      return streamConfigList.map((stream) => stream.id)
    }
    return streamConfigList
      .filter((streamConfig) => {
        const selectedStatus =
          Number(navSelectedStatus)

        if (
          selectedStatus ===
          StreamStatus.MONITORING
        ) {
          return [
            StreamStatus.MONITORING,
            StreamStatus.MONITORING_OFFLINE,
            StreamStatus.MONITORING_LIVE,
            StreamStatus.MONITORING_ERROR
          ].includes(
            streamConfig.status
          )
        }

        return (
          streamConfig.status ===
          selectedStatus
        )
      })
      .map((stream) => stream.id)
  }, [streamConfigList, navSelectedStatus])

  const { updateFfmpegProgressInfo } = useFfmpegProgressInfoStore((state) => state)

  const { toast } = useToast()
  const { t } = useTranslation()

  useMount(() => {
    window.api.onFFmpegProgressInfo((progressInfo) => {
      updateFfmpegProgressInfo(progressInfo)
    })

    window.api.onStreamRecordEnd(async (id, code, errMsg, recordedFiles) => {
      const { streamConfigList, updateStreamConfig } = useStreamConfigStore.getState()
      const xiZhiKey = useDefaultSettingsStore.getState().defaultSettingsConfig.xizhiKey
      const index = streamConfigList.findIndex((streamConfig) => streamConfig.id === id)

      if (index === -1) {
        return
      }

      const streamConfig = streamConfigList[index]
      // SUCCESS_CODE  stop by stream end
      // FFMPEG_ERROR_CODE.USER_KILL_PROCESS stop by user
      const isStopByUser = code === FFMPEG_ERROR_CODE.USER_KILL_PROCESS
      const isStopByStreamEnd = code === SUCCESS_CODE
      const isStopByResolutionChange = code === FFMPEG_ERROR_CODE.RESOLUTION_CHANGE

      let message = ''

      if (isStopByUser) {
        message = 'user_stop_record'
      }

      if (isStopByStreamEnd) {
        message = 'stream_end_stop_record'
      }

      // 用户在获取直播地址时点击停止录制或者在监控中点击停止录制
      if (
        isStopByUser &&
        (
          streamConfig.status ===
            StreamStatus.PREPARING_TO_RECORD ||
          streamConfig.status ===
            StreamStatus.MONITORING ||
          streamConfig.status ===
            StreamStatus.MONITORING_OFFLINE ||
          streamConfig.status ===
            StreamStatus.MONITORING_LIVE ||
          streamConfig.status ===
            StreamStatus.MONITORING_ERROR
        )
      ) {
        await updateStreamConfig(
          { ...streamConfig, status: StreamStatus.NOT_STARTED },
          streamConfig.id
        )

        toast({
          title: streamConfig.title,
          description: code === UNKNOWN_CODE ? t(message) + errMsg : t(message)
        })
        return
      }

      /**
       * 当录制过程出现错误，直播结束或者用户手动停止
       * 会回调两次该函数，第一次是开始转换为mp4文件之前，第二次是转换后
       */

      if (!alreadyCallbackOneTimeSet.has(id)) {
        alreadyCallbackOneTimeSet.add(id)

        // 第一次回调，除了当前状态是录制中并且需要转换为mp4文件的情况需要进行处理，其他情况都不需要处理
        if (streamConfig.status === StreamStatus.RECORDING && streamConfig.convertToMP4) {
          await updateStreamConfig(
            { ...streamConfig, status: StreamStatus.VIDEO_FORMAT_CONVERSION },
            streamConfig.id
          )
        }
        return
      }

      // 第二次回调，处理最终录像文件
      alreadyCallbackOneTimeSet.delete(id)

      const webdavConfig =
        useDefaultSettingsStore
          .getState()
          .defaultSettingsConfig

      const shouldUpload =
        Boolean(
          webdavConfig
            .webdavEnabled
        ) &&
        Boolean(
          webdavConfig
            .webdavUrl
            ?.trim()
        ) &&
        Boolean(
          webdavConfig
            .webdavUsername
            ?.trim()
        ) &&
        Boolean(
          webdavConfig
            .webdavPassword
        ) &&
        Boolean(
          recordedFiles
            ?.length
        )

      if (
        shouldUpload
      ) {
        const current =
          useStreamConfigStore
            .getState()
            .streamConfigList
            .find(
              (item) =>
                item.id ===
                streamConfig.id
            )

        if (
          current
        ) {
          await updateStreamConfig(
            {
              ...current,

              cloudUploadStatus:
                'uploading'
            },

            current.id
          )
        }

        void (async () => {
          try {
            const result =
              await window.api
                .uploadWebdav({
                  url:
                    webdavConfig
                      .webdavUrl!
                      .trim(),

                  username:
                    webdavConfig
                      .webdavUsername!
                      .trim(),

                  password:
                    webdavConfig
                      .webdavPassword!,

                  remoteRoot:
                    webdavConfig
                      .webdavRemoteRoot ||
                    '/',

                  streamerName:
                    streamConfig.title,

                  files:
                    recordedFiles!,

                  deleteAfterUpload:
                    Boolean(
                      webdavConfig
                        .webdavDeleteAfterUpload
                    ),

                  retryTimes:
                    webdavConfig
                      .webdavRetryTimes ||
                    3
                })

            const latest =
              useStreamConfigStore
                .getState()
                .streamConfigList
                .find(
                  (item) =>
                    item.id ===
                    streamConfig.id
                )

            if (
              latest
            ) {
              await useStreamConfigStore
                .getState()
                .updateStreamConfig(
                  {
                    ...latest,

                    cloudUploadStatus:
                      result.success
                        ? 'success'
                        : 'error'
                  },

                  latest.id
                )
            }

            toast({
              title:
                streamConfig.title,

              description:
                result.success
                  ? '云端录像上传成功'
                  : '云端录像上传失败，本地录像已保留',

              variant:
                result.success
                  ? undefined
                  : 'destructive'
            })
          } catch {
            const latest =
              useStreamConfigStore
                .getState()
                .streamConfigList
                .find(
                  (item) =>
                    item.id ===
                    streamConfig.id
                )

            if (
              latest
            ) {
              await useStreamConfigStore
                .getState()
                .updateStreamConfig(
                  {
                    ...latest,

                    cloudUploadStatus:
                      'error'
                  },

                  latest.id
                )
            }

            toast({
              title:
                streamConfig.title,

              description:
                '云端录像上传失败，本地录像已保留',

              variant:
                'destructive'
            })
          }
        })()
      }

      unknownErrorRetryTimesMap[id] =
        unknownErrorRetryTimesMap[id] ||
        0
      unknownErrorRetryTimesMap[id] += 1

      if (!message) {
        message = errorCodeToI18nMessage(code, 'error.stop_record.')
      }

      toast({
        title: streamConfig.title,
        description: code === UNKNOWN_CODE ? t(message) + errMsg : t(message)
      })
      if (!isStopByUser && xiZhiKey) {
        useXizhiToPushNotification({
          key: xiZhiKey,
          title: streamConfig.title,
          content: code === UNKNOWN_CODE ? t(message) + '\n' + errMsg : t(message)
        })
      }

      await updateStreamConfig(
        { ...streamConfig, status: StreamStatus.NOT_STARTED },
        streamConfig.id
      )

      if (isStopByUser || unknownErrorRetryTimesMap[id] >= maxRetryTimes) {
        unknownErrorRetryTimesMap[id] = 0
        return
      }

      if (isStopByResolutionChange || isStopByStreamEnd) {
        unknownErrorRetryTimesMap[id] = 0
      }

      emitter.emit(RECORD_END_NOT_USER_STOP, streamConfig.id)
    })
  })

  return (
    <>
      {
        <div className="show-scrollbar mx-auto flex h-[calc(100vh-80px)] w-full max-w-[1100px] flex-col gap-3 overflow-y-auto px-5 py-4">
          {streamConfigList.map((streamConfig) => (
            <div
              key={streamConfig.id}
              className={selectedStreamConfigIdList.includes(streamConfig.id) ? '' : 'hidden'}
            >
              <StreamConfigCard streamConfig={streamConfig} />
            </div>
          ))}
        </div>
      }
    </>
  )
}
