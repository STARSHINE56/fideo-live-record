import { BrowserWindow, session } from 'electron'

const DOUYIN_PARTITION = 'persist:douyin-login'

let loginWindow: BrowserWindow | null = null

const douyinSession = () => session.fromPartition(DOUYIN_PARTITION)

const isDouyinCookieDomain = (domain: string) => {
  const normalized = domain.replace(/^\./, '').toLowerCase()

  return (
    normalized === 'douyin.com' ||
    normalized.endsWith('.douyin.com')
  )
}

export function isDouyinUrl(roomUrl: string) {
  try {
    const host = new URL(roomUrl).hostname.toLowerCase()

    return (
      host === 'douyin.com' ||
      host.endsWith('.douyin.com')
    )
  } catch {
    return false
  }
}

async function getDouyinCookies() {
  const cookies = await douyinSession().cookies.get({})

  return cookies.filter((cookie) =>
    isDouyinCookieDomain(cookie.domain ?? '')
  )
}

export async function getDouyinCookie() {
  const cookies = await getDouyinCookies()

  const cookieMap = new Map<string, string>()

  for (const cookie of cookies) {
    if (cookie.name && cookie.value) {
      cookieMap.set(cookie.name, cookie.value)
    }
  }

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

export async function getDouyinLoginStatus() {
  const cookies = await getDouyinCookies()

  const authCookieNames = new Set([
    'sessionid',
    'sessionid_ss',
    'sid_guard',
    'uid_tt',
    'uid_tt_ss'
  ])

  const hasSession =
    cookies.some((cookie) =>
      authCookieNames.has(cookie.name)
    ) ||
    cookies.length >= 5

  return {
    hasSession,
    cookieCount: cookies.length
  }
}

export async function openDouyinLoginWindow() {
  if (
    loginWindow &&
    !loginWindow.isDestroyed()
  ) {
    loginWindow.show()
    loginWindow.focus()

    return getDouyinLoginStatus()
  }

  return new Promise<{
    hasSession: boolean
    cookieCount: number
  }>((resolve) => {
    loginWindow = new BrowserWindow({
      width: 1100,
      height: 760,
      title: '登录抖音',
      autoHideMenuBar: true,
      webPreferences: {
        partition: DOUYIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    loginWindow.loadURL(
      'https://www.douyin.com/'
    )

    loginWindow.on(
      'closed',
      async () => {
        loginWindow = null

        resolve(
          await getDouyinLoginStatus()
        )
      }
    )
  })
}

export async function clearDouyinLogin() {
  if (
    loginWindow &&
    !loginWindow.isDestroyed()
  ) {
    loginWindow.close()
  }

  await douyinSession().clearStorageData()

  return {
    hasSession: false,
    cookieCount: 0
  }
}
