import {
  CRAWLER_ERROR_CODE,
  ERROR_MESSAGE
} from '../../code'

import debug from 'debug'

const log =
  debug(
    'fideo-crawler-capture-error'
  )

export function captureError(fn) {
  return async function (...args) {
    const writeLog =
      args[
        args.length - 1
      ]

    const realArgs =
      args.slice(
        0,
        args.length - 1
      )

    try {
      const res =
        await fn.apply(
          this,
          realArgs
        )

      writeLog(
        'Fetch Success'
      )

      return res
    } catch (e) {
      const message =
        String(
          e?.message || e
        )

      writeLog(
        `Fetch Error: ${message}`
      )

      log(
        'error:',
        message
      )

      if (
        message ===
        ERROR_MESSAGE.INVALID_PROXY
      ) {
        return {
          code:
            CRAWLER_ERROR_CODE.INVALID_PROXY
        }
      }

      if (
        message.includes(
          'timeout'
        ) ||
        message.includes(
          'ECONNABORTED'
        )
      ) {
        return {
          code:
            CRAWLER_ERROR_CODE.TIMEOUT
        }
      }

      if (
        message.includes(
          '403'
        ) ||
        message.includes(
          'DOUYIN_RISK_CONTROL'
        ) ||
        message.includes(
          'risk control'
        )
      ) {
        return {
          code:
            CRAWLER_ERROR_CODE.FORBIDDEN
        }
      }

      if (
        message.includes(
          '429'
        )
      ) {
        return {
          code:
            CRAWLER_ERROR_CODE.REQUEST_TOO_FAST
        }
      }

      return {
        code:
          CRAWLER_ERROR_CODE.NOT_URLS
      }
    }
  }
}
