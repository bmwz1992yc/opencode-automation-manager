// Types for the automation manager. Official Automation* shapes come from the
// OpenCode 2.3.2 client contract; the rest are pure UI/form models.
import type {
  AutomationAction,
  AutomationInfo,
  AutomationOutcome,
  AutomationStatus,
  AutomationTrigger,
  OpenCodeClient,
} from "@opencode/client/promise"

export type { AutomationAction, AutomationInfo, AutomationOutcome, AutomationStatus, AutomationTrigger }

/** The kinds of trigger the form can author. `event` is read-only (existing tasks). */
export type TriggerKind = "in" | "at" | "every" | "cron" | "event"

/** Form-side trigger model. Kept flat so one draft can hold every kind. */
export interface TriggerDraft {
  kind: TriggerKind
  /** Delay / interval, in minutes, as typed. */
  minutes: string
  /** One-shot wall clock, as a datetime-local value. */
  at: string
  cron: string
  /** IANA zone, e.g. Asia/Shanghai. Empty follows the server default. */
  tz: string
}

export type TargetDraft = { kind: "session" } | { kind: "subagent"; agent: string }

export interface ModelPick {
  id: string
  providerID: string
  variant?: string
}

export interface ModelOption {
  key: string
  id: string
  providerID: string
  providerName: string
  name: string
  /** Reasoning levels the model accepts, from the server's model catalog. */
  variants: string[]
}

/** Everything the form collects, independent of create vs edit. */
export interface TaskSpec {
  name: string
  actionType: "prompt" | "code"
  prompt: string
  code: string
  /** JSON text for a code action's args; empty means none. */
  codeArgs: string
  trigger: TriggerDraft
  target: TargetDraft
  directory: string
  /** datetime-local expiry, empty for none. */
  expiresAt: string
  /** Only used when this create builds a fresh mount session. */
  model: ModelPick | null
}

/** Display metadata of a session bound to an automation. */
export interface SessionMeta {
  title?: string
  model?: ModelPick
  agent?: string
}

/** One historical run of an automation, discovered as a child session. */
export interface RunRecord {
  sessionID: string
  /** Run number parsed from `ses_<automationID>_<n>`. */
  index: number
  createdAt: number
  updatedAt: number
  running: boolean
  /** Last assistant text, filled in lazily. */
  text?: string
  textError?: string
}

/** One run of a task that prompts its own dedicated session. */
export interface RunTurn {
  messageID: string
  createdAt: number
  prompt: string
  reply: string
}

export interface AgentOption {
  id: string
  name: string
  description?: string
  /** A model pinned in the agent's own config; it overrides the task session's model. */
  model?: ModelPick
}

/**
 * One server the desktop app has connected, reduced to what the manager needs.
 * `client` is that server's own API client, so every call made through it lands
 * on that machine.
 */
export interface ServerOption {
  id: string
  name: string
  url: string
  /** The app's own server, the desktop sidecar. */
  builtin: boolean
  /** The app's own server, or a loopback connection to its port. */
  local: boolean
  /** The event connection to this server is up. */
  connected: boolean
  /** A health check did not find the server's version incompatible. */
  compatible: boolean
  /**
   * That server's API client. Absent for a server the app lists but has not
   * authenticated with yet (for example a wrong password), so it cannot be used.
   */
  client: OpenCodeClient | null
}

