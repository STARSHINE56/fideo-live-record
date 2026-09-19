import { useEffect, useRef, useState } from 'react'
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
  type: 'hls' | 'flv'
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

    const handleVideoError = () => {
      setError(true)
    }

    video.addEventListener(
      'error',
      handleVideoError
    )

    let hls:
      | Hls
      | null = null

    const cleanup = () => {
      video.removeEventListener(
        'error',
        handleVideoError
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
        video.removeAttribute('src')
        video.load()
      } catch {
        // Ignore.
      }
    }

    if (
      video.canPlayType(
        'application/vnd.apple.mpegurl'
      )
    ) {
      video.src =
        url

      video.play().catch(
        () => {}
      )

      return cleanup
    }

    if (
      !Hls.isSupported()
    ) {
      setError(true)
      return cleanup
    }

    hls =
      new Hls({
        lowLatencyMode:
          true,

        maxBufferLength:
          6,

        maxMaxBufferLength:
          12,

        backBufferLength:
          5,

        liveSyncDurationCount:
          2,

        liveMaxLatencyDurationCount:
          5,

        enableWorker: false
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
        video.play().catch(
          () => {}
        )
      }
    )

    hls.on(
      Hls.Events.ERROR,
      (
        _,
        data
      ) => {
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
