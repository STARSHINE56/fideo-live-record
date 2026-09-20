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
  if (!cookie) {
    return ''
  }

  const match =
    String(cookie).match(
      /(?:^|;\s*)ttwid=([^;]+)/
    )

  if (!match?.[1]) {
    return ''
  }

  return `ttwid=${match[1]}`
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
  others = {},
  signed = false
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

  if (signed) {
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
  }

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



function normalizeQualityName(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toUpperCase()
}

function getQualityRank(
  quality
) {
  const value =
    normalizeQualityName(
      quality
    )

  if (
    value.includes(
      'ORIGION'
    ) ||
    value.includes(
      'ORIGIN'
    ) ||
    value.includes(
      'ORIGINAL'
    ) ||
    value.includes(
      'SOURCE'
    )
  ) {
    return 10000
  }

  if (
    value.includes(
      'UHD'
    ) ||
    value.includes(
      '4K'
    )
  ) {
    return 9500
  }

  if (
    value.includes(
      'FULL_HD'
    ) ||
    value.includes(
      'FULLHD'
    ) ||
    value.includes(
      'FHD'
    )
  ) {
    return 9000
  }

  if (
    value.includes(
      'HD'
    )
  ) {
    return 8000
  }

  if (
    value.includes(
      'SD3'
    )
  ) {
    return 7000
  }

  if (
    value.includes(
      'SD2'
    )
  ) {
    return 6000
  }

  if (
    value.includes(
      'SD1'
    )
  ) {
    return 5000
  }

  if (
    value.includes(
      'LD'
    )
  ) {
    return 3000
  }

  return 0
}

function parseResolutionValue(
  value
) {
  if (
    value == null
  ) {
    return 0
  }

  if (
    typeof value ===
    'object'
  ) {
    const width =
      Number(
        value.width ||
        value.w ||
        0
      )

    const height =
      Number(
        value.height ||
        value.h ||
        0
      )

    if (
      width > 0 &&
      height > 0
    ) {
      return (
        width *
        height
      )
    }

    let best = 0

    for (
      const child of
      Object.values(
        value
      )
    ) {
      best =
        Math.max(
          best,
          parseResolutionValue(
            child
          )
        )
    }

    return best
  }

  const text =
    String(value)

  const match =
    text.match(
      /(\d{2,5})\s*[xX*×]\s*(\d{2,5})/
    )

  if (!match) {
    return 0
  }

  const width =
    Number(match[1])

  const height =
    Number(match[2])

  if (
    width <= 0 ||
    height <= 0
  ) {
    return 0
  }

  return (
    width *
    height
  )
}

function parseSdkParams(
  main
) {
  try {
    const raw =
      main?.sdk_params

    if (!raw) {
      return {}
    }

    return (
      typeof raw ===
        'string'
        ? JSON.parse(raw)
        : raw
    )
  } catch {
    return {}
  }
}

function getStreamBitrate(
  main
) {
  const params =
    parseSdkParams(
      main
    )

  const values = [
    params?.vbitrate,
    params?.bitrate,
    params?.video_bitrate,
    main?.vbitrate,
    main?.bitrate
  ]

  for (
    const item of values
  ) {
    const value =
      Number(item)

    if (
      Number.isFinite(
        value
      ) &&
      value > 0
    ) {
      return value
    }
  }

  return 0
}

function getStreamResolution(
  main
) {
  const params =
    parseSdkParams(
      main
    )

  const candidates = [
    params?.candidate_resolution,
    params?.default_resolution,
    params?.resolution,
    params?.video_resolution,
    params?.resolution_name,
    main?.candidate_resolution,
    main?.default_resolution,
    main?.resolution
  ]

  let best = 0

  for (
    const candidate of
    candidates
  ) {
    best =
      Math.max(
        best,
        parseResolutionValue(
          candidate
        )
      )
  }

  return best
}

function collectMainStreamCandidates(
  streamData
) {
  const result = []

  if (!streamData) {
    return result
  }

  try {
    const parsed =
      typeof streamData ===
        'string'
        ? JSON.parse(
            streamData
          )
        : streamData

    const data =
      parsed?.data || {}

    for (
      const [
        quality,
        streamInfo
      ] of Object.entries(
        data
      )
    ) {
      const main =
        streamInfo?.main

      if (!main) {
        continue
      }

      const bitrate =
        getStreamBitrate(
          main
        )

      const resolution =
        getStreamResolution(
          main
        )

      const rank =
        getQualityRank(
          quality
        )

      if (main.flv) {
        result.push({
          url:
            main.flv,

          type:
            'flv',

          quality,

          rank,

          resolution,

          bitrate
        })
      }

      if (main.hls) {
        result.push({
          url:
            main.hls,

          type:
            'hls',

          quality,

          rank,

          resolution,

          bitrate
        })
      }
    }
  } catch {
    // Ignore malformed stream data.
  }

  return result
}

function collectDesktopStreams(
  room
) {
  const streamUrl =
    room?.stream_url

  if (!streamUrl) {
    return []
  }

  const candidates = []
  const seen =
    new Set()

  const addCandidate =
    (candidate) => {
      const url =
        candidate?.url

      if (
        !url ||
        seen.has(url)
      ) {
        return
      }

      seen.add(url)

      const quality =
        candidate.quality ||
        ''

      candidates.push({
        url,

        type:
          candidate.type ||
          'unknown',

        quality,

        rank:
          Number(
            candidate.rank ??
            getQualityRank(
              quality
            )
          ),

        resolution:
          Number(
            candidate.resolution ||
            0
          ),

        bitrate:
          Number(
            candidate.bitrate ||
            0
          )
      })
    }

  const addList =
    (items) => {
      for (
        const item of items
      ) {
        addCandidate(
          item
        )
      }
    }

  const pullDatas =
    streamUrl.pull_datas

  if (pullDatas) {
    for (
      const item of
      Object.values(
        pullDatas
      )
    ) {
      addList(
        collectMainStreamCandidates(
          item?.stream_data
        )
      )
    }
  }

  const coreData =
    streamUrl
      ?.live_core_sdk_data
      ?.pull_data
      ?.stream_data

  addList(
    collectMainStreamCandidates(
      coreData
    )
  )

  const flvMap =
    streamUrl
      ?.flv_pull_url

  if (flvMap) {
    for (
      const [
        quality,
        url
      ] of Object.entries(
        flvMap
      )
    ) {
      addCandidate({
        url,

        type:
          'flv',

        quality,

        rank:
          getQualityRank(
            quality
          ),

        resolution:
          0,

        bitrate:
          0
      })
    }
  }

  const hlsMap =
    streamUrl
      ?.hls_pull_url_map

  if (hlsMap) {
    for (
      const [
        quality,
        url
      ] of Object.entries(
        hlsMap
      )
    ) {
      addCandidate({
        url,

        type:
          'hls',

        quality,

        rank:
          getQualityRank(
            quality
          ),

        resolution:
          0,

        bitrate:
          0
      })
    }
  }

  candidates.sort(
    (a, b) => {
      if (
        b.rank !==
        a.rank
      ) {
        return (
          b.rank -
          a.rank
        )
      }

      if (
        b.resolution !==
        a.resolution
      ) {
        return (
          b.resolution -
          a.resolution
        )
      }

      if (
        b.bitrate !==
        a.bitrate
      ) {
        return (
          b.bitrate -
          a.bitrate
        )
      }

      if (
        a.type ===
          'flv' &&
        b.type !==
          'flv'
      ) {
        return -1
      }

      if (
        b.type ===
          'flv' &&
        a.type !==
          'flv'
      ) {
        return 1
      }

      return 0
    }
  )

  if (
    candidates.length > 0
  ) {
    const best =
      candidates[0]

    log(
      'Douyin best stream:',
      {
        quality:
          best.quality,

        type:
          best.type,

        rank:
          best.rank,

        resolution:
          best.resolution,

        bitrate:
          best.bitrate
      }
    )
  }

  return candidates.map(
    (item) =>
      item.url
  )
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


async function resolveDouyinLiveUrl(
  roomUrl,
  others = {}
) {
  const {
    proxy
  } = others

  let input

  try {
    input =
      new URL(roomUrl)
  } catch {
    throw new Error(
      'DOUYIN_INVALID_URL'
    )
  }

  if (
    input.hostname ===
    'live.douyin.com'
  ) {
    const roomId =
      input.pathname
        .split('/')
        .filter(Boolean)
        .pop()

    if (
      roomId &&
      /^\d+$/.test(roomId)
    ) {
      return (
        'https://live.douyin.com/' +
        roomId
      )
    }

    throw new Error(
      'DOUYIN_INVALID_ROOM_ID'
    )
  }

  const allowedHosts = [
    'v.douyin.com',
    'www.douyin.com',
    'douyin.com',
    'webcast.amemv.com'
  ]

  if (
    !allowedHosts.includes(
      input.hostname
    )
  ) {
    throw new Error(
      'DOUYIN_UNSUPPORTED_URL'
    )
  }

  const response =
    await request(
      roomUrl,
      {
        headers: {
          'User-Agent':
            PC_USER_AGENT
        },
        proxy
      }
    )

  const finalUrl =
    response
      ?.request
      ?.res
      ?.responseUrl ||
    roomUrl

  try {
    const finalParsed =
      new URL(finalUrl)

    if (
      finalParsed.hostname ===
      'live.douyin.com'
    ) {
      const roomId =
        finalParsed.pathname
          .split('/')
          .filter(Boolean)
          .pop()

      if (
        roomId &&
        /^\d+$/.test(roomId)
      ) {
        return (
          'https://live.douyin.com/' +
          roomId
        )
      }
    }
  } catch {
    // Continue to HTML parsing.
  }

  const html =
    typeof response.data ===
      'string'
      ? response.data
      : JSON.stringify(
          response.data || {}
        )

  const patterns = [
    /webRid[^0-9]{0,80}(\d{5,})/,
    /web_rid[^0-9]{0,80}(\d{5,})/,
    /"web_rid"\s*:\s*"(\d{5,})"/,
    /"webRid"\s*:\s*"(\d{5,})"/
  ]

  for (
    const pattern of patterns
  ) {
    const match =
      html.match(pattern)

    if (match?.[1]) {
      return (
        'https://live.douyin.com/' +
        match[1]
      )
    }
  }

  throw new Error(
    'DOUYIN_RESOLVE_ROOM_FAILED'
  )
}



function getDouyinProfileSecUid(
  inputUrl
) {
  try {
    const url =
      new URL(
        inputUrl
      )

    const host =
      url.hostname
        .toLowerCase()

    if (
      host !== 'www.douyin.com' &&
      host !== 'douyin.com'
    ) {
      return ''
    }

    const parts =
      url.pathname
        .split('/')
        .filter(Boolean)

    if (
      parts[0] !== 'user' ||
      !parts[1]
    ) {
      return ''
    }

    return decodeURIComponent(
      parts[1]
    )
  } catch {
    return ''
  }
}


function parseDouyinJson(
  value
) {
  if (!value) {
    return null
  }

  if (
    typeof value ===
    'object'
  ) {
    return value
  }

  if (
    typeof value !==
    'string'
  ) {
    return null
  }

  try {
    return JSON.parse(
      value
    )
  } catch {
    return null
  }
}


function findDouyinNestedValue(
  value,
  keys,
  depth = 0
) {
  if (
    !value ||
    typeof value !==
      'object' ||
    depth > 8
  ) {
    return undefined
  }

  for (
    const key of keys
  ) {
    const result =
      value[key]

    if (
      result !== undefined &&
      result !== null &&
      result !== ''
    ) {
      return result
    }
  }

  for (
    const child of
    Object.values(
      value
    )
  ) {
    if (
      !child ||
      typeof child !==
        'object'
    ) {
      continue
    }

    const found =
      findDouyinNestedValue(
        child,
        keys,
        depth + 1
      )

    if (
      found !== undefined
    ) {
      return found
    }
  }

  return undefined
}


const DOUYIN_PROFILE_CACHE_MS =
  45 * 1000

const douyinProfileCache =
  new Map()


function buildDouyinProfileParams(
  secUid
) {
  return new URLSearchParams({
    device_platform:
      'webapp',

    aid:
      '6383',

    channel:
      'channel_pc_web',

    pc_client_type:
      '1',

    version_code:
      '190500',

    version_name:
      '19.5.0',

    cookie_enabled:
      'true',

    screen_width:
      '1920',

    screen_height:
      '1080',

    browser_language:
      'zh-CN',

    browser_platform:
      'Win32',

    browser_name:
      'Chrome',

    browser_version:
      '123.0.0.0',

    browser_online:
      'true',

    engine_name:
      'Blink',

    engine_version:
      '123.0.0.0',

    os_name:
      'Windows',

    os_version:
      '10',

    cpu_core_num:
      '8',

    device_memory:
      '8',

    platform:
      'PC',

    downlink:
      '10',

    effective_type:
      '4g',

    round_trip_time:
      '50',

    sec_user_id:
      secUid,

    msToken:
      ''
  })
}


async function getDouyinAnchorProfile(
  secUid,
  others = {}
) {
  const {
    proxy,
    cookie
  } =
    others

  if (!secUid) {
    throw new Error(
      'DOUYIN_SEC_UID_EMPTY'
    )
  }

  const cached =
    douyinProfileCache.get(
      secUid
    )

  if (
    cached &&
    Date.now() -
      cached.time <
      DOUYIN_PROFILE_CACHE_MS
  ) {
    return cached.profile
  }

  const profileUrl =
    'https://www.douyin.com/user/' +
    encodeURIComponent(
      secUid
    )

  const headers = {
    Referer:
      profileUrl,

    'User-Agent':
      PC_USER_AGENT
  }

  const finalCookie =
    cookie ||
    ''

  const params =
    buildDouyinProfileParams(
      secUid
    )

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
    'https://www.douyin.com' +
    '/aweme/v1/web/user/profile/other/?' +
    params.toString()

  const response =
    await request(
      apiUrl,
      {
        headers: {
          ...headers,

          ...(finalCookie
            ? {
                cookie:
                  finalCookie
              }
            : {})
        },

        proxy
      }
    )

  const body =
    response?.data

  if (!body) {
    throw new Error(
      'DOUYIN_PROFILE_RESPONSE_EMPTY'
    )
  }

  const user =
    body?.user ||
    body?.data?.user ||
    body?.user_info ||
    body?.data?.user_info ||
    body?.data ||
    {}

  const roomData =
    parseDouyinJson(
      user?.room_data
    ) ||
    parseDouyinJson(
      body?.room_data
    ) ||
    parseDouyinJson(
      body?.data?.room_data
    ) ||
    {}

  const nickname =
    user?.nickname ||
    findDouyinNestedValue(
      user,
      [
        'nickname',
        'nick_name'
      ]
    ) ||
    ''

  const liveStatus =
    Number(
      user?.live_status ??
      user?.liveStatus ??
      findDouyinNestedValue(
        user,
        [
          'live_status',
          'liveStatus'
        ]
      ) ??
      0
    )

  const roomStatus =
    Number(
      roomData?.status ??
      roomData?.room?.status ??
      findDouyinNestedValue(
        roomData,
        [
          'status'
        ]
      ) ??
      0
    )

  const rawWebRid =
    findDouyinNestedValue(
      roomData,
      [
        'web_rid',
        'webRid'
      ]
    ) ??
    findDouyinNestedValue(
      user,
      [
        'web_rid',
        'webRid'
      ]
    )

  const webRid =
    rawWebRid
      ? String(
          rawWebRid
        )
      : ''

  const live =
    liveStatus === 1 ||
    liveStatus === 2 ||
    roomStatus === 2

  log(
    'Douyin anchor status:',
    {
      nickname,
      live,
      hasWebRid:
        Boolean(
          webRid
        )
    }
  )

  const profile = {
    nickname,
    live,
    webRid,
    secUid
  }

  douyinProfileCache.set(
    secUid,
    {
      time:
        Date.now(),

      profile
    }
  )

  return profile
}


async function resolveDouyinTarget(
  inputUrl,
  others = {}
) {
  let currentUrl =
    inputUrl

  let parsed

  try {
    parsed =
      new URL(
        currentUrl
      )
  } catch {
    throw new Error(
      'DOUYIN_INVALID_URL'
    )
  }

  if (
    parsed.hostname ===
    'v.douyin.com'
  ) {
    const response =
      await request(
        currentUrl,
        {
          headers: {
            'User-Agent':
              PC_USER_AGENT
          },

          proxy:
            others.proxy
        }
      )

    currentUrl =
      response
        ?.request
        ?.res
        ?.responseUrl ||
      currentUrl

    parsed =
      new URL(
        currentUrl
      )
  }

  const secUid =
    getDouyinProfileSecUid(
      currentUrl
    )

  if (secUid) {
    return {
      type:
        'anchor',

      secUid,

      sourceUrl:
        currentUrl
    }
  }

  const liveRoomUrl =
    await resolveDouyinLiveUrl(
      currentUrl,
      others
    )

  return {
    type:
      'room',

    roomUrl:
      liveRoomUrl,

    sourceUrl:
      currentUrl
  }
}


async function resolveDouyinAnchorLiveRoom(
  secUid,
  others = {}
) {
  const profile =
    await getDouyinAnchorProfile(
      secUid,
      others
    )

  if (
    !profile.live ||
    !profile.webRid
  ) {
    return {
      code:
        CRAWLER_ERROR_CODE.NOT_URLS,

      profile
    }
  }

  return {
    code:
      SUCCESS_CODE,

    profile,

    roomUrl:
      'https://live.douyin.com/' +
      profile.webRid
  }
}


async function getDesktopRoomWithFallback(
  roomUrl,
  others = {}
) {
  let unsignedError = null

  try {
    const data =
      await getDesktopData(
        roomUrl,
        others,
        false
      )

    const room =
      getDesktopRoom(data)

    if (
      room.status !== 2
    ) {
      return room
    }

    const urls =
      collectDesktopStreams(
        room
      )

    if (
      urls.length > 0
    ) {
      log(
        'Douyin unsigned parser success'
      )

      return room
    }

    unsignedError =
      new Error(
        'DOUYIN_UNSIGNED_STREAM_EMPTY'
      )
  } catch (error) {
    unsignedError =
      error

    log(
      'Douyin unsigned parser failed:',
      error?.message
    )
  }

  try {
    const data =
      await getDesktopData(
        roomUrl,
        others,
        true
      )

    const room =
      getDesktopRoom(data)

    if (
      room.status !== 2
    ) {
      return room
    }

    const urls =
      collectDesktopStreams(
        room
      )

    if (
      urls.length === 0
    ) {
      throw new Error(
        'DOUYIN_SIGNED_STREAM_EMPTY'
      )
    }

    log(
      'Douyin A-Bogus parser success'
    )

    return room
  } catch (signedError) {
    log(
      'Douyin A-Bogus parser failed:',
      signedError?.message
    )

    throw new Error(
      'DOUYIN_WEB_PARSE_FAILED: ' +
      'unsigned=' +
      String(
        unsignedError
          ?.message ||
        unsignedError ||
        'unknown'
      ) +
      '; signed=' +
      String(
        signedError
          ?.message ||
        signedError ||
        'unknown'
      )
    )
  }
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

  const room =
    await getDesktopRoomWithFallback(
      roomUrl,
      others
    )

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
  const target =
    await resolveDouyinTarget(
      roomUrl,
      others
    )

  if (
    target.type ===
    'anchor'
  ) {
    const anchor =
      await resolveDouyinAnchorLiveRoom(
        target.secUid,
        others
      )

    if (
      anchor.code !==
      SUCCESS_CODE
    ) {
      return {
        code:
          CRAWLER_ERROR_CODE.NOT_URLS
      }
    }

    return await baseGetDesktopDouYinLiveUrlsPlugin(
      anchor.roomUrl,
      others
    )
  }

  return await baseGetDesktopDouYinLiveUrlsPlugin(
    target.roomUrl,
    others
  )
}



async function baseGetDouYinRoomInfoPlugin(
  roomUrl,
  others = {}
) {
  const target =
    await resolveDouyinTarget(
      roomUrl,
      others
    )

  if (
    target.type ===
    'anchor'
  ) {
    const profile =
      await getDouyinAnchorProfile(
        target.secUid,
        others
      )

    return {
      code:
        SUCCESS_CODE,

      roomInfo: {
        name:
          profile.nickname ||
          ''
      }
    }
  }

  const room =
    await getDesktopRoomWithFallback(
      target.roomUrl,
      others
    )

  return {
    code:
      SUCCESS_CODE,

    roomInfo: {
      name:
        room
          ?.owner
          ?.nickname ||
        ''
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
