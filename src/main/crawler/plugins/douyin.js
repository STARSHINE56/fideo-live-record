import debug from 'debug'

import {
  request,
  MOBILE_USER_AGENT
} from '../base-request.js'

import {
  captureError
} from '../capture-error.js'

import {
  generateABogus
} from './douyin-abogus.js'

import {
  CRAWLER_ERROR_CODE,
  SUCCESS_CODE
} from '../../../code'

const log =
  debug('fideo-crawler-douyin')

const PC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/123.0.0.0 Safari/537.36'

function getCookieWithTtwid(cookie) {
  if (
    cookie &&
    cookie.includes('ttwid=')
  ) {
    return cookie
  }

  return ''
}

function joinSetCookies(...responses) {
  return responses
    .map((res) =>
      res?.headers?.get
        ? res.headers.get('set-cookie')
        : res?.headers?.['set-cookie']
    )
    .filter(Boolean)
    .flat()
    .join('; ')
}

function getDesktopRoomId(roomUrl) {
  const url =
    new URL(roomUrl)

  return url.pathname
    .split('/')
    .filter(Boolean)
    .pop()
}

function buildWebParams(roomId) {
  return new URLSearchParams({
    aid: '6383',
    app_name: 'douyin_web',
    live_id: '1',
    device_platform: 'web',
    language: 'zh-CN',
    browser_language: 'zh-CN',
    browser_platform: 'Win32',
    browser_name: 'Chrome',
    browser_version: '116.0.0.0',
    web_rid: roomId,
    is_need_double_stream: 'false',
    msToken: ''
  })
}

async function getDesktopData(
  roomUrl,
  others = {}
) {
  const {
    proxy,
    cookie
  } = others

  const roomId =
    getDesktopRoomId(roomUrl)

  if (!roomId) {
    throw new Error(
      'DOUYIN_INVALID_ROOM_ID'
    )
  }

  const baseUrl =
    'https://live.douyin.com/'

  const roomPageUrl =
    `${baseUrl}${roomId}`

  const commonHeaders = {
    Referer:
      'https://live.douyin.com/',
    'User-Agent':
      PC_USER_AGENT
  }

  const [
    baseResponse,
    roomResponse
  ] = await Promise.all([
    request(
      baseUrl,
      {
        headers: commonHeaders,
        proxy
      }
    ),
    request(
      roomPageUrl,
      {
        headers: commonHeaders,
        proxy
      }
    )
  ])

  const generatedCookies =
    joinSetCookies(
      baseResponse,
      roomResponse
    )

  const loginCookie =
    getCookieWithTtwid(cookie)

  const finalCookie = [
    generatedCookies,
    loginCookie
  ]
    .filter(Boolean)
    .join('; ')

  const params =
    buildWebParams(roomId)

  const query =
    params.toString()

  const aBogus =
    generateABogus(
      query,
      PC_USER_AGENT
    )

  params.set(
    'a_bogus',
    aBogus
  )

  const apiUrl =
    `${baseUrl}webcast/room/web/enter/?${params.toString()}`

  const response =
    await request(
      apiUrl,
      {
        headers: {
          ...commonHeaders,
          cookie: finalCookie
        },
        proxy
      }
    )

  const body =
    response.data

  if (!body?.data) {
    throw new Error(
      'DOUYIN_EMPTY_RESPONSE'
    )
  }

  if (
    body.data?.prompts &&
    !body.data?.data?.length
  ) {
    throw new Error(
      `DOUYIN_RISK_CONTROL:${body.data.prompts}`
    )
  }

  return body
}

async function resolveMobileLocation(
  roomUrl,
  cookie
) {
  const response =
    await fetch(
      roomUrl,
      {
        redirect: 'manual',
        headers: cookie
          ? {
              cookie
            }
          : undefined
      }
    )

  const location =
    response.headers.get(
      'location'
    )

  return location || roomUrl
}

async function getMobileData(
  roomUrl,
  others = {}
) {
  const {
    proxy,
    cookie
  } = others

  const finalUrl =
    await resolveMobileLocation(
      roomUrl,
      cookie
    )

  const url =
    new URL(finalUrl)

  const roomId =
    url.pathname
      .split('/')
      .filter(Boolean)
      .pop()

  const secUserId =
    url.searchParams.get(
      'sec_user_id'
    )

  if (!roomId) {
    throw new Error(
      'DOUYIN_INVALID_MOBILE_ROOM_ID'
    )
  }

  const params =
    new URLSearchParams({
      verifyFp:
        'verify_lxj5zv70_7szNlAB7_pxNY_48Vh_ALKF_GA1Uf3yteoOY',
      type_id: '0',
      live_id: '1',
      version_code: '99.99.99',
      app_id: '1128',
      room_id: roomId,
      sec_user_id:
        secUserId || '',
      is_need_double_stream:
        'true'
    })

  const query =
    params.toString()

  const aBogus =
    generateABogus(
      query,
      MOBILE_USER_AGENT
    )

  params.set(
    'a_bogus',
    aBogus
  )

  const response =
    await request(
      `https://webcast.amemv.com/webcast/room/reflow/info/?${params.toString()}`,
      {
        headers: {
          'User-Agent':
            MOBILE_USER_AGENT,
          cookie:
            cookie || ''
        },
        proxy
      }
    )

  return response.data
}

function pushUnique(
  list,
  value
) {
  if (
    value &&
    !list.includes(value)
  ) {
    list.push(value)
  }
}

function collectMainStreams(
  streamData
) {
  const urls = []

  if (!streamData) {
    return urls
  }

  try {
    const parsed =
      typeof streamData === 'string'
        ? JSON.parse(streamData)
        : streamData

    const data =
      parsed?.data || {}

    for (
      const quality of
      Object.values(data)
    ) {
      const main =
        quality?.main

      if (!main) {
        continue
      }

      pushUnique(
        urls,
        main.flv
      )

      pushUnique(
        urls,
        main.hls
      )
    }
  } catch {
    // ignore malformed stream data
  }

  return urls
}

function collectDesktopStreams(
  room
) {
  const urls = []

  const streamUrl =
    room?.stream_url

  if (!streamUrl) {
    return urls
  }

  const pullDatas =
    streamUrl.pull_datas

  if (pullDatas) {
    for (
      const item of
      Object.values(pullDatas)
    ) {
      const found =
        collectMainStreams(
          item?.stream_data
        )

      for (
        const url of found
      ) {
        pushUnique(
          urls,
          url
        )
      }
    }
  }

  const coreData =
    streamUrl
      ?.live_core_sdk_data
      ?.pull_data
      ?.stream_data

  for (
    const url of
    collectMainStreams(
      coreData
    )
  ) {
    pushUnique(
      urls,
      url
    )
  }

  const flvMap =
    streamUrl
      ?.flv_pull_url

  if (flvMap) {
    for (
      const url of
      Object.values(flvMap)
    ) {
      pushUnique(
        urls,
        url
      )
    }
  }

  const hlsMap =
    streamUrl
      ?.hls_pull_url_map

  if (hlsMap) {
    for (
      const url of
      Object.values(hlsMap)
    ) {
      pushUnique(
        urls,
        url
      )
    }
  }

  return urls
}

function getDesktopRoom(
  data
) {
  const room =
    data
      ?.data
      ?.data
      ?.[0]

  if (!room) {
    throw new Error(
      'DOUYIN_ROOM_DATA_EMPTY'
    )
  }

  return room
}

async function baseGetDesktopDouYinLiveUrlsPlugin(
  roomUrl,
  others = {}
) {
  const roomId =
    getDesktopRoomId(
      roomUrl
    )

  log(
    'roomId:',
    roomId
  )

  const data =
    await getDesktopData(
      roomUrl,
      others
    )

  const room =
    getDesktopRoom(data)

  if (
    room.status !== 2
  ) {
    return {
      code:
        CRAWLER_ERROR_CODE.NOT_URLS
    }
  }

  const liveUrls =
    collectDesktopStreams(
      room
    )

  if (
    liveUrls.length === 0
  ) {
    throw new Error(
      'DOUYIN_STREAM_URL_EMPTY'
    )
  }

  return {
    code: SUCCESS_CODE,
    liveUrls
  }
}

async function baseGetMobileDouYinLiveUrlsPlugin(
  roomUrl,
  others = {}
) {
  log(
    'roomUrl:',
    roomUrl
  )

  const data =
    await getMobileData(
      roomUrl,
      others
    )

  const room =
    data?.data?.room

  if (!room) {
    throw new Error(
      'DOUYIN_MOBILE_ROOM_EMPTY'
    )
  }

  if (
    room.status !== 2
  ) {
    return {
      code:
        CRAWLER_ERROR_CODE.NOT_URLS
    }
  }

  const liveUrls =
    collectDesktopStreams(
      room
    )

  if (
    liveUrls.length === 0
  ) {
    throw new Error(
      'DOUYIN_STREAM_URL_EMPTY'
    )
  }

  return {
    code: SUCCESS_CODE,
    liveUrls
  }
}

async function baseGetDouYinLiveUrlsPlugin(
  roomUrl,
  others = {}
) {
  const host =
    new URL(roomUrl).host

  if (
    host ===
    'live.douyin.com'
  ) {
    try {
      return await baseGetDesktopDouYinLiveUrlsPlugin(
        roomUrl,
        others
      )
    } catch (error) {
      log(
        'desktop parser failed:',
        error?.message
      )

      if (
        error?.message?.includes(
          '403'
        ) ||
        error?.message?.includes(
          'DOUYIN_RISK_CONTROL'
        )
      ) {
        throw error
      }

      return await baseGetMobileDouYinLiveUrlsPlugin(
        roomUrl,
        others
      )
    }
  }

  return await baseGetMobileDouYinLiveUrlsPlugin(
    roomUrl,
    others
  )
}

async function baseGetDouYinRoomInfoPlugin(
  roomUrl,
  others = {}
) {
  const host =
    new URL(roomUrl).host

  if (
    host ===
    'live.douyin.com'
  ) {
    const data =
      await getDesktopData(
        roomUrl,
        others
      )

    const room =
      getDesktopRoom(
        data
      )

    return {
      code: SUCCESS_CODE,
      roomInfo: {
        name:
          room
            ?.owner
            ?.nickname || ''
      }
    }
  }

  const data =
    await getMobileData(
      roomUrl,
      others
    )

  return {
    code: SUCCESS_CODE,
    roomInfo: {
      name:
        data
          ?.data
          ?.room
          ?.owner
          ?.nickname || ''
    }
  }
}

export const getDouYinLiveUrlsPlugin =
  captureError(
    baseGetDouYinLiveUrlsPlugin
  )

export const getDouYinRoomInfoPlugin =
  captureError(
    baseGetDouYinRoomInfoPlugin
  )
