import { Command, Plugin, SettingsPage, TitlebarItem } from "@opencode/plugin/gui"
import { AutomationClient } from "./client"
import { ManagerDialog } from "./gui/dialog"
import { ManagerPage } from "./gui/page"
import { installStyles } from "./gui/styles"

export default Plugin.define({
  i18n: {
    en: {
      title: "自动任务",
      open: "打开自动任务",
      description: "查看、新建、编辑、暂停与删除自动任务（实验性 automations）",
    },
  },
  setup(ctx) {
    installStyles()
    const client = new AutomationClient(ctx.client)

    /** Open a session in the desktop app, so a run's conversation is one click away. */
    const openSession = (sessionID: string) => {
      const servers = ctx.servers.list().map((id) => ctx.servers.get(id))
      const server = servers.find((item) => item?.builtin) ?? servers.find((item) => item !== undefined)
      if (!server) return
      ctx.tabs.open({ server: server.id, id: sessionID }, { focus: true })
    }

    const open = () => {
      if (ctx.dialogs.active()) return
      ctx.dialogs.open((dialog) => (
        <ManagerDialog ctx={ctx} client={client} onOpenSession={openSession} onClose={() => dialog.close()} />
      ))
    }

    ctx.add(SettingsPage, {
      id: "automation-manager",
      icon: "task",
      get title() {
        return ctx.t("title")
      },
      get entries() {
        return [
          {
            id: "automation-manager",
            title: ctx.t("title"),
            description: ctx.t("description"),
            keywords: "automation schedule cron timer task 自动任务 定时 任务 计划",
          },
        ]
      },
      render: () => <ManagerPage client={client} onOpenSession={openSession} />,
    })

    ctx.add(TitlebarItem, (): TitlebarItem => ({
      id: "automations",
      label: ctx.t("title"),
      title: ctx.t("open"),
      icon: "task",
      run: open,
    }))

    ctx.add(Command, (): Command => ({
      id: "open",
      title: ctx.t("title"),
      description: ctx.t("description"),
      keywords: "automation schedule cron timer task 自动任务 定时 任务 计划",
      group: "设置",
      section: "navigation",
      bind: "mod+alt+a",
      featured: true,
      run: open,
    }))
  },
})
