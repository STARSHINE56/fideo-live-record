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

let playlistRequests = 0
let segmentRequests = 0
let segment404 = 0

function resetDiagnostics() {
  playlistRequests = 0
  segmentRequests = 0
  segment404 = 0
}

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
    // Ignore cleanup error.
  }

  previewDir = ''
}

function safeLog(
  message: string
) {
  console.log(
    `[preview] ${message}`
  )
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

    return false
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
    'Access-Control-Allow-Headers',
    '*'
  )

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, HEAD, OPTIONS'
  )

  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate'
  )

  res.setHeader(
    'Pragma',
    'no-cache'
  )

  fs.createReadStream(
    filePath
  ).pipe(res)

  return true
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

        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, HEAD, OPTIONS'
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

          res.setHeader(
            'Content-Type',
            'application/json'
          )

          res.end(
            JSON.stringify({
              running:
                process !== null,

              playlistRequests,
              segmentRequests,
              segment404
            })
          )

          return
        }

        if (
          reqUrl.pathname ===
          '/preview.m3u8'
        ) {
          playlistRequests +=
            1

          const ok =
            sendFile(
              path.join(
                previewDir,
                'preview.m3u8'
              ),
              res
            )

          safeLog(
            `playlist request #${playlistRequests}: ${
              ok
                ? '200'
                : '404'
            }`
          )

          return
        }

        if (
          /^\/segment-\d+\.ts$/i.test(
            reqUrl.pathname
          )
        ) {
          segmentRequests +=
            1

          const safeName =
            path.basename(
              reqUrl.pathname
            )

          const ok =
            sendFile(
              path.join(
                previewDir,
                safeName
              ),
              res
            )

          if (!ok) {
            segment404 +=
              1
          }

          safeLog(
            `segment request #${segmentRequests}: ${
              ok
                ? '200'
                : '404'
            }`
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
        (
          error: Error
        ) => {
          reject(
            error
          )
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

          safeLog(
            'local preview server started'
          )

          resolve()
        }
      )
    }
  )
}

function getPlaylistPath() {
  return path.join(
    previewDir,
    'preview.m3u8'
  )
}

function getSegmentCount() {
  if (
    !previewDir ||
    !fs.existsSync(
      previewDir
    )
  ) {
    return 0
  }

  try {
    return fs
      .readdirSync(
        previewDir
      )
      .filter(
        (
          name
        ) =>
          /^segment-\d+\.ts$/i.test(
            name
          )
      )
      .length
  } catch {
    return 0
  }
}

function inspectPlaylist() {
  const playlist =
    getPlaylistPath()

  if (
    !fs.existsSync(
      playlist
    )
  ) {
    return {
      exists:
        false,

      validSegments:
        false,

      count:
        0
    }
  }

  try {
    const text =
      fs.readFileSync(
        playlist,
        'utf8'
      )

    const lines =
      text
        .split(
          /\r?\n/
        )
        .map(
          (
            line
          ) =>
            line.trim()
        )
        .filter(
          Boolean
        )

    const mediaLines =
      lines.filter(
        (
          line
        ) =>
          !line.startsWith(
            '#'
          )
      )

    const validSegments =
      mediaLines.length >
        0 &&
      mediaLines.every(
        (
          line
        ) =>
          /^segment-\d+\.ts$/i.test(
            line
          )
      )

    return {
      exists:
        true,

      validSegments,

      count:
        mediaLines.length
    }
  } catch {
    return {
      exists:
        true,

      validSegments:
        false,

      count:
        0
    }
  }
}

async function waitForPreview(
  timeoutMs = 20000
) {
  const start =
    Date.now()

  while (
    Date.now() -
      start <
    timeoutMs
  ) {
    const playlist =
      inspectPlaylist()

    const segments =
      getSegmentCount()

    if (
      playlist.exists &&
      playlist.validSegments &&
      playlist.count >
        0 &&
      segments >
        0
    ) {
      safeLog(
        `playlist ready with ${playlist.count} media entries and ${segments} segment files`
      )

      return true
    }

    await new Promise(
      (
        resolve
      ) =>
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
      (
        resolve
      ) => {
        try {
          current.close(
            () =>
              resolve()
          )
        } catch {
          resolve()
        }
      }
    )
  }

  removePreviewDir()

  resetDiagnostics()
}

export async function startPreviewTranscoder(
  options: PreviewOptions
) {
  await stopPreviewTranscoder()

  resetDiagnostics()

  ensurePreviewDir()

  await ensureServer()

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
    '30',

    '-keyint_min',
    '30',

    '-sc_threshold',
    '0',

    '-b:v',
    '1600k',

    '-maxrate',
    '2000k',

    '-bufsize',
    '3200k',

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
    '6',

    '-hls_delete_threshold',
    '3',

    '-hls_flags',
    'delete_segments+omit_endlist+independent_segments',

    '-hls_segment_filename',
    'segment-%05d.ts',

    'preview.m3u8'
  )

  safeLog(
    'starting FFmpeg preview transcoder'
  )

  process =
    execa(
      ffmpeg.ffmpegPath,
      args,
      {
        cwd:
          previewDir
      }
    )

  process.on(
    'error',
    () => {
      safeLog(
        'FFmpeg process error'
      )

      process = null
    }
  )

  process.on(
    'exit',
    (
      code
    ) => {
      safeLog(
        `FFmpeg exited with code ${String(
          code
        )}`
      )
    }
  )

  process
    .stderr
    ?.on(
      'data',
      (
        chunk
      ) => {
        const text =
          String(
            chunk
          )

        const sanitized =
          text
            .replace(
              /https?:\/\/\S+/gi,
              '[url]'
            )
            .replace(
              /Cookie:\s*[^\r\n]+/gi,
              'Cookie: [redacted]'
            )

        if (
          sanitized.trim()
        ) {
          safeLog(
            `ffmpeg: ${sanitized
              .trim()
              .slice(
                0,
                500
              )}`
          )
        }
      }
    )

  const ready =
    await waitForPreview()

  if (!ready) {
    const playlist =
      inspectPlaylist()

    const segments =
      getSegmentCount()

    safeLog(
      `preview startup timeout: playlist=${String(
        playlist.exists
      )}, validSegments=${String(
        playlist.validSegments
      )}, mediaEntries=${playlist.count}, segmentFiles=${segments}`
    )

    await stopPreviewTranscoder()

    throw new Error(
      'Preview stream failed to become ready'
    )
  }

  return {
    url:
      `http://127.0.0.1:${serverPort}/preview.m3u8`
  }
}
