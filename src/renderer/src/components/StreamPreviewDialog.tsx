import {
  useEffect,
  useRef,
  useState
} from 'react'

import Hls from 'hls.js'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/shadcn/ui/dialog'

interface StreamPreviewDialogProps {
  open: boolean

  onOpenChange: (
    open: boolean
  ) => void

  title: string
  url: string

  type:
    | 'hls'
    | 'flv'

  errorText: string
}

export default function StreamPreviewDialog(
  props: StreamPreviewDialogProps
) {
  const {
    open,
    onOpenChange,
    title,
    url,
    errorText
  } = props

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    )

  const [
    error,
    setError
  ] =
    useState(false)

  const [
    debugText,
    setDebugText
  ] =
    useState('')

  useEffect(() => {
    const video =
      videoRef.current

    if (
      !open ||
      !url ||
      !video
    ) {
      return
    }

    setError(false)

    setDebugText(
      '正在连接本地 HLS 预览...'
    )

    let hls:
      | Hls
      | null = null

    const handleVideoError =
      () => {
        const mediaError =
          video.error

        setDebugText(
          `HTML5 video error: ${
            mediaError?.code ??
            'unknown'
          }`
        )

        setError(
          true
        )
      }

    const handleLoadedMetadata =
      () => {
        setDebugText(
          '已读取视频元数据'
        )
      }

    const handleCanPlay =
      () => {
        setDebugText(
          '视频已可播放'
        )
      }

    const handlePlaying =
      () => {
        setDebugText(
          '预览播放中'
        )
      }

    const handleWaiting =
      () => {
        setDebugText(
          '播放器正在缓冲'
        )
      }

    video.addEventListener(
      'error',
      handleVideoError
    )

    video.addEventListener(
      'loadedmetadata',
      handleLoadedMetadata
    )

    video.addEventListener(
      'canplay',
      handleCanPlay
    )

    video.addEventListener(
      'playing',
      handlePlaying
    )

    video.addEventListener(
      'waiting',
      handleWaiting
    )

    const cleanup =
      () => {
        video.removeEventListener(
          'error',
          handleVideoError
        )

        video.removeEventListener(
          'loadedmetadata',
          handleLoadedMetadata
        )

        video.removeEventListener(
          'canplay',
          handleCanPlay
        )

        video.removeEventListener(
          'playing',
          handlePlaying
        )

        video.removeEventListener(
          'waiting',
          handleWaiting
        )

        if (hls) {
          try {
            hls.destroy()
          } catch {
            // Ignore.
          }

          hls = null
        }

        try {
          video.pause()

          video.removeAttribute(
            'src'
          )

          video.load()
        } catch {
          // Ignore.
        }
      }

    if (
      !Hls.isSupported()
    ) {
      setDebugText(
        '当前 Electron 环境不支持 HLS.js MSE'
      )

      setError(true)

      return cleanup
    }

    hls =
      new Hls({
        enableWorker:
          false,

        lowLatencyMode:
          false,

        maxBufferLength:
          10,

        maxMaxBufferLength:
          20,

        backBufferLength:
          10,

        liveSyncDurationCount:
          3,

        liveMaxLatencyDurationCount:
          6
      })

    hls.on(
      Hls.Events.MEDIA_ATTACHED,
      () => {
        setDebugText(
          '播放器已连接，正在加载 M3U8'
        )

        hls?.loadSource(
          url
        )
      }
    )

    hls.on(
      Hls.Events.MANIFEST_PARSED,
      () => {
        setDebugText(
          'M3U8 已解析，等待分片'
        )

        video
          .play()
          .catch(
            () => {
              setDebugText(
                '自动播放被阻止，请点击播放按钮'
              )
            }
          )
      }
    )

    hls.on(
      Hls.Events.FRAG_LOADED,
      () => {
        setDebugText(
          'HLS 分片已加载'
        )
      }
    )

    hls.on(
      Hls.Events.BUFFER_APPENDED,
      () => {
        setDebugText(
          'HLS 数据已写入播放器缓冲区'
        )
      }
    )

    hls.on(
      Hls.Events.ERROR,
      (
        _,
        data
      ) => {
        const detail =
          String(
            data.details ||
              data.type ||
              'unknown'
          )

        setDebugText(
          `HLS: ${detail}${
            data.fatal
              ? '（fatal）'
              : ''
          }`
        )

        if (
          !data.fatal
        ) {
          return
        }

        if (
          data.type ===
          Hls.ErrorTypes.NETWORK_ERROR
        ) {
          try {
            hls?.startLoad()
            return
          } catch {
            setError(true)
            return
          }
        }

        if (
          data.type ===
          Hls.ErrorTypes.MEDIA_ERROR
        ) {
          try {
            hls?.recoverMediaError()
            return
          } catch {
            setError(true)
            return
          }
        }

        setError(true)
      }
    )

    hls.attachMedia(
      video
    )

    return cleanup
  }, [
    open,
    url
  ])

  return (
    <Dialog
      open={open}
      onOpenChange={
        onOpenChange
      }
    >
      <DialogContent className="max-w-[900px]">
        <DialogHeader>
          <DialogTitle>
            {title}
          </DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="py-8 text-center text-sm text-destructive">
            <div>
              {errorText}
            </div>

            {debugText && (
              <div className="mt-2 text-xs text-muted-foreground break-all">
                {debugText}
              </div>
            )}
          </div>
        ) : (
          <>
            <video
              ref={
                videoRef
              }
              controls
              autoPlay
              playsInline
              className="w-full max-h-[70vh] bg-black rounded-md"
            />

            {debugText && (
              <div className="text-xs text-muted-foreground break-all">
                {debugText}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
