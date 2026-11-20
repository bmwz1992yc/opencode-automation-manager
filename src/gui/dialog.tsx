import type { Context } from "@opencode/plugin/gui"
import type { AutomationClient } from "../client"
import { ManagerPage } from "./page"

/** Dialog wrapper: the host's Dialog chrome around the same page. */
export function ManagerDialog(props: {
  ctx: Context
  client: AutomationClient
  onOpenSession?: (sessionID: string) => void
  onClose: () => void
}) {
  const ui = props.ctx.ui
  return (
    <ui.Dialog title="自动任务" size="x-large" closable>
      <ManagerPage client={props.client} embedded onOpenSession={props.onOpenSession} />
    </ui.Dialog>
  )
}
