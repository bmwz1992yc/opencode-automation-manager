import { createEffect, createSignal, For, Show } from "solid-js"
import type { AutomationInfo, ModelPick, RunRecord, RunTurn } from "../types"
import { AutomationClient, errorText } from "../client"
import {
  actionArgsText,
  actionLabel,
  actionText,
  clockText,
  dateTimeText,
  describeTrigger,
  dirName,
  friendlyOutput,
  outcomeLabel,
  relativeTime,
  runMode,
  shortID,
  statusLabel,
  targetText,
  taskTitle,
} from "../format"

type HistoryMode = "child" | "turns" | "none"

export function TaskCard(props: {
  info: AutomationInfo
  client: AutomationClient
  sessionTitle?: string
  model?: ModelPick
  busy: boolean
  expanded: boolean
  confirming: boolean
  now: number
  onToggle: () => void
  onAction: (action: "pause" | "resume" | "delete") => void
  onEdit: () => void
  onRunNow: () => void
  onOpenSession?: (sessionID: string) => void
}) {
  const info = () => props.info
  const [turns, setTurns] = createSignal<RunTurn[]>([])
  const [runs, setRuns] = createSignal<RunRecord[]>([])
  const [outputs, setOutputs] = createSignal<Record<string, string>>({})
  const [state, setState] = createSignal<"idle" | "loading" | "ready" | "error">("idle")
  const [historyError, setHistoryError] = createSignal("")

  /** A prompt sent to a subagent runs in a child session; anything else runs in place. */
  const mode = (): HistoryMode => {
    const action = info().action
    if (action.type === "prompt") {
      const to = action.to
      if (to && "subagent" in to && to.subagent) return "child"
      return info().sessionID ? "turns" : "none"
    }
    return "none"
  }

  const loadHistory = async () => {
    if (state() === "loading" || mode() === "none") return
    setState("loading")
    setHistoryError("")
    try {
      if (mode() === "child") {
        const list = await props.client.history(info().id, 6)
        setRuns(list)
        const texts: Record<string, string> = {}
        await Promise.all(
          list.map(async (run) => {
            try {
              texts[run.sessionID] = await props.client.runOutput(run.sessionID)
            } catch {
              texts[run.sessionID] = ""
            }
          }),
        )
        setOutputs(texts)
      } else if (info().sessionID) {
        setTurns(await props.client.sessionTurns(info().sessionID!, 6))
      }
      setState("ready")
    } catch (cause) {
      setHistoryError(errorText(cause))
      setState("error")
    }
  }

  createEffect(() => {
    if (props.expanded && state() === "idle") void loadHistory()
  })

  const canRunNow = () => !(info().action.type === "code" && !info().sessionID)
  const outcome = () => outcomeLabel(info().lastOutcome)

  return (
    <div
      class="am-card"
      classList={{ expanded: props.expanded }}
      role="button"
      tabIndex="0"
      aria-expanded={props.expanded}
      onClick={props.onToggle}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        props.onToggle()
      }}
    >
      <div class="am-card-head">
        <div class="am-card-title">
          <span class="am-name" title={taskTitle(info())}>
            {taskTitle(info())}
          </span>
          <span class={`am-badge am-status-${info().status}`}>{statusLabel(info().status)}</span>
          <span class="am-kind">{actionLabel(info().action)}</span>
        </div>
        <div class="am-card-actions" onClick={(event) => event.stopPropagation()}>
          <Show when={info().status === "active"}>
            <button type="button" class="am-btn am-btn-small" disabled={props.busy} onClick={() => props.onAction("pause")}>
              暂停
            </button>
          </Show>
          <Show when={info().status === "paused"}>
            <button
              type="button"
              class="am-btn am-btn-small am-btn-primary"
              disabled={props.busy}
              onClick={() => props.onAction("resume")}
            >
              恢复
            </button>
          </Show>
          <button
            type="button"
            class="am-btn am-btn-small"
            disabled={props.busy || !canRunNow()}
            title="立即执行一次：新建一条约 1 分钟后触发的一次性任务，跑完自动清理"
            onClick={() => props.onRunNow()}
          >
            立即运行
          </button>
          <button type="button" class="am-btn am-btn-small" disabled={props.busy} onClick={() => props.onEdit()}>
            编辑
          </button>
          <button
            type="button"
            class="am-btn am-btn-small am-btn-danger"
            classList={{ "am-armed": props.confirming }}
            disabled={props.busy}
            onClick={() => props.onAction("delete")}
          >
            {props.confirming ? "确认删除" : "删除"}
          </button>
        </div>
      </div>

      <div class="am-meta">
        <span>{describeTrigger(info().trigger)}</span>
        <Show when={info().tz}>
          <span class="am-sep">·</span>
          <span>{info().tz}</span>
        </Show>
        <Show when={info().directory}>
          <span class="am-sep">·</span>
          <span title={info().directory}>{dirName(info().directory)}</span>
        </Show>
        <Show when={info().action.type === "prompt"}>
          <span class="am-sep">·</span>
          <span>{targetText(info().action)}</span>
          <span class="am-sep">·</span>
          <span class="am-kind">{runMode(info().action).text}</span>
        </Show>
      </div>

      <div class="am-meta">
        <Show
          when={info().status === "active" && info().nextDueAt !== undefined}
          fallback={
            <Show when={info().lastRunAt !== undefined}>
              <span>上次运行 {clockText(info().lastRunAt)}</span>
            </Show>
          }
        >
          <span class="am-next">
            下次运行 {clockText(info().nextDueAt)}（{relativeTime(info().nextDueAt, props.now)}）
          </span>
        </Show>
        <Show when={outcome()}>
          {(value) => (
            <>
              <span class="am-sep">·</span>
              <span class={`am-badge am-tone-${value().tone}`}>{value().text}</span>
            </>
          )}
        </Show>
        <span class="am-sep">·</span>
        <span>已运行 {info().runCount} 次</span>
      </div>

      <Show when={info().lastOutput}>
        <p class="am-last-output" title={info().lastOutput}>
          {friendlyOutput(info().lastOutput)}
        </p>
      </Show>

      <Show when={props.expanded}>
        <div class="am-detail" onClick={(event) => event.stopPropagation()}>
          <div class="am-kv">
            <div class="am-kv-row">
              <span class="am-kv-key">任务 ID</span>
              <span class="am-kv-val">{shortID(info().id)}</span>
            </div>
            <div class="am-kv-row">
              <span class="am-kv-key">绑定会话</span>
              <span class="am-kv-val">
                {props.sessionTitle || shortID(info().sessionID)}
                <Show when={info().sessionID && props.onOpenSession}>
                  <button
                    type="button"
                    class="am-btn am-btn-small am-btn-ghost"
                    style={{ "margin-left": "6px", height: "20px" }}
                    onClick={() => props.onOpenSession?.(info().sessionID!)}
                  >
                    打开
                  </button>
                </Show>
              </span>
            </div>
            <div class="am-kv-row">
              <span class="am-kv-key">执行目标</span>
              <span class="am-kv-val">{targetText(info().action)}</span>
            </div>
            <div class="am-kv-row">
              <span class="am-kv-key">运行方式</span>
              <span class="am-kv-val">
                {runMode(info().action).text} · {runMode(info().action).hint}
              </span>
            </div>
            <Show when={props.model}>
              {(model) => (
                <div class="am-kv-row">
                  <span class="am-kv-key">模型</span>
                  <span class="am-kv-val">
                    {model().providerID}/{model().id}
                    {model().variant ? ` · ${model().variant}` : ""}
                  </span>
                </div>
              )}
            </Show>
            <div class="am-kv-row">
              <span class="am-kv-key">执行目录</span>
              <span class="am-kv-val">{info().directory || "默认"}</span>
            </div>
            <div class="am-kv-row">
              <span class="am-kv-key">上次运行</span>
              <span class="am-kv-val">
                {info().lastRunAt !== undefined
                  ? `${clockText(info().lastRunAt)}（${relativeTime(info().lastRunAt, props.now)}）`
                  : "尚未运行"}
              </span>
            </div>
            <div class="am-kv-row">
              <span class="am-kv-key">结束时间</span>
              <span class="am-kv-val">{info().expires !== undefined ? dateTimeText(info().expires) : "不限"}</span>
            </div>
            <div class="am-kv-row">
              <span class="am-kv-key">创建</span>
              <span class="am-kv-val">{dateTimeText(info().time?.created)}</span>
            </div>
            <div class="am-kv-row">
              <span class="am-kv-key">更新</span>
              <span class="am-kv-val">{dateTimeText(info().time?.updated)}</span>
            </div>
          </div>

          <div class="am-block">
            <div class="am-block-title">
              <span>{actionLabel(info().action)}</span>
              <Show when={actionArgsText(info().action)}>
                {(args) => <span class="am-note">参数 {args()}</span>}
              </Show>
            </div>
            <pre class="am-pre">{actionText(info().action)}</pre>
          </div>

          <div class="am-block">
            <div class="am-block-title">
              <span>运行记录</span>
              <Show when={mode() !== "none"}>
                <button
                  type="button"
                  class="am-btn am-btn-small am-btn-ghost"
                  disabled={state() === "loading"}
                  onClick={() => void loadHistory()}
                >
                  {state() === "loading" ? "读取中…" : "刷新"}
                </button>
              </Show>
            </div>

            <Show when={state() === "error"}>
              <p class="am-error">{historyError()}</p>
            </Show>

            <Show when={mode() === "none"}>
              <p class="am-note">
                这条任务直接在运行上下文里执行，OpenCode 不保留每次运行的独立记录。上次状态：{" "}
                {info().lastRunAt ? dateTimeText(info().lastRunAt) : "尚未运行"}
                {outcome() ? ` · ${outcome()!.text}` : ""}
                {info().lastOutput ? ` · ${friendlyOutput(info().lastOutput)}` : ""}
              </p>
            </Show>

            <Show when={mode() === "child"}>
              <Show
                when={runs().length > 0}
                fallback={
                  <p class="am-note">
                    {state() === "loading" ? "正在查找运行记录…" : "还没有运行记录。子代理任务每次触发会建立 ses_任务ID_序号 运行会话。"}
                  </p>
                }
              >
                <div class="am-history">
                  <For each={runs()}>
                    {(run) => (
                      <div class="am-run">
                        <div class="am-run-head">
                          <span class="am-run-index">第 {run.index} 次</span>
                          <span class="am-run-time">
                            {dateTimeText(run.createdAt)}
                            <span class="am-sep"> · </span>
                            {relativeTime(run.createdAt, props.now)}
                          </span>
                          <Show when={run.running}>
                            <span class="am-badge am-tone-warn">运行中</span>
                          </Show>
                          <Show when={props.onOpenSession}>
                            <button
                              type="button"
                              class="am-btn am-btn-small am-btn-ghost"
                              style={{ height: "20px" }}
                              onClick={() => props.onOpenSession?.(run.sessionID)}
                            >
                              打开会话
                            </button>
                          </Show>
                        </div>
                        <p class="am-run-text">
                          {outputs()[run.sessionID]?.trim() || (run.running ? "正在运行…" : "（本次没有文本输出）")}
                        </p>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>

            <Show when={mode() === "turns"}>
              <Show
                when={turns().length > 0}
                fallback={
                  <p class="am-note">
                    {state() === "loading" ? "正在读取会话记录…" : "绑定会话里还没有运行记录。"}
                  </p>
                }
              >
                <div class="am-history">
                  <For each={turns()}>
                    {(turn, index) => (
                      <div class="am-run">
                        <div class="am-run-head">
                          <span class="am-run-index">第 {turns().length - index()} 次</span>
                          <span class="am-run-time">
                            {dateTimeText(turn.createdAt)}
                            <span class="am-sep"> · </span>
                            {relativeTime(turn.createdAt, props.now)}
                          </span>
                        </div>
                        <p class="am-run-text am-run-prompt">{turn.prompt.trim().slice(0, 400)}</p>
                        <p class="am-run-text">{turn.reply || "（本次没有文本输出）"}</p>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
