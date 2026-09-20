import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shadcn/ui/form'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/shadcn/ui/sheet'
import { Input } from '@/shadcn/ui/input'
import { Select, SelectTrigger, SelectItem, SelectContent, SelectValue } from '@/shadcn/ui/select'
import { useDefaultSettingsStore } from '@renderer/store/useDefaultSettingsStore'
import { useEffect, useState } from 'react'
import { useToast } from '@renderer/hooks/useToast'
import { testXizhiPushNotification } from '@renderer/lib/utils'
import CloudStorageSettings from './CloudStorageSettings'

const formSchema = z.object({
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
})

interface StreamConfigSheetProps {
  sheetOpen: boolean
  setSheetOpen: (status: boolean) => void
}

export default function DefaultSettingSheet(props: StreamConfigSheetProps) {
  const { t } = useTranslation()
  const { sheetOpen, setSheetOpen } = props

  const [
    douyinLoggedIn,
    setDouyinLoggedIn
  ] = useState(false)

  const [
    xizhiTesting,
    setXizhiTesting
  ] = useState(false)

  const {
    toast
  } = useToast()

  const { defaultSettingsConfig, setDefaultSettingsConfig } = useDefaultSettingsStore(
    (state) => state
  )

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...{ ...defaultSettingsConfig }
    }
  })

  useEffect(() => {
    form.reset({
      ...defaultSettingsConfig
    })
  }, [defaultSettingsConfig])

  useEffect(() => {
    if (!sheetOpen) {
      return
    }

    window.api
      .getDouyinLoginStatus()
      .then(({ hasSession }) => {
        setDouyinLoggedIn(
          hasSession
        )
      })
  }, [sheetOpen])

  const handleDouyinLogin =
    async () => {
      const { hasSession } =
        await window.api.loginDouyin()

      setDouyinLoggedIn(
        hasSession
      )
    }

  const handleDouyinLogout =
    async () => {
      await window.api.logoutDouyin()

      setDouyinLoggedIn(false)
    }

  const handleTestXizhi =
    async () => {
      const key =
        form
          .getValues(
            'xizhiKey'
          )
          ?.trim()

      if (!key) {
        toast({
          title:
            t(
              'default_settings.xizhi_test_failed'
            ),

          description:
            t(
              'default_settings.xizhi_key_required'
            ),

          variant: 'destructive'
        })

        return
      }

      setXizhiTesting(true)

      try {
        const success =
          await testXizhiPushNotification({
            key,

            title:
              t(
                'default_settings.xizhi_test_title'
              ),

            content:
              t(
                'default_settings.xizhi_test_content'
              )
          })

        if (!success) {
          throw new Error('XIZHI_TEST_FAILED')
        }

        toast({
          title:
            t(
              'default_settings.xizhi_test_success'
            ),

          description:
            t(
              'default_settings.xizhi_test_success_desc'
            )
        })
      } catch {
        toast({
          title:
            t(
              'default_settings.xizhi_test_failed'
            ),

          description:
            t(
              'default_settings.xizhi_test_failed_desc'
            ),

          variant: 'destructive'
        })
      } finally {
        setXizhiTesting(false)
      }
    }


  const handleSelectDir = async () => {
    const { canceled, filePaths } = await window.api.selectDir()
    if (canceled) {
      return
    }
    form.setValue('directory', filePaths[0])
  }

  const handleOpenLogsDir = () => {
    window.api.openLogsDir()
  }

  const handleSetSheetOpen = async (status: boolean, trigger = false) => {
    const formValues = form.getValues() as IDefaultDefaultSettingsConfig
    if (trigger) {
      setDefaultSettingsConfig(formValues)
    }

    setSheetOpen(status)
    form.reset()
  }

  return (
    <Sheet open={sheetOpen} onOpenChange={(status) => handleSetSheetOpen(status)}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('default_settings.title')}</SheetTitle>
        </SheetHeader>
        <div className="show-scrollbar overflow-y-auto mr-[-14px]">
          <div className=" pl-1 pr-4 pb-2">
            <Form {...form}>
              <form className="space-y-5">
                <FormField
                  control={form.control}
                  name="directory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('default_settings.directory')}</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            placeholder={t('default_settings.directory_placeholder')}
                            {...field}
                            disabled
                          />
                          <Button variant="outline" type="button" onClick={handleSelectDir}>
                            {t('stream_config.select')}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lang"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('default_settings.language')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('default_settings.language_placeholder')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="cn">中文</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <div className="space-y-2">
                  <FormLabel>
                    {t(
                      'default_settings.douyin_account'
                    )}
                  </FormLabel>

                  <div className="flex gap-2">
                    <Input
                      value={
                        douyinLoggedIn
                          ? t(
                              'default_settings.douyin_logged_in'
                            )
                          : t(
                              'default_settings.douyin_not_logged_in'
                            )
                      }
                      disabled
                      readOnly
                    />

                    <Button
                      variant="outline"
                      type="button"
                      onClick={
                        handleDouyinLogin
                      }
                    >
                      {t(
                        'default_settings.douyin_login'
                      )}
                    </Button>

                    {douyinLoggedIn && (
                      <Button
                        variant="outline"
                        type="button"
                        onClick={
                          handleDouyinLogout
                        }
                      >
                        {t(
                          'default_settings.douyin_logout'
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="xizhiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t(
                          'default_settings.xizhi_key'
                        )}
                      </FormLabel>

                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            placeholder={t(
                              'default_settings.xizhi_key_placeholder'
                            )}
                            {...field}
                          />

                          <Button
                            variant="outline"
                            type="button"
                            disabled={xizhiTesting}
                            onClick={handleTestXizhi}
                          >
                            {xizhiTesting
                              ? t(
                                  'default_settings.xizhi_testing'
                                )
                              : t(
                                  'default_settings.xizhi_test'
                                )}
                          </Button>
                        </div>
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />
                <CloudStorageSettings
                  form={form}
                />

                <FormField
                  control={form.control}
                  name="logsDir"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('default_settings.logs_dir')}</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            placeholder={t('default_settings.logs_dir_placeholder')}
                            {...field}
                            disabled
                          />
                          <Button variant="outline" type="button" onClick={handleOpenLogsDir}>
                            {t('stream_config.open')}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
        </div>
        <SheetFooter>
          <Button variant="secondary" onClick={() => handleSetSheetOpen(false, true)}>
            {t('stream_config.confirm')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
