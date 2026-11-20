import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import type { AutomationInfo, SessionMeta } from "../types"
import { AutomationClient, RUN_NOW_PREFIX, errorText } from "../client"
import { actionText, taskTitle } from "../format"
import { TaskCard } from "./card"
import { TaskForm } from "./form"

type Mode = "list" | "create" | "edit"
type Filter = "all" | "active" | "paused" | "done"

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "active", label: "进行中" },
  { id: "paused", label: "已暂停" },
  { id: "done", label: "已结束" },
]

export function ManagerPage(props: {
  client: AutomationClient
  embedded?: boolean
  onOpenSession?: (sessionID: string) => void
}) {
  const [mode, setMode] = createSignal<Mode>("list")
  const [editing, setEditing] = createSignal<AutomationInfo | null>(null)
  const [rows, setRows] = createSignal<AutomationInfo[]>([])
  const [metas, setMetas] = createSignal<Record<string, SessionMeta>>({})
  const [primed, setPrimed] = createSignal(false)
  const [error, setError] = createSignal("")
  const [notice, setNotice] = createSignal("")
  const [filter, setFilter] = createSignal<Filter>("all")
  const [search, setSearch] = createSignal("")
  const [expanded, setExpanded] = createSignal("")
  const [busyId, setBusyId] = createSignal("")
  const [confirming, setConfirming] = createSignal("")
  const [nowTick, setNowTick] = createSignal(0)

  const now = () => {
    void nowTick()
    return Date.now()
  }
  const clock = setInterval(() => setNowTick((value) => value + 1), 1000)
  onCleanup(() => clearInterval(clock))

  let inFlight = false
  const load = async (quiet = false) => {
    if (inFlight) return
    inFlight = true
    if (!quiet) setError("")
    try {
      const list = (await props.client.list()).filter((item) => !item.name.startsWith(RUN_NOW_PREFIX))
      // Keep object identity for unchanged rows, so the 30s poll does not remount
      // every card (and reset an expanded run history).
      setRows((current) => {
        const previous = new Map(current.map((item) => [item.id, item]))
        return list.map((item) => {
          const before = previous.get(item.id)
          return before && JSON.stringify(before) === JSON.stringify(item) ? before : item
        })
      })
      const known = metas()
      const missing: string[] = []
      for (const item of list) {
        const id = item.sessionID
        if (id && known[id] === undefined) missing.push(id)
      }
      if (missing.length > 0) {
        const next = { ...known }
        await Promise.all(
          missing.map(async (id) => {
            const meta = await props.client.sessionMeta(id)
            if (meta) next[id] = meta
          }),
        )
        setMetas(next)
      }
    } catch (cause) {
      // A failed refresh keeps the last good list; only a first load blocks.
      setError(errorText(cause))
    } finally {
      inFlight = false
      setPrimed(true)
    }
  }

  void load()

  const poll = setInterval(() => {
    if (document.hidden) return
    if (busyId() || mode() !== "list") return
    void load(true)
  }, 30_000)
  onCleanup(() => clearInterval(poll))

  const counts = createMemo(() => ({
    all: rows().length,
    active: rows().filter((item) => item.status === "active").length,
    paused: rows().filter((item) => item.status === "paused").length,
    done: rows().filter((item) => item.status === "done").length,
  }))

  const visible = createMemo(() => {
    const needle = search().trim().toLowerCase()
    return rows().filter((item) => {
      if (filter() !== "all" && item.status !== filter()) return false
      if (!needle) return true
      const haystack = `${taskTitle(item)} ${actionText(item.action)} ${item.directory ?? ""}`.toLowerCase()
      return haystack.includes(needle)
    })
  })

  const replaceRow = (next: AutomationInfo) => {
    setRows((current) => current.map((item) => (item.id === next.id ? next : item)))
  }

  const act = async (info: AutomationInfo, action: "pause" | "resume" | "delete") => {
    setBusyId(info.id)
    setError("")
    setNotice("")
    try {
      if (action === "delete") {
        await props.client.remove(info.id)
        setRows((current) => current.filter((item) => item.id !== info.id))
        if (expanded() === info.id) setExpanded("")
        setNotice("任务已删除，其历史运行会话仍保留。")
      } else {
        const next = action === "pause" ? await props.client.pause(info.id) : await props.client.resume(info.id)
        replaceRow(next)
      }
    } catch (cause) {
      setError(errorText(cause))
      // The server may have applied it anyway: read this task back.
      try {
        replaceRow(await props.client.get(info.id))
      } catch {
        void load(true)
      }
    } finally {
      setBusyId("")
      setConfirming("")
    }
  }

  const runNow = async (info: AutomationInfo) => {
    setBusyId(info.id)
    setError("")
    setNotice("")
    try {
      await props.client.runNow(info)
      setNotice("已排入立即执行：约 1 分钟内触发，跑完自动清理这条临时任务。")
      void load(true)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusyId("")
    }
  }

  const askDelete = (info: AutomationInfo) => {
    if (confirming() === info.id) {
      void act(info, "delete")
      return
    }
    setConfirming(info.id)
    const id = info.id
    const disarm = (click: Event) => {
      const target = click.target as HTMLElement | null
      if (!target?.closest?.(`[data-automation="${id}"]`)) setConfirming("")
      document.removeEventListener("click", disarm, true)
    }
    document.addEventListener("click", disarm, true)
  }

  const openCreate = () => {
    setEditing(null)
    setError("")
    setNotice("")
    setMode("create")
  }

  const openEdit = (info: AutomationInfo) => {
    if (info.trigger.type === "event") {
      setError("事件触发的任务暂不支持在此编辑，可暂停、立即运行或删除。")
      return
    }
    setEditing(info)
    setError("")
    setNotice("")
    setMode("edit")
  }

  return (
    <div class="am-root">
      <Show when={mode() === "list"}>
        <Show when={!props.embedded}>
          <section class="am-hero">
            <div>
              <h1>自动任务</h1>
              <p>在 OpenCode 后台按计划运行提示词或代码。应用退出时不会触发；任务保存在本机服务中。</p>
              <div class="am-hero-stats">
                <span>
                  <b>{counts().active}</b> 进行中
                </span>
                <span class="am-sep">·</span>
                <span>
                  <b>{counts().paused}</b> 已暂停
                </span>
                <span class="am-sep">·</span>
                <span>
                  <b>{counts().all}</b> 个任务
                </span>
              </div>
            </div>
            <div class="am-hero-tools">
              <button type="button" class="am-btn am-btn-primary" onClick={openCreate}>
                新建任务
              </button>
            </div>
          </section>
        </Show>

        <div class="am-toolbar">
          <div class="am-filters" role="tablist" aria-label="任务筛选">
            <For each={FILTERS}>
              {(item) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={filter() === item.id}
                  class="am-filter"
                  classList={{ active: filter() === item.id }}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                  <span class="am-filter-count">{counts()[item.id]}</span>
                </button>
              )}
            </For>
          </div>
          <div class="am-toolbar-end">
            <input
              type="search"
              class="am-input am-search"
              placeholder="搜索任务…"
              aria-label="搜索任务"
              value={search()}
              onInput={(event) => setSearch(event.currentTarget.value)}
            />
            <button type="button" class="am-btn am-btn-ghost" disabled={!primed()} onClick={() => void load()}>
              刷新
            </button>
            <Show when={props.embedded}>
              <button type="button" class="am-btn am-btn-primary" onClick={openCreate}>
                新建
              </button>
            </Show>
          </div>
        </div>

        <Show when={error()}>
          <p class="am-error">{error()}</p>
        </Show>
        <Show when={notice()}>
          <p class="am-note">{notice()}</p>
        </Show>

        <Show
          when={rows().length > 0}
          fallback={
            <Show
              when={primed()}
              fallback={
                <div class="am-list">
                  <div class="am-skeleton" />
                  <div class="am-skeleton" />
                </div>
              }
            >
              <div class="am-empty">
                <Show when={error()} fallback={<p class="am-empty-title">还没有自动任务</p>}>
                  <p class="am-empty-title">任务状态暂不可确认</p>
                </Show>
                <p class="am-empty-hint">建一个任务，让 agent 定时检查、汇报或提醒。</p>
                <button type="button" class="am-btn am-btn-primary" onClick={openCreate}>
                  新建第一个任务
                </button>
              </div>
            </Show>
          }
        >
          <Show
            when={visible().length > 0}
            fallback={
              <div class="am-empty">
                <p class="am-empty-title">没有符合条件的任务</p>
                <button
                  type="button"
                  class="am-btn"
                  onClick={() => {
                    setFilter("all")
                    setSearch("")
                  }}
                >
                  清除筛选
                </button>
              </div>
            }
          >
            <div class="am-list">
              <For each={visible()}>
                {(info) => (
                  <div data-automation={info.id}>
                    <TaskCard
                      info={info}
                      client={props.client}
                      sessionTitle={info.sessionID ? metas()[info.sessionID]?.title : undefined}
                      model={info.sessionID ? metas()[info.sessionID]?.model : undefined}
                      busy={busyId() === info.id}
                      expanded={expanded() === info.id}
                      confirming={confirming() === info.id}
                      now={now()}
                      onToggle={() => setExpanded(expanded() === info.id ? "" : info.id)}
                      onAction={(action) => (action === "delete" ? askDelete(info) : void act(info, action))}
                      onEdit={() => openEdit(info)}
                      onRunNow={() => void runNow(info)}
                      onOpenSession={props.onOpenSession}
                    />
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </Show>

      <Show when={mode() !== "list"}>
        <div class="am-toolbar">
          <div class="am-tabs">
            <button type="button" class="am-tab" onClick={() => setMode("list")}>
              返回列表
            </button>
            <span class="am-tab active">{mode() === "edit" ? "编辑任务" : "新建任务"}</span>
          </div>
        </div>

        <Show when={error()}>
          <p class="am-error">{error()}</p>
        </Show>

        <TaskForm
          client={props.client}
          mode={mode() === "edit" ? "edit" : "create"}
          initial={editing() ?? undefined}
          onCancel={() => {
            setMode("list")
            setEditing(null)
          }}
          onSaved={(info, saved) => {
            setMode("list")
            setEditing(null)
            setNotice(saved === "edit" ? "已保存：旧任务已删除，新任务已生效。" : "任务已创建。")
            void load(true)
            void info
          }}
        />
      </Show>
    </div>
  )
}
