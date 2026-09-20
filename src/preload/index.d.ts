import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    socket: WebSocket
    electron: ElectronAPI
    api: {
      isDarwin: boolean
      selectDir: () => Promise<{ canceled: boolean; filePaths: string[] }>
      openLogsDir: () => void
      getLiveUrls: (info: {
        roomUrl: string
        title: string
        proxy?: string
        cookie?: string
      }) => Promise<{ code: number; liveUrls: string[] }>
      getRoomInfo: (info: {
        roomUrl: string
        proxy?: string
        cookie?: string
      }) => Promise<{ code: number; roomInfo: IRoomInfo }>
      navByDefaultBrowser: (url: string) => void

startStreamRecord: (streamConfig: string) => Promise<{ code: number }>
      stopStreamRecord: (title: string) => Promise<{ code: number }>
      showNotification: (title: string, body: string) => void
      minimizeWindow: () => void
      maxRestoreWindow: () => void
      closeWindow: () => void
      forceCloseWindow: () => void
      retryDownloadDep: () => void

      loginDouyin: () => Promise<{
        hasSession: boolean
        cookieCount: number
      }>

      logoutDouyin: () => Promise<{
        hasSession: boolean
        cookieCount: number
      }>

      getDouyinLoginStatus: () => Promise<{
        hasSession: boolean
        cookieCount: number
      }>

      testWebdav: (config: {
        url: string
        username: string
        password: string
        remoteRoot?: string
      }) => Promise<{
        success: boolean
        message: string
      }>

      uploadWebdav: (request: {
        url: string
        username: string
        password: string
        remoteRoot?: string
        streamerName: string
        files: IRecordedFile[]
        deleteAfterUpload?: boolean
        retryTimes?: number
      }) => Promise<{
        success: boolean
        results: Array<{
          path: string
          cloudName: string
          success: boolean
          deleted: boolean
          message?: string
        }>
      }>

      startFrpcProcess: (
        code: string
      ) => Promise<{
        status: boolean
        code?: string
        port?: number
      }>
      stopFrpcProcess: () => void

      onStreamRecordEnd: (
        callback: (
          id: string,
          code: number,
          errMsg?: string,
          files?: IRecordedFile[]
        ) => void
      ) => void
      onFFmpegProgressInfo: (callback: (info: IFfmpegProgressInfo) => void) => void
      onDownloadDepProgressInfo: (callback: (info: IDownloadDepProgressInfo) => void) => void
      onUserCloseWindow: (callback: () => void) => void
      onAppUpdate: (callback: () => void) => void
      onFrpcProcessError: (callback: (err: string) => void) => void
    }
  }
}
