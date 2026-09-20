import { create } from 'zustand'
import localForage from 'localforage'

interface IDefaultSettingsStore {
  defaultSettingsConfig: IDefaultDefaultSettingsConfig
  setDefaultSettingsConfig: (
    config: IDefaultDefaultSettingsConfig
  ) => void
  initData: () => void
}

const DEFAULT_SETTINGS:
  IDefaultDefaultSettingsConfig = {
  directory: '',
  lang: 'cn',
  xizhiKey: '',

  webdavEnabled:
    false,

  webdavUrl:
    'https://pan.lansod.cn/dav',

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

export const useDefaultSettingsStore =
  create<IDefaultSettingsStore>(
    (set) => ({
      defaultSettingsConfig:
        DEFAULT_SETTINGS,

      initData:
        async () => {
          const saved =
            await localForage
              .getItem<IDefaultDefaultSettingsConfig>(
                'defaultSettingsConfig'
              )

          if (
            saved
          ) {
            set(() => ({
              defaultSettingsConfig: {
                ...DEFAULT_SETTINGS,
                ...saved
              }
            }))
          }
        },

      setDefaultSettingsConfig:
        (config) =>
          set(() => {
            const next = {
              ...DEFAULT_SETTINGS,
              ...config
            }

            void localForage
              .setItem(
                'defaultSettingsConfig',
                next
              )

            return {
              defaultSettingsConfig:
                next
            }
          })
    })
  )
