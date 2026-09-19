import fs from 'node:fs'
import path from 'node:path'
import http, {
  type Server,
  type ServerResponse
} from 'node:http'
import os from 'node:os'

import execa, {
  type ExecaChildProcess
} from 'execa'

import ffmpeg from './ffmpeg'

interface PreviewOptions {
  streamUrl: string
  roomUrl: string
  cookie?: string
  proxy?: string
}

let server:
  | Server
  | null = null

let serverPort = 0

let process:
  | ExecaChildProcess
  | null = null

let previewDir = ''

function ensurePreviewDir() {
  if (
    previewDir &&
    fs.existsSync(
      previewDir
    )
  ) {
    return
  }

  previewDir =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        'fideo-preview-'
      )
    )
}

function removePreviewDir() {
  if (!previewDir) {
    return
  }

  try {
    fs.rmSync(
      previewDir,
      {
        recursive: true,
        force: true
      }
    )
  } catch {
    // Ignore cleanup errors.
  }

  previewDir = ''
}

function sendFile(
  filePath: string,
  res: ServerResponse
) {
  if (
    !fs.existsSync(
      filePath
    )
  ) {
    res.statusCode =
      404

    res.end(
      'Not Found'
    )

    return
  }

  const ext =
    path.extname(
      filePath
    ).toLowerCase()

  if (
    ext === '.m3u8'
  ) {
    res.setHeader(
      'Content-Type',
      'application/vnd.apple.mpegurl'
    )
  } else if (
    ext === '.ts'
  ) {
    res.setHeader(
      'Content-Type',
      'video/mp2t'
    )
  } else {
    res.setHeader(
      'Content-Type',
      'application/octet-stream'
    )
  }

  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  )

  res.setHeader(
    'Cache-Control',
    'no-store'
  )

  fs.createReadStream(
    filePath
  ).pipe(res)
}

async function ensureServer() {
  if (
    server &&
    serverPort > 0
  ) {
    return
  }

  server =
    http.createServer(
      (
        req,
        res
      ) => {
        res.setHeader(
          'Access-Control-Allow-Origin',
          '*'
        )

        res.setHeader(
          'Access-Control-Allow-Headers',
          '*'
        )

        if (
          req.method ===
          'OPTIONS'
        ) {
          res.statusCode =
            204

          res.end()

          return
        }

        const reqUrl =
          new URL(
            req.url ||
              '/',

            'http://127.0.0.1'
          )

        if (
          reqUrl.pathname ===
          '/health'
        ) {
          res.statusCode =
            200

          res.end(
            'ok'
          )

          return
        }

        if (
          reqUrl.pathname ===
          '/preview.m3u8'
        ) {
          sendFile(
            path.join(
              previewDir,
              'preview.m3u8'
            ),
            res
          )

          return
        }

        if (
          reqUrl.pathname.startsWith(
            '/segment-'
          ) &&
          reqUrl.pathname.endsWith(
            '.ts'
          )
        ) {
          const safeName =
            path.basename(
              reqUrl.pathname
            )

          sendFile(
            path.join(
              previewDir,
              safeName
            ),
            res
          )

          return
        }

        res.statusCode =
          404

        res.end(
          'Not Found'
        )
      }
    )

  await new Promise<void>(
    (
      resolve,
      reject
    ) => {
      const current =
        server!

      const onError =
        (error: Error) => {
          reject(error)
        }

      current.once(
        'error',
        onError
      )

      current.listen(
        0,
        '127.0.0.1',
        () => {
          current.removeListener(
            'error',
            onError
          )

          const address =
            current.address()

          if (
            !address ||
            typeof address ===
              'string'
          ) {
            reject(
              new Error(
                'Unable to bind preview server'
              )
            )

            return
          }

          serverPort =
            address.port

          resolve()
        }
      )
    }
  )
}

async function waitForPlaylist(
  timeoutMs = 15000
) {
  const start =
    Date.now()

  const playlist =
    path.join(
      previewDir,
      'preview.m3u8'
    )

  while (
    Date.now() -
      start <
    timeoutMs
  ) {
    if (
      fs.existsSync(
        playlist
      )
    ) {
      const stat =
        fs.statSync(
          playlist
        )

      if (
        stat.size >
        20
      ) {
        return true
      }
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          250
        )
    )
  }

  return false
}

export async function stopPreviewTranscoder() {
  if (process) {
    try {
      process.kill(
        'SIGKILL'
      )
    } catch {
      // Ignore.
    }

    process = null
  }

  if (server) {
    const current =
      server

    server = null
    serverPort = 0

    try {
      const extended =
        current as Server & {
          closeAllConnections?: () => void
        }

      extended
        .closeAllConnections
        ?.()
    } catch {
      // Ignore.
    }

    await new Promise<void>(
      (resolve) => {
        try {
          current.close(
            () => resolve()
          )
        } catch {
          resolve()
        }
      }
    )
  }

  removePreviewDir()
}

export async function startPreviewTranscoder(
  options: PreviewOptions
) {
  await stopPreviewTranscoder()

  ensurePreviewDir()

  await ensureServer()

  const output =
    path.join(
      previewDir,
      'preview.m3u8'
    )

  const segment =
    path.join(
      previewDir,
      'segment-%05d.ts'
    )

  const args: string[] = [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-rw_timeout',
    '20000000',
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '5',

    '-headers',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36\r\n',

    '-headers',
    `Referer: ${options.roomUrl}\r\n`
  ]

  if (
    options.cookie
  ) {
    args.push(
      '-headers',
      `Cookie: ${options.cookie}\r\n`
    )
  }

  if (
    options.proxy
  ) {
    args.push(
      '-http_proxy',
      options.proxy
    )
  }

  args.push(
    '-i',
    options.streamUrl,

    '-map',
    '0:v:0',

    '-map',
    '0:a:0?',

    '-c:v',
    'libx264',

    '-preset',
    'veryfast',

    '-tune',
    'zerolatency',

    '-profile:v',
    'main',

    '-level',
    '4.1',

    '-pix_fmt',
    'yuv420p',

    '-r',
    '30',

    '-g',
    '60',

    '-keyint_min',
    '60',

    '-sc_threshold',
    '0',

    '-b:v',
    '1800k',

    '-maxrate',
    '2200k',

    '-bufsize',
    '3600k',

    '-c:a',
    'aac',

    '-b:a',
    '128k',

    '-ar',
    '48000',

    '-ac',
    '2',

    '-f',
    'hls',

    '-hls_time',
    '1',

    '-hls_list_size',
    '5',

    '-hls_delete_threshold',
    '2',

    '-hls_flags',
    'delete_segments+append_list+omit_endlist+independent_segments',

    '-hls_segment_filename',
    segment,

    output
  )

  process =
    execa(
      ffmpeg.ffmpegPath,
      args
    )

  process.on(
    'error',
    () => {
      process = null
    }
  )

  process
    .stderr
    ?.on(
      'data',
      () => {
        // Do not log URLs or cookies.
      }
    )

  const ready =
    await waitForPlaylist()

  if (!ready) {
    await stopPreviewTranscoder()

    throw new Error(
      'Preview stream failed to start'
    )
  }

  return {
    url:
      `http://127.0.0.1:${serverPort}/preview.m3u8`
  }
}
