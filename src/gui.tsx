import { Command, Plugin, SettingsPage, TitlebarItem } from "@opencode/plugin/gui"
import { ManagerDialog } from "./gui/dialog"
import { ManagerPage } from "./gui/page"
import { installStyles } from "./gui/styles"
import { toServerOption, unconnectedServer } from "./servers"

export default Plugin.define({
  i18n: {
    en: {
      title: "自动任务",
      open: "打开自动任务",
      description: "查看、新建、编辑、暂停与删除自动任务（实验性 automations），可切换本机或其他已接入的服务器",
    },
  },
  setup(ctx) {
    installStyles()

    /**
     * Every server the app lists, local and remote, rebuilt on each read so a
     * server added in Settings shows up without a restart. Reading it inside a
     * memo is what subscribes the list to the app's reactive server list.
     */
    const servers = () =>
      ctx.servers.list().map((id) => {
        const ref = ctx.servers.get(id)
        // A listed server with no ref yet is kept, visible as "未连接".
        return ref ? toServerOption(ref) : unconnectedServer(id)
      })

    /** Open a session on the server that owns it, so remote runs open remotely. */
    const openSession = (serverID: string, sessionID: string) => {
      const id = serverID || ctx.servers.list().find((candidate) => ctx.servers.get(candidate)?.builtin)
      if (!id || !ctx.servers.get(id)) return
      ctx.tabs.open({ server: id, id: sessionID }, { focus: true })
    }

    const open = () => {
      if (ctx.dialogs.active()) return
      ctx.dialogs.open((dialog) => (
        <ManagerDialog ctx={ctx} servers={servers} onOpenSession={openSession} onClose={() => dialog.close()} />
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
            keywords: "automation schedule cron timer task 自动任务 定时 任务 计划 服务器 server remote",
          },
        ]
      },
      render: () => <ManagerPage servers={servers} openSession={openSession} />,
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
      keywords: "automation schedule cron timer task 自动任务 定时 任务 计划 服务器 server remote",
      group: "设置",
      section: "navigation",
      bind: "mod+alt+a",
      featured: true,
      run: open,
    }))
  },
})
