import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import type { AutomationInfo, ServerOption, SessionMeta } from "../types"
import { AutomationClient, RUN_NOW_PREFIX } from "../client"
import { actionText, describeServerError, serverHost, serverLabel, taskTitle } from "../format"
import { isServerReady, pickDefaultServer } from "../servers"
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
  /** Reactive list of the servers the app has connected. */
  servers: () => ServerOption[]
  embedded?: boolean
  /** Open a session on the server that owns it. */
  openSession?: (serverID: string, sessionID: string) => void
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
  // Empty means "follow the app's own server": the panel always opens locally.
  const [pickedServerID, setPickedServerID] = createSignal("")

  const now = () => {
    void nowTick()
    return Date.now()
  }
  const clock = setInterval(() => setNowTick((value) => value + 1), 1000)
  onCleanup(() => clearInterval(clock))

  const servers = createMemo(() => props.servers())
  const current = createMemo<ServerOption | undefined>(() => {
    const all = servers()
    return all.find((item) => item.id === pickedServerID()) ?? pickDefaultServer(all)
  })
  const remote = () => current() !== undefined && !current()!.builtin && !current()!.local
  const ready = () => isServerReady(current())

  /**
   * One client per server, rebuilt when that server hands out a new API client
   * (it restarted). Kept in a map so the session-title cache survives a switch.
   */
  const clients = new Map<string, { raw: ServerOption["client"]; api: AutomationClient }>()
  const api = createMemo<AutomationClient | undefined>(() => {
    const server = current()
    if (!server || !server.client) return undefined
    const cached = clients.get(server.id)
    if (cached && cached.raw === server.client) return cached.api
    const made = new AutomationClient(server.client)
    clients.set(server.id, { raw: server.client, api: made })
    return made
  })
  /** Non-null inside the rendered panel; the Show at the top guarantees it. */
  const client = () => api() as AutomationClient

  // Discards results of a load that a server switch or a newer load superseded.
  let generation = 0
  const load = async (quiet = false) => {
    const active = api()
    const server = current()
    if (!active || !server) {
      setPrimed(true)
      return
    }
    const gen = (generation += 1)
    if (!quiet) setError("")
    if (!server.connected || !server.compatible) {
      setError(describeServerError(new Error(""), server))
      setRows([])
      setPrimed(true)
      return
    }
    try {
      const list = (await active.list()).filter((item) => !item.name.startsWith(RUN_NOW_PREFIX))
      if (gen !== generation) return
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
            const meta = await active.sessionMeta(id)
            if (meta) next[id] = meta
          }),
        )
        if (gen !== generation) return
        setMetas(next)
      }
    } catch (cause) {
      // A failed refresh keeps the last good list; only a first load blocks.
      if (gen !== generation) return
      // Naming the remote's version turns "接口不存在" into an actionable cause.
      const version = await active.serverVersion()
      if (gen !== generation) return
      setError(describeServerError(cause, server, version))
    } finally {
      if (gen === generation) setPrimed(true)
    }
  }

  // The first load, and every reload after a server switch, comes from here: the
  // effect tracks the selected server, so a server that connects later loads too.
  createEffect(() => {
    void api()
    void current()
    void load()
  })

  const poll = setInterval(() => {
    if (document.hidden) return
    if (busyId() || mode() !== "list") return
    void load(true)
  }, 30_000)
  onCleanup(() => clearInterval(poll))

  const switchServer = (id: string) => {
    if (mode() !== "list") return
    if (id === current()?.id) return
    setPickedServerID(id)
    // Nothing from the previous server may stay on screen while the new one loads.
    setRows([])
    setMetas({})
    setExpanded("")
    setConfirming("")
    setFilter("all")
    setSearch("")
    setError("")
    setNotice("")
    setPrimed(false)
  }

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
        await client().remove(info.id)
        setRows((current) => current.filter((item) => item.id !== info.id))
        if (expanded() === info.id) setExpanded("")
        setNotice("任务已删除，其历史运行会话仍保留。")
      } else {
        const next = action === "pause" ? await client().pause(info.id) : await client().resume(info.id)
        replaceRow(next)
      }
    } catch (cause) {
      setError(describeServerError(cause, current()))
      // The server may have applied it anyway: read this task back.
      try {
        replaceRow(await client().get(info.id))
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
      await client().runNow(info)
      setNotice(
        remote()
          ? "已排入立即执行：约 1 分钟内由该服务器触发，跑完自动清理这条临时任务。"
          : "已排入立即执行：约 1 分钟内触发，跑完自动清理这条临时任务。",
      )
      void load(true)
    } catch (cause) {
      setError(describeServerError(cause, current()))
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
    <Show
      when={api()}
      fallback={
        <div class="am-root">
          <Show
            when={current()}
            fallback={
              <div class="am-list">
                <div class="am-skeleton" />
                <div class="am-skeleton" />
              </div>
            }
          >
            {(server) => (
              <p class="am-error">
                未能连接到「{serverLabel(server())}」：这个服务器已在桌面端列出，但还没通过认证。请检查 设置 → 服务器
                中的地址与密码。
              </p>
            )}
          </Show>
        </div>
      }
    >
      <div class="am-root">
        <Show when={mode() === "list"}>
          <Show when={!props.embedded}>
            <section class="am-hero">
              <div>
                <h1>自动任务</h1>
                <p>
                  {remote()
                    ? "任务保存在所选服务器上，到点由那台机器执行；那台机器的服务停止期间不会触发。"
                    : "在 OpenCode 后台按计划运行提示词或代码。应用退出时不会触发；任务保存在本机服务中。"}
                </p>
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

          <Show when={servers().length > 1}>
            <div class="am-serverbar">
              <label class="am-server-pick">
                <span class="am-label">服务器</span>
                <select
                  class="am-select"
                  disabled={mode() !== "list" || busyId() !== ""}
                  value={current()?.id ?? ""}
                  title={current()?.url}
                  onChange={(event) => switchServer(event.currentTarget.value)}
                >
                  <For each={servers()}>
                    {(server) => (
                      <option value={server.id}>
                        {serverLabel(server)}
                        {server.connected ? "" : " · 未连接"}
                        {server.compatible ? "" : " · 版本不匹配"}
                      </option>
                    )}
                  </For>
                </select>
              </label>
              <Show when={remote() && current()}>
                {(server) => (
                  <span class="am-note" title={server().url}>
                    任务在那台机器上执行，执行目录也是它的路径（{serverHost(server().url)}）。
                  </span>
                )}
              </Show>
            </div>
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
                  <button type="button" class="am-btn am-btn-primary" disabled={!ready()} onClick={openCreate}>
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
                        client={client()}
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
                        onOpenSession={
                          props.openSession
                            ? (sessionID) => props.openSession?.(current()?.id ?? "", sessionID)
                            : undefined
                        }
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
            <Show when={remote() && current()}>
              {(server) => (
                <span class="am-note" title={server().url}>
                  建在「{serverLabel(server())}」上
                </span>
              )}
            </Show>
          </div>

          <Show when={error()}>
            <p class="am-error">{error()}</p>
          </Show>

          <TaskForm
            client={client()}
            mode={mode() === "edit" ? "edit" : "create"}
            initial={editing() ?? undefined}
            server={current()}
            onCancel={() => {
              setMode("list")
              setEditing(null)
            }}
            onSaved={(_info, saved) => {
              setMode("list")
              setEditing(null)
              setNotice(saved === "edit" ? "已保存：旧任务已删除，新任务已生效。" : "任务已创建。")
              void load(true)
            }}
          />
        </Show>
      </div>
    </Show>
  )
}
