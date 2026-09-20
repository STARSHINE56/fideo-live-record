import { useState } from 'react'

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
