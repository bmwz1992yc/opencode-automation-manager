import type { Context } from "@opencode/plugin/gui"
import type { ServerOption } from "../types"
import { ManagerPage } from "./page"

/** Dialog wrapper: the host's Dialog chrome around the same page. */
export function ManagerDialog(props: {
  ctx: Context
  servers: () => ServerOption[]
  onOpenSession?: (serverID: string, sessionID: string) => void
  onClose: () => void
}) {
  const ui = props.ctx.ui
  return (
    <ui.Dialog title="自动任务" size="x-large" closable>
      <ManagerPage servers={props.servers} embedded openSession={props.onOpenSession} />
    </ui.Dialog>
  )
}
