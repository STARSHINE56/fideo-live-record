import * as http from 'node:http'
import * as https from 'node:https'

import type {
  IncomingMessage,
  Server,
  ServerResponse
} from 'node:http'

interface PreviewContext {
  roomUrl: string
  cookie?: string
}

let server: Server | null =
  null

let serverPort = 0

let context:
  | PreviewContext
  | null = null

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/123.0.0.0 Safari/537.36'

function getLocalUrl(
  target: string
) {
  return (
    `http://127.0.0.1:${serverPort}` +
    `/proxy?url=${encodeURIComponent(
      target
    )}`
  )
}

function resolveUrl(
  value: string,
  base: string
) {
  try {
    return new URL(
      value,
      base
    ).toString()
  } catch {
    return value
  }
}

function rewritePlaylist(
  text: string,
  upstreamUrl: string
) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed =
        line.trim()

      if (!trimmed) {
        return line
      }

      if (
        trimmed.startsWith('#')
      ) {
        return line.replace(
          /URI="([^"]+)"/g,
          (
            _,
            value: string
          ) => {
            const resolved =
              resolveUrl(
                value,
                upstreamUrl
              )

            return (
              `URI="${getLocalUrl(
                resolved
              )}"`
            )
          }
        )
      }

      const resolved =
        resolveUrl(
          trimmed,
          upstreamUrl
        )

      return getLocalUrl(
        resolved
      )
    })
    .join('\n')
}

function requestUpstream(
  targetUrl: string,
  clientReq: IncomingMessage,
  clientRes: ServerResponse,
  redirectCount = 0
) {
  let target: URL

  try {
    target =
      new URL(
        targetUrl
      )
  } catch {
    clientRes.statusCode =
      400

    clientRes.end(
      'Invalid URL'
    )

    return
  }

  if (
    target.protocol !==
      'http:' &&
    target.protocol !==
      'https:'
  ) {
    clientRes.statusCode =
      400

    clientRes.end(
      'Unsupported protocol'
    )

    return
  }

  const requester =
    target.protocol ===
      'https:'
      ? https
      : http

  const headers:
    Record<string, string> = {
      'User-Agent':
        USER_AGENT,

      Accept:
        '*/*',

      Referer:
        context?.roomUrl ||
        'https://live.douyin.com/'
    }

  if (
    context?.cookie
  ) {
    headers.Cookie =
      context.cookie
  }

  if (
    typeof clientReq
      .headers.range ===
    'string'
  ) {
    headers.Range =
      clientReq.headers.range
  }

  const upstreamReq =
    requester.request(
      target,
      {
        method:
          'GET',

        headers
      },

      (upstreamRes) => {
        const status =
          upstreamRes
            .statusCode ||
          500

        const location =
          upstreamRes
            .headers
            .location

        if (
          status >= 300 &&
          status < 400 &&
          location &&
          redirectCount < 5
        ) {
          const nextUrl =
            resolveUrl(
              location,
              target.toString()
            )

          upstreamRes.resume()

          requestUpstream(
            nextUrl,
            clientReq,
            clientRes,
            redirectCount + 1
          )

          return
        }

        const contentType =
          String(
            upstreamRes
              .headers[
              'content-type'
            ] ||
              ''
          )

        const isHls =
          contentType
            .toLowerCase()
            .includes(
              'mpegurl'
            ) ||
          /\.m3u8(?:\?|$)/i.test(
            target.toString()
          )

        clientRes.statusCode =
          status

        clientRes.setHeader(
          'Access-Control-Allow-Origin',
          '*'
        )

        clientRes.setHeader(
          'Access-Control-Allow-Headers',
          '*'
        )

        clientRes.setHeader(
          'Access-Control-Allow-Methods',
          'GET, HEAD, OPTIONS'
        )

        clientRes.setHeader(
          'Cache-Control',
          'no-store'
        )

        if (contentType) {
          clientRes.setHeader(
            'Content-Type',
            contentType
          )
        }

        const acceptRanges =
          upstreamRes
            .headers[
            'accept-ranges'
          ]

        if (acceptRanges) {
          clientRes.setHeader(
            'Accept-Ranges',
            acceptRanges
          )
        }

        const contentRange =
          upstreamRes
            .headers[
            'content-range'
          ]

        if (contentRange) {
          clientRes.setHeader(
            'Content-Range',
            contentRange
          )
        }

        if (!isHls) {
          const contentLength =
            upstreamRes
              .headers[
              'content-length'
            ]

          if (
            contentLength
          ) {
            clientRes.setHeader(
              'Content-Length',
              contentLength
            )
          }

          upstreamRes.pipe(
            clientRes
          )

          clientRes.on(
            'close',
            () => {
              upstreamReq.destroy()
              upstreamRes.destroy()
            }
          )

          return
        }

        const chunks:
          Buffer[] = []

        upstreamRes.on(
          'data',
          (chunk) => {
            chunks.push(
              Buffer.isBuffer(
                chunk
              )
                ? chunk
                : Buffer.from(
                    chunk
                  )
            )
          }
        )

        upstreamRes.on(
          'end',
          () => {
            if (
              clientRes
                .writableEnded
            ) {
              return
            }

            const text =
              Buffer.concat(
                chunks
              ).toString(
                'utf8'
              )

            const rewritten =
              rewritePlaylist(
                text,
                target.toString()
              )

            clientRes.end(
              rewritten
            )
          }
        )
      }
    )

  upstreamReq.setTimeout(
    20000,
    () => {
      upstreamReq.destroy(
        new Error(
          'Preview upstream timeout'
        )
      )
    }
  )

  upstreamReq.on(
    'error',
    () => {
      if (
        !clientRes
          .headersSent
      ) {
        clientRes.statusCode =
          502
      }

      if (
        !clientRes
          .writableEnded
      ) {
        clientRes.end(
          'Preview proxy error'
        )
      }
    }
  )

  upstreamReq.end()
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
          reqUrl.pathname !==
          '/proxy'
        ) {
          res.statusCode =
            404

          res.end(
            'Not Found'
          )

          return
        }

        const target =
          reqUrl
            .searchParams
            .get(
              'url'
            )

        if (!target) {
          res.statusCode =
            400

          res.end(
            'Missing URL'
          )

          return
        }

        requestUpstream(
          target,
          req,
          res
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
                'Unable to start preview proxy'
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

export async function startPreviewProxy(
  info: {
    streamUrl: string
    roomUrl: string
    cookie?: string
  }
) {
  context = {
    roomUrl:
      info.roomUrl,

    cookie:
      info.cookie
  }

  await ensureServer()

  return {
    url:
      getLocalUrl(
        info.streamUrl
      )
  }
}

export async function stopPreviewProxy() {
  context = null

  if (!server) {
    return
  }

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
