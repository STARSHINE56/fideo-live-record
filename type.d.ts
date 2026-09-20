interface IRecordedFile {
  path: string
  cloudName: string
}

type CloudUploadStatus =
  | 'uploading'
  | 'success'
  | 'error'

interface IStreamConfig {
  id: string
  title: string
  roomUrl: string
  filename: string
  directory: string
  proxy?: string
  cookie?: string
  interval: number
  liveUrls?: string[]
  segmentTime?: string | ''
  line: string
  status: number
  convertToMP4: boolean
  detectResolution: boolean
  autoRecord: boolean
  cloudUploadStatus?: CloudUploadStatus
}

type Lang = 'en' | 'cn'

interface IDefaultDefaultSettingsConfig {
  directory: string
  lang: Lang
  xizhiKey?: string

  webdavEnabled?: boolean
  webdavUrl?: string
  webdavUsername?: string
  webdavPassword?: string
  webdavRemoteRoot?: string
  webdavDeleteAfterUpload?: boolean
  webdavRetryTimes?: number
}

type IFfmpegProgressInfo = Record<
  string,
  {
    targetSize: number
    timemark: string
  }
>

interface IDownloadDepProgressInfo {
  title: string
  showRetry: boolean
  downloading: boolean
  progress: number
}

interface IWebControlSetting {
  webControlPath: string
  enableWebControl: boolean
  email: string
}
