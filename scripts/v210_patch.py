from pathlib import Path
import re

ROOT = Path(".")


def read(path: str) -> str:
    return (ROOT / path).read_text(
        encoding="utf-8"
    )


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(
        parents=True,
        exist_ok=True
    )
    target.write_text(
        content,
        encoding="utf-8"
    )
    print("Written:", path)


def replace_once(
    path: str,
    old: str,
    new: str
) -> None:
    content = read(path)

    if new in content:
        print("Already patched:", path)
        return

    if old not in content:
        raise RuntimeError(
            f"Marker not found in {path}: "
            f"{old[:160]!r}"
        )

    write(
        path,
        content.replace(
            old,
            new,
            1
        )
    )


# ============================================================
# type.d.ts
# ============================================================

write(
    "type.d.ts",
    """interface IRecordedFile {
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
"""
)


# ============================================================
# WebDAV
# ============================================================

write(
    "src/main/webdav.ts",
    r"""import fs from 'node:fs'
import path from 'node:path'

import axios from 'axios'

export interface IWebdavConfig {
  url: string
  username: string
  password: string
  remoteRoot?: string
}

export interface IWebdavFile {
  path: string
  cloudName: string
}

export interface IWebdavUploadRequest
  extends IWebdavConfig {
  streamerName: string
  files: IWebdavFile[]
  deleteAfterUpload?: boolean
  retryTimes?: number
}

const authorization = (
  username: string,
  password: string
) =>
  `Basic ${Buffer.from(
    `${username}:${password}`,
    'utf8'
  ).toString('base64')}`

const cleanBaseUrl = (
  value: string
) =>
  value
    .trim()
    .replace(/\/+$/, '')

const splitRemotePath = (
  value?: string
) =>
  (value || '/')
    .split('/')
    .map(
      (item) =>
        item.trim()
    )
    .filter(Boolean)

const safeFolderName = (
  value: string
) => {
  const result =
    String(
      value || ''
    )
      .replace(
        /[<>:"/\\|?*\u0000-\u001f]/g,
        '_'
      )
      .replace(
        /[. ]+$/g,
        ''
      )
      .trim()

  return result || '主播'
}

const makeRemoteUrl = (
  base: string,
  segments: string[]
) => {
  const root =
    cleanBaseUrl(
      base
    )

  if (
    segments.length === 0
  ) {
    return `${root}/`
  }

  return (
    `${root}/` +
    segments
      .map(
        (item) =>
          encodeURIComponent(
            item
          )
      )
      .join('/')
  )
}

const requestOptions = (
  config: IWebdavConfig
) => ({
  headers: {
    Authorization:
      authorization(
        config.username,
        config.password
      )
  },

  timeout:
    60000,

  maxRedirects:
    0,

  validateStatus:
    () => true
})

const successStatus = (
  status: number
) =>
  status >= 200 &&
  status < 300

async function ensureFolders(
  config: IWebdavConfig,
  segments: string[]
) {
  const current:
    string[] = []

  for (
    const segment of
    segments
  ) {
    current.push(
      segment
    )

    const response =
      await axios.request({
        ...requestOptions(
          config
        ),

        method:
          'MKCOL',

        url:
          makeRemoteUrl(
            config.url,
            current
          )
      })

    if (
      ![
        200,
        201,
        204,
        405
      ].includes(
        response.status
      )
    ) {
      throw new Error(
        `创建云端目录失败 HTTP ${response.status}`
      )
    }
  }
}

async function getRemoteSize(
  config: IWebdavConfig,
  segments: string[]
): Promise<number> {
  const url =
    makeRemoteUrl(
      config.url,
      segments
    )

  const head =
    await axios.request({
      ...requestOptions(
        config
      ),

      method:
        'HEAD',

      url
    })

  if (
    successStatus(
      head.status
    )
  ) {
    const value =
      Number(
        head.headers[
          'content-length'
        ]
      )

    if (
      Number.isFinite(
        value
      ) &&
      value >= 0
    ) {
      return value
    }
  }

  const propfind =
    await axios.request({
      ...requestOptions(
        config
      ),

      method:
        'PROPFIND',

      url,

      headers: {
        ...requestOptions(
          config
        ).headers,

        Depth:
          '0'
      },

      responseType:
        'text'
    })

  if (
    propfind.status !==
      207 &&
    !successStatus(
      propfind.status
    )
  ) {
    return -1
  }

  const body =
    String(
      propfind.data ||
      ''
    )

  const match =
    body.match(
      /getcontentlength[^>]*>(\d+)</i
    )

  return match
    ? Number(
        match[1]
      )
    : -1
}

async function uploadBuffer(
  config: IWebdavConfig,
  segments: string[],
  data: Buffer
) {
  const response =
    await axios.request({
      ...requestOptions(
        config
      ),

      method:
        'PUT',

      url:
        makeRemoteUrl(
          config.url,
          segments
        ),

      data,

      headers: {
        ...requestOptions(
          config
        ).headers,

        'Content-Type':
          'application/octet-stream',

        'Content-Length':
          data.length
      },

      maxBodyLength:
        Infinity,

      maxContentLength:
        Infinity
    })

  if (
    !successStatus(
      response.status
    )
  ) {
    throw new Error(
      `上传失败 HTTP ${response.status}`
    )
  }
}

async function uploadFile(
  config: IWebdavConfig,
  localPath: string,
  segments: string[]
) {
  if (
    path.extname(
      localPath
    ).toLowerCase() !==
    '.mp4'
  ) {
    throw new Error(
      '只允许上传最终 MP4 文件'
    )
  }

  const stat =
    await fs.promises.stat(
      localPath
    )

  if (
    !stat.isFile()
  ) {
    throw new Error(
      '录像文件不存在或无效'
    )
  }

  const response =
    await axios.request({
      ...requestOptions(
        config
      ),

      method:
        'PUT',

      url:
        makeRemoteUrl(
          config.url,
          segments
        ),

      data:
        fs.createReadStream(
          localPath
        ),

      headers: {
        ...requestOptions(
          config
        ).headers,

        'Content-Type':
          'video/mp4',

        'Content-Length':
          stat.size
      },

      maxBodyLength:
        Infinity,

      maxContentLength:
        Infinity
    })

  if (
    !successStatus(
      response.status
    )
  ) {
    throw new Error(
      `上传失败 HTTP ${response.status}`
    )
  }

  const remoteSize =
    await getRemoteSize(
      config,
      segments
    )

  if (
    remoteSize !==
    stat.size
  ) {
    throw new Error(
      `云端文件大小校验失败，本地 ${stat.size}，云端 ${remoteSize}`
    )
  }
}

export async function testWebdav(
  config: IWebdavConfig
) {
  try {
    if (
      !config.url?.trim() ||
      !config.username?.trim() ||
      !config.password
    ) {
      return {
        success:
          false,

        message:
          'WebDAV 地址、用户名和密码不能为空'
      }
    }

    const root =
      splitRemotePath(
        config.remoteRoot
      )

    await ensureFolders(
      config,
      root
    )

    const fileName =
      `.fideo-test-${Date.now()}.txt`

    const remotePath = [
      ...root,
      fileName
    ]

    const data =
      Buffer.from(
        'Fideo WebDAV Test',
        'utf8'
      )

    await uploadBuffer(
      config,
      remotePath,
      data
    )

    const remoteSize =
      await getRemoteSize(
        config,
        remotePath
      )

    if (
      remoteSize !==
      data.length
    ) {
      throw new Error(
        '测试文件大小校验失败'
      )
    }

    const deleteResponse =
      await axios.request({
        ...requestOptions(
          config
        ),

        method:
          'DELETE',

        url:
          makeRemoteUrl(
            config.url,
            remotePath
          )
      })

    if (
      !successStatus(
        deleteResponse.status
      ) &&
      deleteResponse.status !==
        404
    ) {
      throw new Error(
        `测试文件删除失败 HTTP ${deleteResponse.status}`
      )
    }

    return {
      success:
        true,

      message:
        '连接、上传、校验、删除测试成功'
    }
  } catch (
    error
  ) {
    return {
      success:
        false,

      message:
        error instanceof Error
          ? error.message
          : String(
              error
            )
    }
  }
}

export async function uploadWebdav(
  request:
    IWebdavUploadRequest
) {
  const config:
    IWebdavConfig = {
    url:
      request.url,

    username:
      request.username,

    password:
      request.password,

    remoteRoot:
      request.remoteRoot
  }

  const folder = [
    ...splitRemotePath(
      request.remoteRoot
    ),

    safeFolderName(
      request.streamerName
    )
  ]

  await ensureFolders(
    config,
    folder
  )

  const retryTimes =
    Math.max(
      1,
      Math.min(
        10,
        Number(
          request.retryTimes ||
          3
        )
      )
    )

  const mp4Files =
    request.files.filter(
      (file) =>
        path.extname(
          file.path
        ).toLowerCase() ===
        '.mp4'
    )

  const results:
    Array<{
      path: string
      cloudName: string
      success: boolean
      deleted: boolean
      message?: string
    }> = []

  for (
    const file of
    mp4Files
  ) {
    let uploaded =
      false

    let lastError =
      ''

    for (
      let attempt = 1;
      attempt <= retryTimes;
      attempt += 1
    ) {
      try {
        const cloudName =
          path.extname(
            file.cloudName
          ).toLowerCase() ===
          '.mp4'
            ? file.cloudName
            : `${file.cloudName}.mp4`

        await uploadFile(
          config,
          file.path,
          [
            ...folder,
            cloudName
          ]
        )

        let deleted =
          false

        if (
          request
            .deleteAfterUpload
        ) {
          await fs.promises.unlink(
            file.path
          )

          deleted =
            true
        }

        results.push({
          path:
            file.path,

          cloudName,

          success:
            true,

          deleted
        })

        uploaded =
          true

        break
      } catch (
        error
      ) {
        lastError =
          error instanceof Error
            ? error.message
            : String(
                error
              )

        if (
          attempt <
          retryTimes
        ) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                attempt *
                  2000
              )
          )
        }
      }
    }

    if (
      !uploaded
    ) {
      results.push({
        path:
          file.path,

        cloudName:
          file.cloudName,

        success:
          false,

        deleted:
          false,

        message:
          lastError
      })
    }
  }

  return {
    success:
      results.length >
        0 &&
      results.every(
        (item) =>
          item.success
      ),

    results
  }
}
"""
)


# ============================================================
# const.ts
# ============================================================

const_path = (
    "src/const.ts"
)

const_text = read(
    const_path
)

if (
    "TEST_WEBDAV"
    not in const_text
):
    const_text += (
        "\n"
        "export const TEST_WEBDAV = 'TEST_WEBDAV'\n"
        "export const UPLOAD_WEBDAV = 'UPLOAD_WEBDAV'\n"
    )

    write(
        const_path,
        const_text
    )


# ============================================================
# Default settings store
# ============================================================

write(
    "src/renderer/src/store/useDefaultSettingsStore.ts",
    """import { create } from 'zustand'
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
"""
)


# ============================================================
# CloudStorageSettings.tsx
# ============================================================

write(
    "src/renderer/src/components/NavBar/components/CloudStorageSettings.tsx",
    """import { useState } from 'react'

import { Button } from '@/shadcn/ui/button'
import { FormLabel } from '@/shadcn/ui/form'
import { Input } from '@/shadcn/ui/input'
import { Switch } from '@/shadcn/ui/switch'

import {
  useToast
} from '@renderer/hooks/useToast'

interface Props {
  form: any
}

export default function CloudStorageSettings({
  form
}: Props) {
  const {
    toast
  } = useToast()

  const [
    testing,
    setTesting
  ] = useState(
    false
  )

  const enabled =
    Boolean(
      form.watch(
        'webdavEnabled'
      )
    )

  const deleteLocal =
    Boolean(
      form.watch(
        'webdavDeleteAfterUpload'
      )
    )

  const handleTest =
    async () => {
      const url =
        String(
          form.getValues(
            'webdavUrl'
          ) ||
          ''
        ).trim()

      const username =
        String(
          form.getValues(
            'webdavUsername'
          ) ||
          ''
        ).trim()

      const password =
        String(
          form.getValues(
            'webdavPassword'
          ) ||
          ''
        )

      const remoteRoot =
        String(
          form.getValues(
            'webdavRemoteRoot'
          ) ||
          '/'
        ).trim() ||
        '/'

      if (
        !url ||
        !username ||
        !password
      ) {
        toast({
          title:
            'WebDAV 测试失败',

          description:
            '请填写地址、用户名和密码',

          variant:
            'destructive'
        })

        return
      }

      setTesting(
        true
      )

      try {
        const result =
          await window.api
            .testWebdav({
              url,
              username,
              password,
              remoteRoot
            })

        toast({
          title:
            result.success
              ? 'WebDAV 测试成功'
              : 'WebDAV 测试失败',

          description:
            result.message,

          variant:
            result.success
              ? undefined
              : 'destructive'
        })
      } catch (
        error
      ) {
        toast({
          title:
            'WebDAV 测试失败',

          description:
            error instanceof Error
              ? error.message
              : String(
                  error
                ),

          variant:
            'destructive'
        })
      } finally {
        setTesting(
          false
        )
      }
    }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <FormLabel>
            自动上传网盘
          </FormLabel>

          <div className="mt-1 text-xs text-muted-foreground">
            录像结束并生成最终 MP4 后上传
          </div>
        </div>

        <Switch
          checked={
            enabled
          }
          onCheckedChange={(
            value
          ) =>
            form.setValue(
              'webdavEnabled',
              value
            )
          }
        />
      </div>

      {enabled && (
        <div className="space-y-4">
          <div className="space-y-1">
            <FormLabel>
              WebDAV 地址
            </FormLabel>

            <Input
              value={String(
                form.watch(
                  'webdavUrl'
                ) ||
                ''
              )}
              onChange={(
                event
              ) =>
                form.setValue(
                  'webdavUrl',
                  event.target.value
                )
              }
              placeholder="https://pan.lansod.cn/dav"
            />
          </div>

          <div className="space-y-1">
            <FormLabel>
              用户名
            </FormLabel>

            <Input
              value={String(
                form.watch(
                  'webdavUsername'
                ) ||
                ''
              )}
              onChange={(
                event
              ) =>
                form.setValue(
                  'webdavUsername',
                  event.target.value
                )
              }
            />
          </div>

          <div className="space-y-1">
            <FormLabel>
              密码
            </FormLabel>

            <Input
              type="password"
              value={String(
                form.watch(
                  'webdavPassword'
                ) ||
                ''
              )}
              onChange={(
                event
              ) =>
                form.setValue(
                  'webdavPassword',
                  event.target.value
                )
              }
            />
          </div>

          <div className="space-y-1">
            <FormLabel>
              上传目录
            </FormLabel>

            <Input
              value={String(
                form.watch(
                  'webdavRemoteRoot'
                ) ||
                '/'
              )}
              onChange={(
                event
              ) =>
                form.setValue(
                  'webdavRemoteRoot',
                  event.target.value
                )
              }
              placeholder="/"
            />

            <div className="text-xs text-muted-foreground">
              小蓝云盘已绑定“抖音直播录制”时保持 / 即可
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <FormLabel>
                上传成功后删除本地录像
              </FormLabel>

              <div className="mt-1 text-xs text-muted-foreground">
                默认关闭，仅云端文件大小校验成功后删除
              </div>
            </div>

            <Switch
              checked={
                deleteLocal
              }
              onCheckedChange={(
                value
              ) =>
                form.setValue(
                  'webdavDeleteAfterUpload',
                  value
                )
              }
            />
          </div>

          <div className="space-y-1">
            <FormLabel>
              上传失败重试次数
            </FormLabel>

            <Input
              type="number"
              min={1}
              max={10}
              value={Number(
                form.watch(
                  'webdavRetryTimes'
                ) ||
                3
              )}
              onChange={(
                event
              ) => {
                const value =
                  Number(
                    event.target.value
                  ) ||
                  3

                form.setValue(
                  'webdavRetryTimes',
                  Math.max(
                    1,
                    Math.min(
                      10,
                      value
                    )
                  )
                )
              }}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={
              testing
            }
            onClick={
              handleTest
            }
          >
            {testing
              ? '测试中...'
              : '测试上传'}
          </Button>
        </div>
      )}
    </div>
  )
}
"""
)


# ============================================================
# DefaultSettingSheet.tsx
# ============================================================

settings_path = (
    "src/renderer/src/components/"
    "NavBar/components/"
    "DefaultSettingSheet.tsx"
)

settings = read(
    settings_path
)

if (
    "CloudStorageSettings"
    not in settings
):
    replace_once(
        settings_path,

        (
            "import { testXizhiPushNotification } "
            "from '@renderer/lib/utils'\n"
        ),

        (
            "import { testXizhiPushNotification } "
            "from '@renderer/lib/utils'\n"
            "import CloudStorageSettings "
            "from './CloudStorageSettings'\n"
        )
    )

settings = read(
    settings_path
)

if (
    "webdavEnabled"
    not in settings
):
    replace_once(
        settings_path,

        """const formSchema = z.object({
  directory: z.string(),
  lang: z.string(),
  xizhiKey: z.optional(z.string()),
  logsDir: z.optional(z.string())
})""",

        """const formSchema = z.object({
  directory: z.string(),
  lang: z.string(),
  xizhiKey: z.optional(z.string()),
  logsDir: z.optional(z.string()),
  webdavEnabled: z.optional(z.boolean()),
  webdavUrl: z.optional(z.string()),
  webdavUsername: z.optional(z.string()),
  webdavPassword: z.optional(z.string()),
  webdavRemoteRoot: z.optional(z.string()),
  webdavDeleteAfterUpload: z.optional(z.boolean()),
  webdavRetryTimes: z.optional(z.number())
})"""
    )

settings = read(
    settings_path
)

if (
    "<CloudStorageSettings"
    not in settings
):
    logs_index = settings.find(
        'name="logsDir"'
    )

    if (
        logs_index == -1
    ):
        raise RuntimeError(
            "Default settings logsDir field not found"
        )

    form_index = settings.rfind(
        "<FormField",
        0,
        logs_index
    )

    if (
        form_index == -1
    ):
        raise RuntimeError(
            "Default settings FormField not found"
        )

    line_start = settings.rfind(
        "\n",
        0,
        form_index
    ) + 1

    indent = settings[
        line_start:
        form_index
    ]

    component = (
        indent +
        "<CloudStorageSettings\n" +
        indent +
        "  form={form}\n" +
        indent +
        "/>\n\n"
    )

    settings = (
        settings[:line_start] +
        component +
        settings[line_start:]
    )

    write(
        settings_path,
        settings
    )


# ============================================================
# Xizhi
# ============================================================

utils_path = (
    "src/renderer/src/lib/utils.ts"
)

utils_text = read(
    utils_path
)

if (
    "const isHide = document.hidden"
    in utils_text
):
    old = """export function useXizhiToPushNotification(options: {
  key: string
  title: string
  content?: string
}) {
  const isHide = document.hidden
  if (!isHide) return
  const titleAndContent = options.content ? `${options.title} - ${options.content}` : options.title
  fetch(`${options.key}?title=${encodeURIComponent(titleAndContent)}`)
}"""

    new = """export function useXizhiToPushNotification(options: {
  key: string
  title: string
  content?: string
}) {
  const key =
    options.key.trim()

  if (!key) {
    return
  }

  const titleAndContent =
    options.content
      ? `${options.title} - ${options.content}`
      : options.title

  const separator =
    key.includes('?')
      ? '&'
      : '?'

  void fetch(
    `${key}${separator}title=${encodeURIComponent(
      titleAndContent
    )}`
  ).catch(
    () => undefined
  )
}"""

    if (
        old not in utils_text
    ):
        raise RuntimeError(
            "Xizhi function marker not found"
        )

    write(
        utils_path,
        utils_text.replace(
            old,
            new,
            1
        )
    )


# ============================================================
# preload/index.ts
# ============================================================

preload_path = (
    "src/preload/index.ts"
)

preload = read(
    preload_path
)

if (
    "TEST_WEBDAV"
    not in preload
):
    replace_once(
        preload_path,

        """  DOUYIN_LOGIN_STATUS
} from '../const'""",

        """  DOUYIN_LOGIN_STATUS,
  TEST_WEBDAV,
  UPLOAD_WEBDAV
} from '../const'"""
    )

preload = read(
    preload_path
)

if (
    "testWebdav:"
    not in preload
):
    replace_once(
        preload_path,

        (
            "  startFrpcProcess: "
            "(code: string) => "
            "ipcRenderer.invoke("
            "START_FRPC_PROCESS, code),"
        ),

        """  testWebdav: (config: {
    url: string
    username: string
    password: string
    remoteRoot?: string
  }) =>
    ipcRenderer.invoke(
      TEST_WEBDAV,
      config
    ),

  uploadWebdav: (request: {
    url: string
    username: string
    password: string
    remoteRoot?: string
    streamerName: string
    files: IRecordedFile[]
    deleteAfterUpload?: boolean
    retryTimes?: number
  }) =>
    ipcRenderer.invoke(
      UPLOAD_WEBDAV,
      request
    ),

  startFrpcProcess: (code: string) =>
    ipcRenderer.invoke(
      START_FRPC_PROCESS,
      code
    ),"""
    )

preload = read(
    preload_path
)

if (
    "files?: IRecordedFile[]"
    not in preload
):
    old = """  onStreamRecordEnd: (callback: (title: string, code: number, errMsg?: string) => void) => {
    ipcRenderer.on(STREAM_RECORD_END, (_, title, code, errMsg) => {
      callback(title, code, errMsg)
    })
  },"""

    new = """  onStreamRecordEnd: (
    callback: (
      title: string,
      code: number,
      errMsg?: string,
      files?: IRecordedFile[]
    ) => void
  ) => {
    ipcRenderer.on(
      STREAM_RECORD_END,
      (
        _,
        title,
        code,
        errMsg,
        files
      ) => {
        callback(
          title,
          code,
          errMsg,
          files
        )
      }
    )
  },"""

    if (
        old not in preload
    ):
        raise RuntimeError(
            "preload onStreamRecordEnd marker not found"
        )

    write(
        preload_path,
        preload.replace(
            old,
            new,
            1
        )
    )


# ============================================================
# preload/index.d.ts
# ============================================================

preload_dts = (
    "src/preload/index.d.ts"
)

preload_type = read(
    preload_dts
)

if (
    "testWebdav:"
    not in preload_type
):
    replace_once(
        preload_dts,

        (
            "      startFrpcProcess: "
            "(code: string) => "
            "Promise<{ status: boolean; "
            "code?: string; port?: number }>"
        ),

        """      testWebdav: (config: {
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
      }>"""
    )

preload_type = read(
    preload_dts
)

if (
    "files?: IRecordedFile[]"
    not in preload_type
):
    replace_once(
        preload_dts,

        (
            "      onStreamRecordEnd: "
            "(callback: (id: string, "
            "code: number, "
            "errMsg?: string) => void) => void"
        ),

        """      onStreamRecordEnd: (
        callback: (
          id: string,
          code: number,
          errMsg?: string,
          files?: IRecordedFile[]
        ) => void
      ) => void"""
    )


# ============================================================
# main/index.ts
# ============================================================

main_path = (
    "src/main/index.ts"
)

main = read(
    main_path
)

if (
    "TEST_WEBDAV"
    not in main
):
    replace_once(
        main_path,

        """  DOUYIN_LOGIN_STATUS
} from '../const'""",

        """  DOUYIN_LOGIN_STATUS,
  TEST_WEBDAV,
  UPLOAD_WEBDAV
} from '../const'"""
    )

main = read(
    main_path
)

if (
    "from './webdav'"
    not in main
):
    replace_once(
        main_path,

        """} from './douyin-session'

export const writeLog =""",

        """} from './douyin-session'

import {
  testWebdav,
  uploadWebdav
} from './webdav'

export const writeLog ="""
    )

main = read(
    main_path
)

if (
    "ipcMain.handle(\n    TEST_WEBDAV"
    not in main
):
    nav_handler = """  ipcMain.handle(NAV_BY_DEFAULT_BROWSER, (_, url: string) => {
    shell.openExternal(url)
  })"""

    if (
        nav_handler
        not in main
    ):
        raise RuntimeError(
            "Main NAV handler not found"
        )

    handlers = """  ipcMain.handle(
    TEST_WEBDAV,
    async (_, config) => {
      return await testWebdav(
        config
      )
    }
  )

  ipcMain.handle(
    UPLOAD_WEBDAV,
    async (_, request) => {
      return await uploadWebdav(
        request
      )
    }
  )

"""

    main = main.replace(
        nav_handler,
        handlers +
        nav_handler,
        1
    )

    write(
        main_path,
        main
    )

main = read(
    main_path
)

if (
    "files?: IRecordedFile[]"
    not in main
):
    old = """      (code: number, errMsg?: string) => {
        win?.webContents.send(STREAM_RECORD_END, id, code, errMsg)
        clearTimerWhenAllFfmpegProcessEnd()
      }"""

    new = """      (
        code: number,
        errMsg?: string,
        files?: IRecordedFile[]
      ) => {
        win?.webContents.send(
          STREAM_RECORD_END,
          id,
          code,
          errMsg,
          files
        )

        clearTimerWhenAllFfmpegProcessEnd()
      }"""

    if (
        old not in main
    ):
        raise RuntimeError(
            "Main record callback marker not found"
        )

    write(
        main_path,
        main.replace(
            old,
            new,
            1
        )
    )


# ============================================================
# record.ts
# ============================================================

record_path = (
    "src/main/ffmpeg/record.ts"
)

record = read(
    record_path
)

if (
    "files?: IRecordedFile[]"
    not in record
):
    replace_once(
        record_path,

        """  cb?: (code: number, errMsg?: string) => void
) {""",

        """  cb?: (
    code: number,
    errMsg?: string,
    files?: IRecordedFile[]
  ) => void
) {"""
    )

record = read(
    record_path
)

if (
    "cloudTime"
    not in record
):
    replace_once(
        record_path,

        """  const time = dayjs().format('YYYY.MM.DD-HH.mm.ss')
  const baseOutput = path.resolve(directory, `${filename}-${time}`)""",

        """  const now =
    dayjs()

  const time =
    now.format(
      'YYYY.MM.DD-HH.mm.ss'
    )

  const cloudTime =
    now.format(
      'YYYY-MM-DD_HH-mm-ss'
    )

  const baseOutput =
    path.resolve(
      directory,
      `${filename}-${time}`
    )"""
    )

record = read(
    record_path
)

if (
    "function makeRecordedFiles"
    not in record
):
    marker = (
        "async function detectStreamResolution"
        "(streamConfig: IStreamConfig) {"
    )

    if (
        marker
        not in record
    ):
        raise RuntimeError(
            "record.ts helper insertion marker not found"
        )

    helper = """async function findCompletedRecordFiles(
  sourcePath: string
): Promise<string[]> {
  if (
    await checkFileExist(
      sourcePath
    )
  ) {
    const stat =
      fs.statSync(
        sourcePath
      )

    if (
      stat.isDirectory()
    ) {
      return fs
        .readdirSync(
          sourcePath
        )
        .filter(
          (file) =>
            /\\.mp4$/i.test(
              file
            )
        )
        .sort()
        .map(
          (file) =>
            path.join(
              sourcePath,
              file
            )
        )
    }
  }

  const mp4 =
    sourcePath.replace(
      /\\.flv$/i,
      '.mp4'
    )

  if (
    await checkFileExist(
      mp4
    )
  ) {
    return [
      mp4
    ]
  }

  return []
}

function makeRecordedFiles(
  files: string[],
  cloudTime: string
): IRecordedFile[] {
  return files.map(
    (
      file,
      index
    ) => {
      const suffix =
        files.length > 1
          ? `_${String(
              index + 1
            ).padStart(
              3,
              '0'
            )}`
          : ''

      return {
        path:
          file,

        cloudName:
          `${cloudTime}${suffix}.mp4`
      }
    }
  )
}


"""

    record = record.replace(
        marker,
        helper +
        marker,
        1
    )

    write(
        record_path,
        record
    )

record = read(
    record_path
)

if (
    "makeRecordedFiles(\n        finishedFiles"
    not in record
):
    old_success = """      cb?.(SUCCESS_CODE)
      await convert(convertSource, writeLog.bind(null, title), convertToMP4)
      cb?.(SUCCESS_CODE)"""

    new_success = """      cb?.(
        SUCCESS_CODE
      )

      await convert(
        convertSource,
        writeLog.bind(
          null,
          title
        ),
        convertToMP4
      )

      const finishedFiles =
        await findCompletedRecordFiles(
          convertSource
        )

      cb?.(
        SUCCESS_CODE,
        undefined,
        makeRecordedFiles(
          finishedFiles,
          cloudTime
        )
      )"""

    if (
        old_success
        not in record
    ):
        raise RuntimeError(
            "record.ts success callback marker not found"
        )

    record = record.replace(
        old_success,
        new_success,
        1
    )

    old_error = """      cb?.(errCode, errMsg)
      await convert(convertSource, writeLog.bind(null, title), convertToMP4)
      cb?.(errCode, errMsg)"""

    new_error = """      cb?.(
        errCode,
        errMsg
      )

      await convert(
        convertSource,
        writeLog.bind(
          null,
          title
        ),
        convertToMP4
      )

      const finishedFiles =
        await findCompletedRecordFiles(
          convertSource
        )

      cb?.(
        errCode,
        errMsg,
        makeRecordedFiles(
          finishedFiles,
          cloudTime
        )
      )"""

    if (
        old_error
        not in record
    ):
        raise RuntimeError(
            "record.ts error callback marker not found"
        )

    record = record.replace(
        old_error,
        new_error,
        1
    )

    write(
        record_path,
        record
    )


# ============================================================
# Douyin
# ============================================================

douyin_path = (
    "src/main/crawler/plugins/douyin.js"
)

douyin = read(
    douyin_path
)

if (
    "DOUYIN_PROFILE_CACHE_MS"
    not in douyin
):
    marker = (
        "function buildDouyinProfileParams("
    )

    if (
        marker
        not in douyin
    ):
        raise RuntimeError(
            "Douyin profile function marker not found"
        )

    cache = """const DOUYIN_PROFILE_CACHE_MS =
  45 * 1000

const douyinProfileCache =
  new Map()


"""

    douyin = douyin.replace(
        marker,
        cache +
        marker,
        1
    )

# Profile API 取消每次访问主页 bootstrap。
profile_bootstrap = re.compile(
    r"""  let generatedCookies\s*=\s*''\s*
  try\s*\{\s*
    const bootstrap\s*=\s*
      await request\(\s*
        'https://www\.douyin\.com/',[\s\S]*?
  const finalCookie\s*=\s*\[\s*
    generatedCookies,\s*
    cookie\s*
  \]\s*
    \.filter\(Boolean\)\s*
    \.join\('; '\)""",
    re.M
)

if (
    profile_bootstrap.search(
        douyin
    )
):
    douyin = profile_bootstrap.sub(
        """  const finalCookie =
    cookie ||
    ''""",
        douyin,
        count=1
    )

if (
    "douyinProfileCache.get"
    not in douyin
):
    old = """  if (!secUid) {
    throw new Error(
      'DOUYIN_SEC_UID_EMPTY'
    )
  }

  const profileUrl ="""

    new = """  if (!secUid) {
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

  const profileUrl ="""

    if (
        old not in douyin
    ):
        raise RuntimeError(
            "Douyin profile cache insertion marker not found"
        )

    douyin = douyin.replace(
        old,
        new,
        1
    )

if (
    "douyinProfileCache.set"
    not in douyin
):
    old = """  return {
    nickname,
    live,
    webRid,
    secUid
  }
}"""

    new = """  const profile = {
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
}"""

    if (
        old not in douyin
    ):
        raise RuntimeError(
            "Douyin profile return marker not found"
        )

    douyin = douyin.replace(
        old,
        new,
        1
    )

write(
    douyin_path,
    douyin
)


# ============================================================
# OperationBar
# ============================================================

operation_path = (
    "src/renderer/src/components/"
    "StreamConfigList/components/"
    "OperationBar.tsx"
)

operation = read(
    operation_path
)

if (
    "effectiveMonitorInterval"
    not in operation
):
    old = """  const {
    streamConfig
  } =
    props"""

    new = """  const {
    streamConfig
  } =
    props

  const isDouyinProfile =
    /^https?:\\/\\/(www\\.)?douyin\\.com\\/user\\//i.test(
      streamConfig.roomUrl
    )

  const effectiveMonitorInterval =
    isDouyinProfile
      ? Math.max(
          60,
          Number(
            streamConfig.interval
          ) ||
            60
        )
      : streamConfig.interval"""

    if (
        old not in operation
    ):
        raise RuntimeError(
            "OperationBar streamConfig marker not found"
        )

    operation = operation.replace(
        old,
        new,
        1
    )

operation = operation.replace(
    """1000 *
            streamConfig.interval""",

    """1000 *
            effectiveMonitorInterval"""
)

operation = operation.replace(
    """1000 *
              streamConfig.interval""",

    """1000 *
              effectiveMonitorInterval"""
)

write(
    operation_path,
    operation
)


# ============================================================
# StreamConfigList upload
# ============================================================

list_path = (
    "src/renderer/src/components/"
    "StreamConfigList/"
    "StreamConfigList.tsx"
)

stream_list = read(
    list_path
)

if (
    "recordedFiles"
    not in stream_list
):
    old_callback = (
        "window.api.onStreamRecordEnd("
        "async (id, code, errMsg) => {"
    )

    new_callback = (
        "window.api.onStreamRecordEnd("
        "async (id, code, errMsg, recordedFiles) => {"
    )

    if (
        old_callback
        not in stream_list
    ):
        raise RuntimeError(
            "StreamConfigList callback marker not found"
        )

    stream_list = stream_list.replace(
        old_callback,
        new_callback,
        1
    )

    write(
        list_path,
        stream_list
    )

stream_list = read(
    list_path
)

if (
    "const webdavConfig"
    not in stream_list
):
    marker = """      // 第二次回调，删除当前title
      alreadyCallbackOneTimeSet.delete(id)

      unknownErrorRetryTimesMap[id] = unknownErrorRetryTimesMap[id] || 0"""

    block = """      // 第二次回调，处理最终录像文件
      alreadyCallbackOneTimeSet.delete(id)

      const webdavConfig =
        useDefaultSettingsStore
          .getState()
          .defaultSettingsConfig

      const shouldUpload =
        Boolean(
          webdavConfig
            .webdavEnabled
        ) &&
        Boolean(
          webdavConfig
            .webdavUrl
            ?.trim()
        ) &&
        Boolean(
          webdavConfig
            .webdavUsername
            ?.trim()
        ) &&
        Boolean(
          webdavConfig
            .webdavPassword
        ) &&
        Boolean(
          recordedFiles
            ?.length
        )

      if (
        shouldUpload
      ) {
        const current =
          useStreamConfigStore
            .getState()
            .streamConfigList
            .find(
              (item) =>
                item.id ===
                streamConfig.id
            )

        if (
          current
        ) {
          await updateStreamConfig(
            {
              ...current,

              cloudUploadStatus:
                'uploading'
            },

            current.id
          )
        }

        void (async () => {
          try {
            const result =
              await window.api
                .uploadWebdav({
                  url:
                    webdavConfig
                      .webdavUrl!
                      .trim(),

                  username:
                    webdavConfig
                      .webdavUsername!
                      .trim(),

                  password:
                    webdavConfig
                      .webdavPassword!,

                  remoteRoot:
                    webdavConfig
                      .webdavRemoteRoot ||
                    '/',

                  streamerName:
                    streamConfig.title,

                  files:
                    recordedFiles!,

                  deleteAfterUpload:
                    Boolean(
                      webdavConfig
                        .webdavDeleteAfterUpload
                    ),

                  retryTimes:
                    webdavConfig
                      .webdavRetryTimes ||
                    3
                })

            const latest =
              useStreamConfigStore
                .getState()
                .streamConfigList
                .find(
                  (item) =>
                    item.id ===
                    streamConfig.id
                )

            if (
              latest
            ) {
              await useStreamConfigStore
                .getState()
                .updateStreamConfig(
                  {
                    ...latest,

                    cloudUploadStatus:
                      result.success
                        ? 'success'
                        : 'error'
                  },

                  latest.id
                )
            }

            toast({
              title:
                streamConfig.title,

              description:
                result.success
                  ? '云端录像上传成功'
                  : '云端录像上传失败，本地录像已保留',

              variant:
                result.success
                  ? undefined
                  : 'destructive'
            })
          } catch {
            const latest =
              useStreamConfigStore
                .getState()
                .streamConfigList
                .find(
                  (item) =>
                    item.id ===
                    streamConfig.id
                )

            if (
              latest
            ) {
              await useStreamConfigStore
                .getState()
                .updateStreamConfig(
                  {
                    ...latest,

                    cloudUploadStatus:
                      'error'
                  },

                  latest.id
                )
            }

            toast({
              title:
                streamConfig.title,

              description:
                '云端录像上传失败，本地录像已保留',

              variant:
                'destructive'
            })
          }
        })()
      }

      unknownErrorRetryTimesMap[id] =
        unknownErrorRetryTimesMap[id] ||
        0"""

    if (
        marker not in stream_list
    ):
        raise RuntimeError(
            "StreamConfigList second callback marker not found"
        )

    stream_list = stream_list.replace(
        marker,
        block,
        1
    )

    write(
        list_path,
        stream_list
    )


# ============================================================
# StreamConfigCard upload status
# ============================================================

card_path = (
    "src/renderer/src/components/"
    "StreamConfigList/components/"
    "StreamConfigCard.tsx"
)

card = read(
    card_path
)

if (
    "正在上传云盘"
    not in card
):
    marker = """            {streamConfig.status !== StreamStatus.NOT_STARTED && (
              <Badge variant="outline">{t(streamStatusToLocaleMap[streamConfig.status])}</Badge>
            )}"""

    replacement = """            {streamConfig.status !== StreamStatus.NOT_STARTED && (
              <Badge variant="outline">{t(streamStatusToLocaleMap[streamConfig.status])}</Badge>
            )}

            {streamConfig.cloudUploadStatus === 'uploading' && (
              <Badge variant="outline">
                正在上传云盘
              </Badge>
            )}

            {streamConfig.cloudUploadStatus === 'success' && (
              <Badge variant="outline">
                已上传
              </Badge>
            )}

            {streamConfig.cloudUploadStatus === 'error' && (
              <Badge variant="outline">
                上传失败
              </Badge>
            )}"""

    if (
        marker not in card
    ):
        raise RuntimeError(
            "StreamConfigCard status marker not found"
        )

    write(
        card_path,
        card.replace(
            marker,
            replacement,
            1
        )
    )


print(
    "V2.10 patch complete"
)
