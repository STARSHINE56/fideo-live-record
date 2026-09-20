import { create } from 'zustand'
import localForage from 'localforage'

interface IDefaultSettingsStore {
  defaultSettingsConfig: IDefaultDefaultSettingsConfig
  setDefaultSettingsConfig: (
    config: IDefaultDefaultSettingsConfig
  ) => void
  initData: () => void
}

const DEFAULT_WEBDAV_URL =
  'https://pan.lansod.cn/dav'

const DEFAULT_SETTINGS:
  IDefaultDefaultSettingsConfig = {
  directory: '',
  lang: 'cn',
  xizhiKey: '',

  webdavEnabled:
    false,

  webdavUrl:
    DEFAULT_WEBDAV_URL,

  webdavUsername:
    '',

  webdavPassword:
    '',

  webdavRemoteRoot:
    '/',

  webdavDeleteAfterUpload:
    false,

  webdavRetryTimes:
    3
}

const isValidHttpUrl = (
  value: unknown
) => {
  if (
    typeof value !==
    'string'
  ) {
    return false
  }

  const trimmed =
    value.trim()

  if (
    !/^https?:\/\//i.test(
      trimmed
    )
  ) {
    return false
  }

  try {
    const url =
      new URL(
        trimmed
      )

    return Boolean(
      url.hostname
    )
  } catch {
    return false
  }
}

const normalizeString = (
  value: unknown,
  fallback = ''
) =>
  typeof value ===
  'string'
    ? value
    : fallback

const normalizeSettings = (
  saved: unknown
): IDefaultDefaultSettingsConfig => {
  const raw =
    saved &&
    typeof saved ===
      'object'
      ? saved as Record<
          string,
          unknown
        >
      : {}

  const webdavUrl =
    isValidHttpUrl(
      raw.webdavUrl
    )
      ? String(
          raw.webdavUrl
        ).trim()
      : DEFAULT_WEBDAV_URL

  const remoteRootRaw =
    normalizeString(
      raw.webdavRemoteRoot,
      '/'
    ).trim()

  const remoteRoot =
    remoteRootRaw
      ? remoteRootRaw
          .startsWith(
            '/'
          )
        ? remoteRootRaw
        : `/${remoteRootRaw}`
      : '/'

  const retryNumber =
    Number(
      raw.webdavRetryTimes
    )

  const retryTimes =
    Number.isFinite(
      retryNumber
    )
      ? Math.max(
          1,
          Math.min(
            10,
            Math.floor(
              retryNumber
            )
          )
        )
      : 3

  return {
    directory:
      normalizeString(
        raw.directory
      ),

    lang:
      raw.lang ===
      'en'
        ? 'en'
        : 'cn',

    xizhiKey:
      normalizeString(
        raw.xizhiKey
      ),

    webdavEnabled:
      typeof raw.webdavEnabled ===
      'boolean'
        ? raw.webdavEnabled
        : false,

    webdavUrl,

    webdavUsername:
      normalizeString(
        raw.webdavUsername
      ),

    webdavPassword:
      normalizeString(
        raw.webdavPassword
      ),

    webdavRemoteRoot:
      remoteRoot,

    webdavDeleteAfterUpload:
      typeof raw.webdavDeleteAfterUpload ===
      'boolean'
        ? raw.webdavDeleteAfterUpload
        : false,

    webdavRetryTimes:
      retryTimes
  }
}

export const useDefaultSettingsStore =
  create<IDefaultSettingsStore>(
    (set) => ({
      defaultSettingsConfig:
        DEFAULT_SETTINGS,

      initData:
        async () => {
          const saved =
            await localForage
              .getItem(
                'defaultSettingsConfig'
              )

          const normalized =
            normalizeSettings(
              saved
            )

          await localForage
            .setItem(
              'defaultSettingsConfig',
              normalized
            )

          set(() => ({
            defaultSettingsConfig:
              normalized
          }))
        },

      setDefaultSettingsConfig:
        (config) =>
          set(() => {
            const normalized =
              normalizeSettings(
                config
              )

            void localForage
              .setItem(
                'defaultSettingsConfig',
                normalized
              )

            return {
              defaultSettingsConfig:
                normalized
            }
          })
    })
  )
