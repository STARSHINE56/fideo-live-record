import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import mpegts from 'mpegts.js'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/shadcn/ui/dialog'

type PreviewType =
  | 'hls'
  | 'flv'

interface StreamPreviewDialogProps {
  open: boolean
  onOpenChange: (
    open: boolean
  ) => void
  title: string
  url: string
  type: PreviewType
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
    type,
    errorText
  } = props

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null
    )

  const [error, setError] =
    useState(false)

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

    let hls:
      | Hls
      | null = null

    let flvPlayer:
      | ReturnType<
          typeof mpegts.createPlayer
        >
      | null = null

    const cleanup = () => {
      if (hls) {
        try {
          hls.destroy()
        } catch {
          // Ignore cleanup error.
        }

        hls = null
      }

      if (flvPlayer) {
        try {
          flvPlayer.pause()
        } catch {
          // Ignore.
        }

        try {
          flvPlayer.unload()
        } catch {
          // Ignore.
        }

        try {
          flvPlayer.detachMediaElement()
        } catch {
          // Ignore.
        }

        try {
          flvPlayer.destroy()
        } catch {
          // Ignore.
        }

        flvPlayer = null
      }

      try {
        video.pause()

        video.removeAttribute(
          'src'
        )

        video.load()
      } catch {
        // Ignore cleanup error.
      }
    }

    // ================================================
    // HLS preview
    // ================================================

    if (
      type === 'hls'
    ) {
      if (
        video.canPlayType(
          'application/vnd.apple.mpegurl'
        )
      ) {
        video.src = url

        const playResult =
          video.play()

        if (playResult) {
          playResult.catch(
            () => {}
          )
        }

        return cleanup
      }

      if (
        Hls.isSupported()
      ) {
        hls =
          new Hls({
            lowLatencyMode:
              true,

            backBufferLength:
              30,

            maxBufferLength:
              30,

            maxMaxBufferLength:
              60
          })

        hls.loadSource(
          url
        )

        hls.attachMedia(
          video
        )

        hls.on(
          Hls.Events.MANIFEST_PARSED,
          () => {
            const playResult =
              video.play()

            if (playResult) {
              playResult.catch(
                () => {}
              )
            }
          }
        )

        hls.on(
          Hls.Events.ERROR,
          (_, data) => {
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

        return cleanup
      }

      setError(true)

      return cleanup
    }

    // ================================================
    // FLV preview
    // ================================================

    if (
      type === 'flv'
    ) {
      if (
        !mpegts.isSupported()
      ) {
        setError(true)

        return cleanup
      }

      try {
        flvPlayer =
          mpegts.createPlayer(
            {
              type:
                'flv',

              isLive:
                true,

              url,

              cors:
                true,

              withCredentials:
                false
            },

            {
              enableWorker:
                false,

              enableStashBuffer:
                true,

              stashInitialSize:
                384 * 1024,

              autoCleanupSourceBuffer:
                true,

              autoCleanupMaxBackwardDuration:
                30,

              autoCleanupMinBackwardDuration:
                10,

              lazyLoad:
                false,
}
          )

        flvPlayer.attachMediaElement(
          video
        )

        flvPlayer.load()

        const playResult =
          flvPlayer.play()

        if (
          playResult &&
          typeof playResult.catch ===
            'function'
        ) {
          playResult.catch(
            () => {}
          )
        }

        flvPlayer.on(
          mpegts.Events.ERROR,
          () => {
            setError(true)
          }
        )

        return cleanup
      } catch {
        setError(true)

        return cleanup
      }
    }

    setError(true)

    return cleanup
  }, [
    open,
    url,
    type
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
          <div className="py-12 text-center text-sm text-destructive">
            {errorText}
          </div>
        ) : (
          <video
            ref={videoRef}
            controls
            autoPlay
            playsInline
            className="w-full max-h-[70vh] bg-black rounded-md"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
