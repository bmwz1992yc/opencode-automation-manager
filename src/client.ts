import type {
  AutomationInfo,
  ExperimentalAutomationCreateInput,
  OpenCodeClient,
  SessionInfo,
} from "@opencode/client/promise"
import type {
  AgentOption,
  ModelOption,
  ModelPick,
  RunRecord,
  RunTurn,
  SessionMeta,
  TaskSpec,
  TriggerDraft,
} from "./types"

/** Name prefix that marks a temporary "run now" automation this plugin owns. */
export const RUN_NOW_PREFIX = "⚡ 立即执行 · "

/** How long a run-now automation may wait past its due time before it is swept. */
const RUN_NOW_GRACE_MS = 5 * 60_000

function errorText(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (cause !== null && typeof cause === "object" && "message" in cause) {
    return String((cause as { message?: unknown }).message)
  }
  return String(cause)
}

export { errorText }

function isStaleRunNow(info: AutomationInfo, now: number): boolean {
  if (!info.name.startsWith(RUN_NOW_PREFIX)) return false
  if (info.status === "done") return true
  if (info.lastRunAt !== undefined) return true
  // Never fired and already far past due: the app was likely closed at trigger time.
  const due = info.nextDueAt
  return due !== undefined && now > due + RUN_NOW_GRACE_MS
}

/** Turn the form draft into the official trigger payload. */
export function buildTrigger(draft: TriggerDraft): ExperimentalAutomationCreateInput["trigger"] {
  const tz = draft.tz.trim()
  if (draft.kind === "in") {
    const minutes = Math.max(1, Math.round(Number(draft.minutes) || 1))
    // A relative delay is resolved server-side; a zone would be redundant.
    return { type: "at", at: `in ${minutes} minutes` }
  }
  if (draft.kind === "at") {
    return { type: "at", at: draft.at, ...(tz ? { tz } : {}) }
  }
  if (draft.kind === "every") {
    const minutes = Math.max(1, Math.round(Number(draft.minutes) || 1))
    return { type: "every", every: `${minutes} minutes`, ...(tz ? { tz } : {}) }
  }
  if (draft.kind === "cron") {
    return { type: "cron", cron: draft.cron.trim(), ...(tz ? { tz } : {}) }
  }
  // `event` tasks can only be replaced verbatim; the form never authors one.
  throw new Error("事件触发任务无法在此修改触发方式")
}

function parseCodeArgs(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  return JSON.parse(trimmed)
}

function toExpires(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) throw new Error("结束时间无效")
  return new Date(parsed).toISOString()
}

/** Joined text parts of an assistant message. */
function assistantText(message: { content: ReadonlyArray<{ type: string; text?: string }> }): string {
  return message.content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim()
}

export class AutomationClient {  private titles = new Map<string, string>()
  private meta = new Map<string, SessionMeta>()
  /** Cached `/api/info` version; null once a probe failed. */
  private version: string | null | undefined

  constructor(private readonly client: OpenCodeClient) {}

  /**
   * The server's own version, for diagnosing a missing automation API. Probed
   * once per client; undefined when the server does not answer `/api/info`.
   */
  async serverVersion(): Promise<string | undefined> {
    if (this.version === null) return undefined
    if (this.version !== undefined) return this.version
    try {
      const info = await this.client.server.info()
      this.version = info?.version?.trim() || null
    } catch {
      this.version = null
    }
    return this.version ?? undefined
  }

  /** All automations, with this plugin's spent run-now helpers swept away. */
  async list(): Promise<AutomationInfo[]> {
    let items = await this.client.experimental.automation.list()
    const now = Date.now()
    const stale = items.filter((item) => isStaleRunNow(item, now))
    if (stale.length > 0) {
      const removed = new Set<string>()
      await Promise.all(
        stale.map(async (item) => {
          try {
            await this.client.experimental.automation.delete({ automationID: item.id })
            removed.add(item.id)
          } catch {
            // A sweep failure is harmless: the row stays visible one more refresh.
          }
        }),
      )
      if (removed.size > 0) items = items.filter((item) => !removed.has(item.id))
    }
    return items
  }

  async get(automationID: string): Promise<AutomationInfo> {
    return this.client.experimental.automation.get({ automationID })
  }

  async pause(automationID: string): Promise<AutomationInfo> {
    return this.client.experimental.automation.pause({ automationID })
  }

  async resume(automationID: string): Promise<AutomationInfo> {
    return this.client.experimental.automation.resume({ automationID })
  }

  async remove(automationID: string): Promise<void> {
    await this.client.experimental.automation.delete({ automationID })
  }

  /** Display metadata of bound sessions, fetched once each. */
  async sessionMeta(sessionID: string | undefined): Promise<SessionMeta | undefined> {
    if (!sessionID) return undefined
    const cached = this.meta.get(sessionID)
    if (cached) return cached
    try {
      const session = await this.client.session.get({ sessionID })
      const meta: SessionMeta = {
        ...(session.title?.trim() ? { title: session.title.trim() } : {}),
        ...(session.model
          ? { model: { id: session.model.id, providerID: session.model.providerID, ...(session.model.variant ? { variant: session.model.variant } : {}) } }
          : {}),
        ...(session.agent ? { agent: session.agent } : {}),
      }
      this.meta.set(sessionID, meta)
      if (meta.title) this.titles.set(sessionID, meta.title)
      return meta
    } catch {
      return undefined
    }
  }

  /** Display title of a bound session, fetched once. */
  async sessionTitle(sessionID: string | undefined): Promise<string | undefined> {
    if (!sessionID) return undefined
    const cached = this.titles.get(sessionID)
    if (cached !== undefined) return cached
    return (await this.sessionMeta(sessionID))?.title
  }

  /** Create a task from the form spec. */
  async createTask(spec: TaskSpec): Promise<AutomationInfo> {
    // Every action needs a session: a prompt to a subagent is delivered from a
    // parent session, and a code action is rejected without one.
    const session = await this.createMountSession(spec)
    return this.client.experimental.automation.create(this.buildPayload(spec, session.id))
  }

  /**
   * Replace an automation. The official API has no update: build the new task
   * first, keep the old one until the new one exists, then delete it. A paused
   * task stays paused.
   */
  async replaceTask(old: AutomationInfo, spec: TaskSpec): Promise<AutomationInfo> {
    let sessionID = old.sessionID
    let createdSessionID: string | undefined
    if (!sessionID) {
      const session = await this.createMountSession(spec)
      sessionID = session.id
      createdSessionID = session.id
    }

    // A picked model on a reused session is a session setting, not a task field:
    // switch it first, so a failed switch leaves the old task untouched. A
    // subagent inherits this session's model unless its own config pins one.
    if (!createdSessionID && spec.model) {
      await this.switchSessionModel(sessionID, spec.model)
    }

    let created: AutomationInfo
    try {
      created = await this.client.experimental.automation.create(this.buildPayload(spec, sessionID))
    } catch (cause) {
      if (createdSessionID) {
        try {
          await this.client.session.remove({ sessionID: createdSessionID })
        } catch {
          // The orphan session is harmless; surface the original failure.
        }
      }
      throw cause
    }

    if (old.status === "paused") {
      try {
        await this.client.experimental.automation.pause({ automationID: created.id })
      } catch {
        // Not fatal: the replacement still exists, only its status may differ.
      }
    }

    try {
      await this.client.experimental.automation.delete({ automationID: old.id })
    } catch (cause) {
      throw new Error(
        `新任务已创建（${created.id}），但删除旧任务失败：${errorText(cause)}。请在列表中手动删除旧任务，避免重复触发。`,
      )
    }

    return this.client.experimental.automation.get({ automationID: created.id })
  }

  /**
   * Run a task's action once, right away. The official API has no run endpoint,
   * so this creates a one-shot automation due in ~1 minute that reuses the
   * task's action and target, and sweeps it after it fires.
   */
  async runNow(info: AutomationInfo): Promise<AutomationInfo> {
    return this.client.experimental.automation.create({
      name: `${RUN_NOW_PREFIX}${info.name}`,
      trigger: { type: "at", at: "in 1 minute" },
      action: info.action,
      ...(info.sessionID ? { sessionID: info.sessionID } : {}),
      ...(info.directory ? { directory: info.directory } : {}),
    })
  }

  /** Switch a bound session's model and verify it took effect. */
  private async switchSessionModel(sessionID: string, model: ModelPick): Promise<void> {
    await this.client.session.switchModel({
      sessionID,
      model: { id: model.id, providerID: model.providerID, ...(model.variant ? { variant: model.variant } : {}) },
    })
    const verify = await this.client.session.get({ sessionID })
    const current = verify.model
    if (!current || current.id !== model.id || current.providerID !== model.providerID) {
      throw new Error(`模型切换未生效（${model.providerID}/${model.id}），任务未修改。`)
    }
    if (model.variant && current.variant !== model.variant) {
      throw new Error(`思考等级切换未生效（${model.variant}），任务未修改。`)
    }
    this.meta.delete(sessionID)
  }

  private async createMountSession(spec: TaskSpec): Promise<SessionInfo> {
    return this.client.session.create({
      title: `自动任务：${spec.name}`,
      ...(spec.model ? { model: spec.model } : {}),
      ...(spec.directory.trim() ? { location: { directory: spec.directory.trim() } } : {}),
    })
  }

  private buildPayload(spec: TaskSpec, sessionID: string): ExperimentalAutomationCreateInput {
    const name = spec.name.trim()
    const directory = spec.directory.trim()

    let action: ExperimentalAutomationCreateInput["action"]
    if (spec.actionType === "code") {
      const args = parseCodeArgs(spec.codeArgs)
      action = {
        type: "code",
        code: spec.code,
        ...(args !== undefined ? { args } : {}),
      } as ExperimentalAutomationCreateInput["action"]
    } else if (spec.target.kind === "subagent") {
      action = { type: "prompt", prompt: spec.prompt, to: { subagent: spec.target.agent } }
    } else {
      action = { type: "prompt", prompt: spec.prompt, to: { session: sessionID } }
    }

    return {
      name,
      trigger: buildTrigger(spec.trigger),
      action,
      sessionID,
      ...(directory ? { directory } : {}),
      ...(spec.expiresAt.trim() ? { expires: toExpires(spec.expiresAt) } : {}),
    }
  }

  /**
   * Past runs are child sessions named `ses_<automationID>_<n>`. They outlive
   * the automation, so a deleted task still shows what its last runs did.
   */
  async history(automationID: string, limit = 6): Promise<RunRecord[]> {
    const prefix = `ses_${automationID}_`
    const found: RunRecord[] = []
    let cursor: string | undefined

    for (let page = 0; page < 5; page += 1) {
      const response = await this.client.session.list({
        limit: 200,
        order: "desc",
        ...(cursor ? { cursor } : {}),
      })
      const rows = response.data ?? []
      for (const session of rows) {
        if (!session.id.startsWith(prefix)) continue
        const raw = session.id.slice(prefix.length)
        const parsed = Number.parseInt(raw, 10)
        const time = session.time
        found.push({
          sessionID: session.id,
          index: Number.isFinite(parsed) ? parsed : 0,
          createdAt: time?.created ?? 0,
          updatedAt: time?.updated ?? 0,
          running: time?.busy !== undefined && (time?.idle ?? 0) < time.busy,
        })
      }
      const next = response.cursor?.next
      if (!next || rows.length === 0) break
      // Older pages cannot contain newer runs; stop once this page reaches past them.
      if (found.length >= limit) break
      cursor = next
    }

    found.sort((a, b) => b.createdAt - a.createdAt)
    return found.slice(0, limit)
  }

  /** Last assistant text of a run session. */
  async runOutput(sessionID: string): Promise<string> {
    const response = await this.client.message.list({
      sessionID,
      limit: 1,
      order: "desc",
      type: "assistant",
    })
    const message = response.data?.[0]
    if (!message || message.type !== "assistant") return ""
    return assistantText(message)
  }

  /**
   * Runs of a task that prompts its own session. That session is dedicated to
   * the task, so each user turn is one run and the assistant text after it is
   * its output. Newest first.
   */
  async sessionTurns(sessionID: string, limit = 6): Promise<RunTurn[]> {
    const response = await this.client.message.list({ sessionID, limit: 80, order: "desc" })
    const turns: RunTurn[] = []
    let buffer: string[] = []
    for (const message of response.data ?? []) {
      if (message.type === "user") {
        turns.push({
          messageID: message.id,
          createdAt: message.time?.created ?? 0,
          prompt: message.text ?? "",
          reply: buffer.slice().reverse().join("\n\n").trim(),
        })
        buffer = []
        if (turns.length >= limit) break
      } else if (message.type === "assistant") {
        const text = assistantText(message)
        if (text) buffer.push(text)
      }
    }
    return turns
  }

  /** Chat models, flattened for a simple select. */
  async modelCatalog(): Promise<ModelOption[]> {
    const [models, providers] = await Promise.all([
      this.client.model.list({ types: ["chat"] }),
      this.client.provider.list(),
    ])
    const names = new Map<string, string>()
    for (const provider of providers.data ?? []) names.set(provider.id, provider.name || provider.id)
    const options: ModelOption[] = []
    for (const model of models.data ?? []) {
      if (model.enabled === false || model.status === "deprecated") continue
      options.push({
        // The session/automation model ref uses ModelInfo.id, so the key must too.
        key: `${model.providerID}/${model.id}`,
        id: model.id,
        providerID: model.providerID,
        providerName: names.get(model.providerID) || model.providerID,
        name: model.name?.trim() || model.id,
        variants: (model.variants ?? []).map((variant: { id: string }) => variant.id).filter((id) => id !== "none"),
      })
    }
    options.sort((a, b) => `${a.providerName}${a.name}`.localeCompare(`${b.providerName}${b.name}`))
    return options
  }

  /** Subagents a prompt can be delivered to. */
  async subagents(): Promise<AgentOption[]> {
    try {
      const response = await this.client.agent.list()
      return (response.data ?? [])
        .filter((agent) => agent.mode === "subagent" || agent.mode === "all")
        .filter((agent) => !["compaction", "title", "summary"].includes(agent.id))
        .map((agent) => ({
          id: agent.id,
          name: agent.name || agent.id,
          description: agent.description,
          ...(agent.model
            ? {
                model: {
                  id: agent.model.id,
                  providerID: agent.model.providerID,
                  ...(agent.model.variant ? { variant: agent.model.variant } : {}),
                },
              }
            : {}),
        }))
    } catch {
      return []
    }
  }

  /** Project directories seen in recent sessions, most used first. */
  async recentDirectories(): Promise<string[]> {
    try {
      const response = await this.client.session.list({ limit: 100, order: "desc" })
      const counts = new Map<string, number>()
      for (const session of response.data ?? []) {
        const directory = session.location?.directory?.trim()
        if (!directory) continue
        counts.set(directory, (counts.get(directory) ?? 0) + 1)
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([directory]) => directory)
    } catch {
      return []
    }
  }
}
