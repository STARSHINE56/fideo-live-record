import fs from 'node:fs'
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
