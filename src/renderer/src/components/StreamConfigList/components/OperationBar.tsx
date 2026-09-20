import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  useTranslation
} from 'react-i18next'

import UseThemeIcon from '@/components/UseThemeIcon'
import Dialog from '@/components/Dialog'

import {
  useStreamConfigStore
} from '@/store/useStreamConfigStore'

import darkPlayIcon from '@/assets/images/dark/play.svg'
import lightPlayIcon from '@/assets/images/light/play.svg'

import darkPauseIcon from '@/assets/images/dark/pause.svg'
import lightPauseIcon from '@/assets/images/light/pause.svg'

import darkSettingIcon from '@/assets/images/dark/setting.svg'
import lightSettingIcon from '@/assets/images/light/setting.svg'

import darkDeleteIcon from '@/assets/images/dark/close.svg'
import lightDeleteIcon from '@/assets/images/light/close.svg'

import {
  StreamStatus,
  useXizhiToPushNotification
} from '@renderer/lib/utils'

import StreamConfigSheet from '@renderer/components/StreamConfigSheet'

import {
  useToast
} from '@renderer/hooks/useToast'

import {
  CRAWLER_ERROR_CODE,
  SUCCESS_CODE,
  UNKNOWN_CODE,
  crawlerErrorCodeToI18nMessage,
  FFMPEG_ERROR_CODE
} from '../../../../../code'

import {
  RECORD_END_NOT_USER_STOP
} from '../../../../../const'

import emitter from '@/lib/bus'

import {
  useDefaultSettingsStore
} from '../../../store/useDefaultSettingsStore'

interface OperationBarProps {
  streamConfig: IStreamConfig
}

export default function OperationBar(
  props: OperationBarProps
) {
  const timer =
    useRef<NodeJS.Timeout>()

  const liveNotifiedRef =
    useRef(false)

  const {
    streamConfig
  } =
    props

  const {
    t
  } =
    useTranslation()

  const defaultSettingsConfig =
    useDefaultSettingsStore(
      (
        state
      ) =>
        state.defaultSettingsConfig
    )

  const {
    toast
  } =
    useToast()

  const [
    sheetOpen,
    setSheetOpen
  ] =
    useState(false)

  const [
    deleteDialogOpen,
    setDeleteDialogOpen
  ] =
    useState(false)

  const {
    removeStreamConfig,
    updateStreamConfig
  } =
    useStreamConfigStore(
      (
        state
      ) => ({
        removeStreamConfig:
          state.removeStreamConfig,

        updateStreamConfig:
          state.updateStreamConfig
      })
    )

  const handleConfirmDelete =
    async () => {
      await removeStreamConfig(
        streamConfig.id
      )

      setDeleteDialogOpen(
        false
      )
    }

  const scheduleMonitorOnly =
    () => {
      if (
        timer.current
      ) {
        clearTimeout(
          timer.current
        )
      }

      timer.current =
        setTimeout(
          () => {
            void handleMonitorOnly(
              false
            )
          },

          1000 *
            streamConfig.interval
        )
    }

  const handleMonitorOnly =
    async (
      isFirst =
        true
    ) => {
      if (isFirst) {
        liveNotifiedRef.current =
          false

        await updateStreamConfig(
          {
            ...streamConfig,

            status:
              StreamStatus.MONITORING
          },

          streamConfig.id
        )
      }

      const result =
        await window.api
          .getLiveUrls({
            roomUrl:
              streamConfig.roomUrl,

            cookie:
              streamConfig.cookie,

            proxy:
              streamConfig.proxy,

            title:
              streamConfig.title
          })
          .catch(
            () => ({
              code:
                UNKNOWN_CODE,

              liveUrls:
                [] as string[]
            })
          )

      const latest =
        useStreamConfigStore
          .getState()
          .streamConfigList
          .find(
            item =>
              item.id ===
              streamConfig.id
          )

      if (
        !latest ||
        latest.status ===
          StreamStatus.NOT_STARTED
      ) {
        return
      }

      if (
        result.code ===
          SUCCESS_CODE &&
        Array.isArray(
          result.liveUrls
        ) &&
        result.liveUrls.length >
          0
      ) {
        await updateStreamConfig(
          {
            ...latest,

            status:
              StreamStatus.MONITORING_LIVE
          },

          streamConfig.id
        )

        if (
          !liveNotifiedRef.current
        ) {
          liveNotifiedRef.current =
            true

          const message =
            t(
              'stream_config.live_detected_notify',
              {
                title:
                  streamConfig.title
              }
            )

          window.api
            .showNotification(
              t(
                'stream_config.live_detected'
              ),

              message
            )

          toast({
            title:
              streamConfig.title,

            description:
              t(
                'stream_config.live_detected'
              )
          })

          if (
            defaultSettingsConfig
              .xizhiKey
          ) {
            useXizhiToPushNotification({
              key:
                defaultSettingsConfig
                  .xizhiKey,

              title:
                streamConfig.title,

              content:
                t(
                  'stream_config.live_detected'
                )
            })
          }
        }

        scheduleMonitorOnly()

        return
      }

      if (
        result.code ===
          CRAWLER_ERROR_CODE.NOT_URLS
      ) {
        liveNotifiedRef.current =
          false

        await updateStreamConfig(
          {
            ...latest,

            status:
              StreamStatus.MONITORING_OFFLINE
          },

          streamConfig.id
        )

        scheduleMonitorOnly()

        return
      }

      if (
        result.code ===
        UNKNOWN_CODE
      ) {
        await updateStreamConfig(
          {
            ...latest,

            status:
              StreamStatus.MONITORING_ERROR
          },

          streamConfig.id
        )

        scheduleMonitorOnly()

        return
      }
      const monitoringOtherErrorStatus =
        StreamStatus.MONITORING_ERROR

      await updateStreamConfig(
        {
          ...latest,

          status:
            monitoringOtherErrorStatus
        },

        streamConfig.id
      )



      if (isFirst) {
        const errMessage =
          crawlerErrorCodeToI18nMessage(
            result.code,

            'error.get_line.'
          )

        toast({
          title:
            streamConfig.title,

          description:
            t(
              errMessage
            ),

          variant:
            'destructive'
        })
      }

      scheduleMonitorOnly()
    }

  const handleStartRecord =
    async (
      isFirst =
        true
    ) => {
      if (isFirst) {
        await updateStreamConfig(
          {
            ...streamConfig,

            status:
              StreamStatus.PREPARING_TO_RECORD
          },

          streamConfig.id
        )
      }

      const {
        code
      } =
        await window.api
          .startStreamRecord(
            JSON.stringify(
              streamConfig
            )
          )
          .catch(
            () => ({
              code:
                UNKNOWN_CODE
            })
          )

      const currentStatus =
        useStreamConfigStore
          .getState()
          .streamConfigList
          .find(
            item =>
              item.id ===
              streamConfig.id
          )
          ?.status

      if (
        currentStatus ===
        StreamStatus.NOT_STARTED
      ) {
        return
      }

      if (
        code ===
        SUCCESS_CODE
      ) {
        await updateStreamConfig(
          {
            ...streamConfig,

            status:
              StreamStatus.RECORDING
          },

          streamConfig.id
        )

        toast({
          title:
            streamConfig.title,

          description:
            t(
              'start_record'
            )
        })

        if (
          defaultSettingsConfig
            .xizhiKey
        ) {
          useXizhiToPushNotification({
            key:
              defaultSettingsConfig
                .xizhiKey,

            title:
              streamConfig.title,

            content:
              t(
                'start_record'
              )
          })
        }

        return
      }

      if (
        code ===
          CRAWLER_ERROR_CODE.NOT_URLS ||
        code ===
          UNKNOWN_CODE
      ) {
        if (
          timer.current
        ) {
          clearTimeout(
            timer.current
          )
        }

        timer.current =
          setTimeout(
            () => {
              void handleStartRecord(
                false
              )
            },

            1000 *
              streamConfig.interval
          )

        if (isFirst) {
          toast({
            title:
              streamConfig.title,

            description:
              t(
                'error.start_record.not_urls'
              )
          })

          if (
            defaultSettingsConfig
              .xizhiKey
          ) {
            useXizhiToPushNotification({
              key:
                defaultSettingsConfig
                  .xizhiKey,

              title:
                streamConfig.title,

              content:
                t(
                  'error.start_record.not_urls'
                )
            })
          }
        }

        await updateStreamConfig(
          {
            ...streamConfig,

            status:
              code ===
                CRAWLER_ERROR_CODE.NOT_URLS
                ? StreamStatus.MONITORING_OFFLINE
                : StreamStatus.MONITORING_ERROR
          },

          streamConfig.id
        )

        return
      }

      if (
        Object.values(
          FFMPEG_ERROR_CODE
        ).includes(
          code
        )
      ) {
        return
      }

      const errMessage =
        crawlerErrorCodeToI18nMessage(
          code,

          'error.start_record.'
        )

      await updateStreamConfig(
        {
          ...streamConfig,

          status:
            StreamStatus.NOT_STARTED
        },

        streamConfig.id
      )

      toast({
        title:
          streamConfig.title,

        description:
          t(
            errMessage
          ),

        variant:
          'destructive'
      })

      if (
        defaultSettingsConfig
          .xizhiKey
      ) {
        useXizhiToPushNotification({
          key:
            defaultSettingsConfig
              .xizhiKey,

          title:
            streamConfig.title,

          content:
            t(
              errMessage
            )
        })
      }
    }

  const handlePlayClick =
    () => {
      if (
        streamConfig.autoRecord ===
        false
      ) {
        void handleMonitorOnly(
          true
        )

        return
      }

      void handleStartRecord(
        true
      )
    }

  const handlePauseClick =
    async () => {
      if (
        timer.current
      ) {
        clearTimeout(
          timer.current
        )
      }

      liveNotifiedRef.current =
        false

      if (
        streamConfig.autoRecord ===
        false
      ) {
        await updateStreamConfig(
          {
            ...streamConfig,

            status:
              StreamStatus.NOT_STARTED
          },

          streamConfig.id
        )

        return
      }

      await window.api
        .stopStreamRecord(
          streamConfig.id
        )
    }

  useEffect(
    () => {
      const handleRecordEndNotUserStop =
        async (
          id: string
        ) => {
          if (
            id !==
            streamConfig.id
          ) {
            return
          }

          if (
            timer.current
          ) {
            clearTimeout(
              timer.current
            )
          }

          timer.current =
            setTimeout(
              () => {
                handlePlayClick()
              },

              2000
            )
        }

      emitter.on(
        RECORD_END_NOT_USER_STOP,

        handleRecordEndNotUserStop as any
      )

      return () => {
        emitter.off(
          RECORD_END_NOT_USER_STOP,

          handleRecordEndNotUserStop as any
        )
      }
    },

    [
      streamConfig,
      timer
    ]
  )

  useEffect(
    () => {
      return () => {
        if (
          timer.current
        ) {
          clearTimeout(
            timer.current
          )
        }
      }
    },

    []
  )

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-background p-1.5 shadow-sm">
        {streamConfig.status ===
        StreamStatus.NOT_STARTED ? (
          <UseThemeIcon
            className="w-[18px] cursor-pointer select-none"
            dark={
              darkPlayIcon
            }
            light={
              lightPlayIcon
            }
            handleClick={
              handlePlayClick
            }
            id={
              streamConfig.id +
              '_play'
            }
          />
        ) : (
          <UseThemeIcon
            className="w-[20px] cursor-pointer select-none"
            dark={
              darkPauseIcon
            }
            light={
              lightPauseIcon
            }
            handleClick={
              handlePauseClick
            }
            id={
              streamConfig.id +
              '_pause'
            }
          />
        )}

        <UseThemeIcon
          className="w-[20px] cursor-pointer select-none"
          dark={
            darkSettingIcon
          }
          light={
            lightSettingIcon
          }
          handleClick={
            () =>
              setSheetOpen(
                true
              )
          }
          tooltipContent={
            t(
              'stream_config.edit'
            )
          }
        />

        <UseThemeIcon
          className="w-[20px] cursor-pointer select-none"
          dark={
            darkDeleteIcon
          }
          light={
            lightDeleteIcon
          }
          handleClick={
            () =>
              setDeleteDialogOpen(
                true
              )
          }
        />
      </div>

      <StreamConfigSheet
        streamConfig={
          streamConfig
        }
        setSheetOpen={
          setSheetOpen
        }
        sheetOpen={
          sheetOpen
        }
        type="edit"
      />

      <Dialog
        title={
          t(
            'stream_config.confirm_delete',

            {
              title:
                streamConfig.title
            }
          )
        }
        btnText={
          t(
            'stream_config.delete'
          )
        }
        dialogOpen={
          deleteDialogOpen
        }
        onOpenChange={
          setDeleteDialogOpen
        }
        handleBtnClick={
          handleConfirmDelete
        }
        variant="destructive"
      />
    </>
  )
}
