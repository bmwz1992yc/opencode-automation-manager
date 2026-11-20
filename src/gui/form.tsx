import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { AutomationInfo, ServerOption } from "../types"
import type { AgentOption, ModelOption, TaskSpec, TriggerKind } from "../types"
import { AutomationClient, errorText } from "../client"
import { serverHost, serverLabel } from "../format"
import {
  clockText,
  draftFromTrigger,
  isValidCron,
  previewRuns,
  relativeTime,
  targetFromAction,
  toLocalInput,
  variantLabel,
} from "../format"

type DraftKind = Exclude<TriggerKind, "event">

const KINDS: Array<{ id: DraftKind; label: string }> = [
  { id: "in", label: "延迟" },
  { id: "at", label: "定时" },
  { id: "every", label: "间隔" },
  { id: "cron", label: "Cron" },
]

const EDIT_KINDS = KINDS.filter((kind) => kind.id !== "in")

const CRON_PRESETS = [
  { label: "每天 09:00", value: "0 9 * * *" },
  { label: "每天 21:00", value: "0 21 * * *" },
  { label: "工作日 09:00", value: "0 9 * * 1-5" },
  { label: "每小时", value: "0 * * * *" },
  { label: "每 30 分钟", value: "*/30 * * * *" },
  { label: "每周一 09:00", value: "0 9 * * 1" },
]

const MINUTE_PRESETS = ["5", "15", "30", "60", "180", "1440"]

const TZ_PRESETS = ["Asia/Shanghai", "Asia/Tokyo", "UTC", "America/New_York", "Europe/London"]

function minutesLabel(minutes: string): string {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) return minutes
  if (value >= 1440 && value % 1440 === 0) return `${value / 1440} 天`
  if (value >= 60 && value % 60 === 0) return `${value / 60} 小时`
  return `${value} 分钟`
}

export function TaskForm(props: {
  client: AutomationClient
  mode: "create" | "edit"
  initial?: AutomationInfo
  /** The server the task will live on; undefined for the app's own. */
  server?: ServerOption
  onSaved: (info: AutomationInfo, mode: "create" | "edit") => void
  onCancel: () => void
}) {
  const initial = props.initial
  const isEdit = props.mode === "edit"
  const remote = () => props.server !== undefined && !props.server.builtin && !props.server.local
  const directoryHint = () => {
    const server = props.server
    if (!server || !remote()) return "C:\\Users\\yangc\\opencode工作区域"
    return serverHost(server.url).startsWith("127.0.0.1") || serverHost(server.url).startsWith("localhost")
      ? "/home/user/work"
      : "/srv/work"
  }

  const [name, setName] = createSignal(initial?.name ?? "")
  const [actionType, setActionType] = createSignal<"prompt" | "code">(
    initial?.action.type === "code" ? "code" : "prompt",
  )
  const [prompt, setPrompt] = createSignal(initial?.action.type === "prompt" ? initial.action.prompt : "")
  const [code, setCode] = createSignal(initial?.action.type === "code" ? initial.action.code : "")
  const [codeArgs, setCodeArgs] = createSignal(
    initial?.action.type === "code" && initial.action.args !== undefined
      ? JSON.stringify(initial.action.args, null, 2)
      : "",
  )

  const baseDraft = initial
    ? draftFromTrigger(initial.trigger, initial.tz ?? "")
    : { kind: "every" as TriggerKind, minutes: "1440", at: "", cron: "0 9 * * *", tz: "Asia/Shanghai" }

  const [kind, setKind] = createSignal<DraftKind>(
    baseDraft.kind === "event" ? "cron" : (baseDraft.kind as DraftKind),
  )
  const [minutes, setMinutes] = createSignal(baseDraft.minutes)
  const [at, setAt] = createSignal(baseDraft.at || toLocalInput(Date.now() + 60 * 60_000))
  const [cron, setCron] = createSignal(baseDraft.cron || "0 9 * * *")
  const [tz, setTz] = createSignal(baseDraft.tz)

  const initialTarget = initial ? targetFromAction(initial.action) : ({ kind: "session" } as const)
  const [targetKind, setTargetKind] = createSignal<"session" | "subagent">(initialTarget.kind)
  const [agent, setAgent] = createSignal(initialTarget.kind === "subagent" ? initialTarget.agent : "general")

  const [directory, setDirectory] = createSignal(initial?.directory ?? "")
  const [expiresOn, setExpiresOn] = createSignal(initial?.expires !== undefined)
  const [expiresAt, setExpiresAt] = createSignal(
    initial?.expires !== undefined ? toLocalInput(initial.expires) : toLocalInput(Date.now() + 30 * 86_400_000),
  )
  const [modelKey, setModelKey] = createSignal("")
  const [originalModelKey, setOriginalModelKey] = createSignal("")
  const [variant, setVariant] = createSignal("")
  const [originalVariant, setOriginalVariant] = createSignal("")

  const [agents, setAgents] = createSignal<AgentOption[]>([])
  const [models, setModels] = createSignal<ModelOption[]>([])
  const [directories, setDirectories] = createSignal<string[]>([])
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal("")

  const [tick, setTick] = createSignal(0)
  onMount(() => {
    const clock = setInterval(() => setTick((value) => value + 1), 1000)
    onCleanup(() => clearInterval(clock))
  })
  const now = () => {
    void tick()
    return Date.now()
  }

  onMount(async () => {
    const [agentList, modelList, directoryList] = await Promise.allSettled([
      props.client.subagents(),
      props.client.modelCatalog(),
      props.client.recentDirectories(),
    ])
    if (agentList.status === "fulfilled") {
      setAgents(agentList.value)
      if (agentList.value.length > 0 && !agentList.value.some((item) => item.id === agent())) {
        setAgent(agentList.value[0].id)
      }
    }
    if (modelList.status === "fulfilled") {
      setModels(modelList.value)
      // 编辑时把绑定会话当前的模型作为基线：不改就不触发切换。
      if (isEdit && initial?.sessionID) {
        const meta = await props.client.sessionMeta(initial.sessionID)
        if (meta?.model) {
          const key = `${meta.model.providerID}/${meta.model.id}`
          setOriginalModelKey(key)
          setModelKey(key)
          if (meta.model.variant) {
            setOriginalVariant(meta.model.variant)
            setVariant(meta.model.variant)
          }
        }
      }
    }
    if (directoryList.status === "fulfilled") {
      setDirectories(directoryList.value)
      if (!directory() && directoryList.value.length > 0) setDirectory(directoryList.value[0])
    }
  })

  /** Catalog plus the stored model when the catalog no longer lists it. */
  const modelOptions = createMemo<ModelOption[]>(() => {
    const list = models()
    const key = originalModelKey()
    if (!key || list.some((item) => item.key === key)) return list
    const [providerID = "", id = key] = key.split("/")
    return [{ key, id, providerID, providerName: "", name: `${key}（当前）`, variants: [] }, ...list]
  })

  const selectedModel = createMemo(() => modelOptions().find((item) => item.key === modelKey()))
  const variantOptions = createMemo(() => selectedModel()?.variants ?? [])

  /** Pick a model: keep the reasoning level only when the new model offers it. */
  const chooseModel = (key: string) => {
    setModelKey(key)
    const next = modelOptions().find((item) => item.key === key)
    if (!next || !next.variants.includes(variant())) setVariant("")
  }

  /** The agent's own pinned model wins over the task session's model. */
  const selectedAgent = createMemo(() => agents().find((item) => item.id === agent()))
  const agentPinsModel = () => selectedAgent()?.model !== undefined

  const draft = createMemo(() => ({
    kind: kind(),
    minutes: minutes(),
    at: at(),
    cron: cron(),
    tz: tz(),
  }))

  const previews = createMemo(() => {
    void tick()
    return previewRuns(draft(), now(), 3)
  })

  const cronInvalid = () => kind() === "cron" && !isValidCron(cron())
  const atInvalid = () => {
    if (kind() !== "at") return false
    const parsed = Date.parse(at())
    return Number.isNaN(parsed) || parsed <= Date.now()
  }
  const minutesInvalid = () => (kind() === "in" || kind() === "every") && !(Number(minutes()) > 0)
  const expiresInvalid = () => {
    if (!expiresOn()) return false
    const parsed = Date.parse(expiresAt())
    return Number.isNaN(parsed) || parsed <= Date.now()
  }
  const argsInvalid = () => {
    if (actionType() !== "code" || !codeArgs().trim()) return false
    try {
      JSON.parse(codeArgs())
      return false
    } catch {
      return true
    }
  }
  const canSubmit = () =>
    !busy() &&
    !cronInvalid() &&
    !atInvalid() &&
    !minutesInvalid() &&
    !expiresInvalid() &&
    !argsInvalid() &&
    (actionType() === "prompt" ? prompt().trim().length > 0 : code().trim().length > 0)

  const resolvedName = () => {
    const typed = name().trim()
    if (typed) return typed
    const source = actionType() === "prompt" ? prompt() : code()
    return source.trim().slice(0, 40) || "未命名任务"
  }

  let submitting = false
  const submit = async () => {
    if (!canSubmit() || submitting) return
    submitting = true
    setBusy(true)
    setError("")
    const picked = models().find((item) => item.key === modelKey())
    // A subagent inherits the task session's model and reasoning level, so the
    // picker applies to both targets. Only a real change triggers a switch.
    const modelApplies = actionType() === "prompt"
    const changed = picked && (picked.key !== originalModelKey() || variant() !== originalVariant())
    const model =
      modelApplies && picked && changed
        ? { id: picked.id, providerID: picked.providerID, ...(variant() ? { variant: variant() } : {}) }
        : null
    const spec: TaskSpec = {
      name: resolvedName(),
      actionType: actionType(),
      prompt: prompt().trim(),
      code: code(),
      codeArgs: codeArgs(),
      trigger: draft(),
      target:
        targetKind() === "subagent" ? { kind: "subagent", agent: agent() } : { kind: "session" },
      directory: directory().trim(),
      expiresAt: expiresOn() ? expiresAt() : "",
      model,
    }
    try {
      const info =
        isEdit && initial ? await props.client.replaceTask(initial, spec) : await props.client.createTask(spec)
      props.onSaved(info, props.mode)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      submitting = false
      setBusy(false)
    }
  }

  const applyAtPreset = (minutesAhead: number, hour?: number) => {
    const date = new Date(Date.now() + minutesAhead * 60_000)
    if (hour !== undefined) date.setHours(hour, 0, 0, 0)
    setAt(toLocalInput(date.getTime()))
    setKind("at")
  }

  return (
    <div class="am-form">
      <Show when={remote() && props.server}>
        {(server) => (
          <p class="am-note">
            这条任务建在「{serverLabel(server())}」上：模型、子代理与目录都取自那台机器，到点由它执行。
          </p>
        )}
      </Show>

      <Show when={isEdit}>
        <p class="am-warn">
          官方接口没有「修改」操作，保存会新建一条任务再删除旧任务：任务 ID 会变、运行计数清零，其余配置原样保留。
        </p>
      </Show>

      <section class="am-section">
        <div class="am-section-title">
          <span>任务名称</span>
          <span class="am-section-hint">列表里显示的名字，留空则取内容前 40 字</span>
        </div>
        <input
          class="am-input"
          placeholder="例如：易代账税务进度日报"
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
        />
      </section>

      <section class="am-section">
        <div class="am-row">
          <div class="am-seg">
            <button
              type="button"
              classList={{ active: actionType() === "prompt" }}
              onClick={() => setActionType("prompt")}
            >
              提示词
            </button>
            <button
              type="button"
              classList={{ active: actionType() === "code" }}
              onClick={() => setActionType("code")}
            >
              代码
            </button>
          </div>
          <span class="am-section-hint">
            {actionType() === "prompt" ? "到点把这段提示词发给目标会话或子代理" : "到点运行 Code Mode 脚本，不调用模型"}
          </span>
        </div>

        <Show
          when={actionType() === "prompt"}
          fallback={
            <>
              <textarea
                class="am-textarea mono"
                placeholder="Code Mode JavaScript，例如：return { done: true }"
                value={code()}
                onInput={(event) => setCode(event.currentTarget.value)}
              />
              <div class="am-field">
                <label class="am-label">参数（JSON，可留空）</label>
                <textarea
                  class="am-textarea mono"
                  style={{ "min-height": "64px" }}
                  placeholder='{"key": "value"}'
                  value={codeArgs()}
                  onInput={(event) => setCodeArgs(event.currentTarget.value)}
                />
                <Show when={argsInvalid()}>
                  <span class="am-note" style={{ color: "var(--am-red)" }}>参数不是合法 JSON</span>
                </Show>
              </div>
            </>
          }
        >
          <textarea
            class="am-textarea"
            placeholder="写清楚要做什么、用什么数据、结果发到哪里——运行时它读不到当前会话的上下文"
            value={prompt()}
            onInput={(event) => setPrompt(event.currentTarget.value)}
          />
        </Show>
      </section>

      <section class="am-section">
        <div class="am-section-title">
          <span>触发方式</span>
          <span class="am-section-hint">
            {kind() === "in" || kind() === "at" ? "一次性" : "重复执行"}
          </span>
        </div>

        <div class="am-row">
          <div class="am-seg">
            <For each={isEdit ? EDIT_KINDS : KINDS}>
              {(item) => (
                <button type="button" classList={{ active: kind() === item.id }} onClick={() => setKind(item.id)}>
                  {item.label}
                </button>
              )}
            </For>
          </div>
        </div>

        <Show when={kind() === "in" || kind() === "every"}>
          <div class="am-field">
            <label class="am-label">{kind() === "in" ? "延迟（分钟）" : "间隔（分钟）"}</label>
            <div class="am-row">
              <input
                class="am-input"
                style={{ "max-width": "160px" }}
                type="number"
                min="1"
                value={minutes()}
                onInput={(event) => setMinutes(event.currentTarget.value)}
              />
              <span class="am-note">{minutesLabel(minutes())}</span>
            </div>
            <div class="am-presets">
              <For each={MINUTE_PRESETS}>
                {(preset) => (
                  <button type="button" class="am-chip" onClick={() => setMinutes(preset)}>
                    {minutesLabel(preset)}
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={kind() === "at"}>
          <div class="am-field">
            <label class="am-label">运行时间（本机时区）</label>
            <input
              class="am-input"
              style={{ "max-width": "260px" }}
              type="datetime-local"
              value={at()}
              onInput={(event) => setAt(event.currentTarget.value)}
            />
            <div class="am-presets">
              <button type="button" class="am-chip" onClick={() => applyAtPreset(60)}>
                1 小时后
              </button>
              <button type="button" class="am-chip" onClick={() => applyAtPreset(0, 9)}>
                今天 09:00
              </button>
              <button type="button" class="am-chip" onClick={() => applyAtPreset(1440, 9)}>
                明天 09:00
              </button>
            </div>
            <Show when={atInvalid()}>
              <span class="am-note" style={{ color: "var(--am-red)" }}>时间必须晚于当前时刻</span>
            </Show>
          </div>
        </Show>

        <Show when={kind() === "cron"}>
          <div class="am-field">
            <label class="am-label">Cron 表达式（5 字段：分 时 日 月 周）</label>
            <input
              class="am-input"
              style={{ "max-width": "260px" }}
              value={cron()}
              placeholder="0 9 * * 1-5"
              onInput={(event) => setCron(event.currentTarget.value)}
            />
            <div class="am-presets">
              <For each={CRON_PRESETS}>
                {(preset) => (
                  <button type="button" class="am-chip" onClick={() => setCron(preset.value)}>
                    {preset.label}
                  </button>
                )}
              </For>
            </div>
            <Show when={cronInvalid()}>
              <span class="am-note" style={{ color: "var(--am-red)" }}>表达式格式不正确</span>
            </Show>
          </div>
        </Show>

        <div class="am-field">
          <label class="am-label">时区（IANA 名称）</label>
          <input
            class="am-input"
            style={{ "max-width": "260px" }}
            list="am-tz-list"
            value={tz()}
            placeholder="Asia/Shanghai"
            onInput={(event) => setTz(event.currentTarget.value)}
          />
          <datalist id="am-tz-list">
            <For each={TZ_PRESETS}>{(zone) => <option value={zone} />}</For>
          </datalist>
        </div>

        <Show when={previews().length > 0}>
          <div class="am-note">
            参考：{previews().map((time) => `${clockText(time)}（${relativeTime(time, now())}）`).join("、")}
            <span class="am-sep"> · </span>实际以服务端下次触发时间为准
          </div>
        </Show>
      </section>

      <section class="am-section">
        <div class="am-section-title">
          <span>执行目标</span>
          <span class="am-section-hint">{isEdit ? "编辑时沿用原任务的绑定会话" : "决定任务在哪个会话里跑"}</span>
        </div>

        <Show when={actionType() === "prompt"}>
          <div class="am-row">
            <div class="am-seg">
              <button
                type="button"
                classList={{ active: targetKind() === "session" }}
                onClick={() => setTargetKind("session")}
              >
                独立会话
              </button>
              <button
                type="button"
                classList={{ active: targetKind() === "subagent" }}
                onClick={() => setTargetKind("subagent")}
              >
                子代理
              </button>
            </div>
          </div>
        </Show>

        <Show when={actionType() === "prompt" && targetKind() === "subagent"}>
          <div class="am-field">
            <label class="am-label">子代理</label>
            <select class="am-select" style={{ "max-width": "260px" }} value={agent()} onChange={(event) => setAgent(event.currentTarget.value)}>
              <Show when={agents().length === 0}>
                <option value="general">general</option>
              </Show>
              <For each={agents()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
            </select>
          </div>
        </Show>

        <div class="am-field">
          <label class="am-label">执行目录（留空用默认目录）</label>
          <input
            class="am-input"
            list="am-dir-list"
            placeholder={directoryHint()}
            value={directory()}
            onInput={(event) => setDirectory(event.currentTarget.value)}
          />
          <datalist id="am-dir-list">
            <For each={directories()}>{(dir) => <option value={dir} />}</For>
          </datalist>
          <Show when={remote() && props.server}>
            {(server) => (
              <span class="am-note">
                这是「{serverLabel(server())}」上的路径，不是本机路径；下面列出的建议来自那台机器的近期会话。
              </span>
            )}
          </Show>
        </div>

        <Show when={actionType() === "prompt"}>
          <div class="am-field">
            <label class="am-label">模型</label>
            <div class="am-row">
              <select
                class="am-select"
                style={{ "max-width": "300px" }}
                value={modelKey()}
                onChange={(event) => chooseModel(event.currentTarget.value)}
              >
                <option value="">跟随默认模型</option>
                <For each={modelOptions()}>
                  {(model) => (
                    <option value={model.key}>
                      {`${model.providerName ? `${model.providerName} · ` : ""}${model.name}`}
                    </option>
                  )}
                </For>
              </select>
              <Show when={modelKey() && variantOptions().length > 0}>
                <label class="am-label" style={{ "margin-left": "4px" }}>思考等级</label>
                <select
                  class="am-select"
                  style={{ "max-width": "140px" }}
                  value={variant()}
                  onChange={(event) => setVariant(event.currentTarget.value)}
                >
                  <option value="">默认</option>
                  <For each={variantOptions()}>{(item) => <option value={item}>{variantLabel(item)}</option>}</For>
                </select>
              </Show>
            </div>
            <span class="am-note">
              {targetKind() === "subagent"
                ? "子代理会继承这个任务的会话模型与思考等级；若该子代理在配置里固定了模型，以它的配置为准。"
                : isEdit
                  ? "改动后会切换原绑定会话的模型，历史对话不受影响；不改则保持原样。"
                  : "新建任务时会用这个模型开一个任务专用会话。"}
            </span>
            <Show when={targetKind() === "subagent" && agentPinsModel()}>
              <span class="am-note" style={{ color: "var(--am-amber)" }}>
                {`当前子代理 ${agent()} 在配置里固定了模型 ${selectedAgent()?.model?.providerID}/${selectedAgent()?.model?.id}，上面的选择对它不生效。`}
              </span>
            </Show>
          </div>
        </Show>
        <Show when={actionType() === "code"}>
          <p class="am-note">代码动作以 Code Mode 运行，不调用模型。</p>
        </Show>
      </section>

      <section class="am-section">
        <div class="am-section-title">
          <span>结束条件</span>
          <span class="am-section-hint">可留空，表示一直按计划运行</span>
        </div>
        <div class="am-row">
          <input
            type="checkbox"
            checked={expiresOn()}
            onChange={(event) => setExpiresOn(event.currentTarget.checked)}
          />
          <span class="am-note">到期后自动结束</span>
          <Show when={expiresOn()}>
            <input
              class="am-input"
              style={{ "max-width": "240px" }}
              type="datetime-local"
              value={expiresAt()}
              onInput={(event) => setExpiresAt(event.currentTarget.value)}
            />
          </Show>
        </div>
        <Show when={expiresInvalid()}>
          <span class="am-note" style={{ color: "var(--am-red)" }}>结束时间必须晚于当前时刻</span>
        </Show>
      </section>

      <Show when={error()}>
        <p class="am-error">{error()}</p>
      </Show>

      <div class="am-actions">
        <button type="button" class="am-btn" disabled={busy()} onClick={() => props.onCancel()}>
          取消
        </button>
        <span class="am-actions-spacer" />
        <button type="button" class="am-btn am-btn-primary" disabled={!canSubmit()} onClick={() => void submit()}>
          {busy() ? "保存中…" : isEdit ? "保存修改" : "创建任务"}
        </button>
      </div>
    </div>
  )
}
