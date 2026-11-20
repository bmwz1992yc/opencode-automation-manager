import type {
  AutomationAction,
  AutomationInfo,
  AutomationTrigger,
  TargetDraft,
  TriggerDraft,
} from "./types"

/** Text used for search and fallback titles. Code actions are never shown as prompts. */
export function actionText(action: AutomationAction): string {
  return action.type === "prompt" ? action.prompt : `[代码] ${action.code}`
}

export function actionLabel(action: AutomationAction): string {
  return action.type === "prompt" ? "提示词" : "代码"
}

/** Serialized args of a code action, or undefined for a prompt action. */
export function actionArgsText(action: AutomationAction): string | undefined {
  if (action.type !== "code") return undefined
  return action.args === undefined ? undefined : JSON.stringify(action.args)
}

export function taskTitle(info: AutomationInfo): string {
  const name = info.name?.trim()
  if (name) return name
  const text = actionText(info.action).trim()
  return text ? text.slice(0, 40) : info.id
}

/** Where a prompt lands: a bound session or a subagent. */
export function targetText(action: AutomationAction): string {
  if (action.type === "code") return "绑定会话"
  const to = action.to
  if (!to) return "未指定"
  if ("subagent" in to && to.subagent) return `子代理 · ${to.subagent}`
  if ("session" in to && to.session) return `会话 · ${shortID(to.session)}`
  return "未指定"
}

export function shortID(id: string | undefined): string {
  if (!id) return "—"
  return id.length > 14 ? `${id.slice(0, 14)}…` : id
}

/** Parse a duration like "90 minutes" or "2 hours" into minutes. */
export function durationToMinutes(text: string): number | null {
  const match = text.trim().match(/^([\d.]+)\s*(seconds?|minutes?|hours?|days?|secs?|mins?)$/i)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  const unit = match[2].toLowerCase()
  const size = unit.startsWith("d") ? 1440 : unit.startsWith("h") ? 60 : unit.startsWith("m") ? 1 : 1 / 60
  return value * size
}

/** Human duration from a raw duration string. */
export function describeDuration(text: string): string {
  const minutes = durationToMinutes(text)
  if (minutes === null) return text
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} 天`
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} 小时`
  if (minutes >= 1 && Number.isInteger(minutes)) return `${minutes} 分钟`
  return `${Math.round(minutes * 60)} 秒`
}

/** Plain-Chinese description of a stored trigger. */
export function describeTrigger(trigger: AutomationTrigger): string {
  if (trigger.type === "at") return `${clockText(Date.parse(trigger.at))} 触发（一次性）`
  if (trigger.type === "every") return `每 ${describeDuration(trigger.every)}`
  if (trigger.type === "cron") return describeCron(trigger.cron)
  return `事件 ${trigger.server}/${trigger.event}`
}

/** Human description of a 5-field cron expression; falls back to the raw text. */
export function describeCron(expr: string): string {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return expr
  const [min, hour, dom, month, dow] = fields

  const timeText = (h: string, m: string): string | null => {
    if (h === "*" || m === "*") return null
    const hh = Number(h)
    const mm = Number(m)
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
  }

  const dowNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
  const dowText = (): string | null => {
    if (dow === "*") return null
    if (dow === "1-5" || dow === "1,2,3,4,5") return "工作日"
    if (dow === "0,6" || dow === "6,0") return "周末"
    const parts = dow.split(",").map((part) => {
      if (part.includes("-")) return null
      const day = Number(part)
      return Number.isInteger(day) && day >= 0 && day <= 7 ? dowNames[day % 7] : null
    })
    if (parts.some((part) => part === null)) return null
    return parts.join("、")
  }

  const dailyTime = timeText(hour, min)
  if (dailyTime) {
    const day = dowText()
    if (day) return `${day} ${dailyTime}`
    if (dom === "*" && month === "*") return `每天 ${dailyTime}`
    if (month === "*") return `每月 ${dom} 日 ${dailyTime}`
  }
  if (hour === "*" && min !== "*" && dom === "*" && month === "*" && dow === "*") {
    if (/^\*\/\d+$/.test(min)) return `每 ${min.slice(2)} 分钟`
    return `每小时第 ${min} 分`
  }
  if (min === "0" && hour.startsWith("*/") && dom === "*" && month === "*" && dow === "*") {
    return `每 ${hour.slice(2)} 小时`
  }
  if (hour === "*" && min.startsWith("*/") && dom === "*" && month === "*" && dow === "*") {
    return `每 ${min.slice(2)} 分钟`
  }
  return expr
}

const UNITS: Array<[string, number]> = [
  ["天", 86_400_000],
  ["小时", 3_600_000],
  ["分钟", 60_000],
]

/** Compact relative time: "3 天 2 小时后", "5 分钟前", "刚刚". */
export function relativeTime(at: number | undefined, now: number): string {
  if (at === undefined) return "—"
  const diff = at - now
  const abs = Math.abs(diff)
  if (abs < 60_000) return diff > 0 ? "1 分钟内" : "刚刚"
  const parts: string[] = []
  let rest = abs
  for (const [label, size] of UNITS) {
    if (rest >= size) {
      const value = Math.floor(rest / size)
      parts.push(`${value} ${label}`)
      rest -= value * size
      if (parts.length === 2) break
    }
  }
  const text = parts.join(" ") || "<1 秒"
  return diff > 0 ? `${text}后` : `${text}前`
}

/** "MM-DD HH:mm" in local time. */
export function clockText(at: number | undefined): string {
  if (at === undefined || Number.isNaN(at)) return "—"
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** "YYYY-MM-DD HH:mm" in local time. */
export function dateTimeText(at: number | undefined): string {
  if (at === undefined || Number.isNaN(at)) return "—"
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** datetime-local input value for a timestamp. */
export function toLocalInput(at: number): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function outcomeLabel(outcome: string | undefined): { text: string; tone: "ok" | "warn" | "bad" } | null {
  if (!outcome) return null
  if (outcome === "fired") return { text: "已触发", tone: "ok" }
  if (outcome === "late") return { text: "延迟触发", tone: "warn" }
  if (outcome === "expired") return { text: "已过期", tone: "warn" }
  if (outcome === "skipped") return { text: "已跳过", tone: "warn" }
  if (outcome === "disabled") return { text: "已禁用", tone: "warn" }
  if (outcome === "failed") return { text: "触发失败", tone: "bad" }
  return { text: outcome, tone: "warn" }
}

export function statusLabel(status: string): string {  if (status === "active") return "进行中"
  if (status === "paused") return "已暂停"
  if (status === "done") return "已结束"
  return status
}

/** Human label for a reasoning level (`variant` in the API). */
export function variantLabel(variant: string | undefined): string {
  if (!variant) return "默认"
  const labels: Record<string, string> = {
    default: "默认",
    none: "不思考",
    minimal: "极少",
    low: "低",
    medium: "中",
    high: "高",
    xhigh: "极高",
  }
  return labels[variant] ?? variant
}

/** Server run notes are terse machine text; show what they mean. */
export function friendlyOutput(text: string | undefined): string {
  if (!text) return ""
  if (text.startsWith("Prompted ")) return "已把提示词投递到绑定会话"
  if (text.startsWith("Started subagent ")) return "已启动子代理运行"
  return text
}

const CRON_FIELD_RANGES: Array<[number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
]

function parseCronField(field: string, low: number, high: number): boolean {
  for (const part of field.split(",")) {
    const step = part.split("/")
    const range = step[0]
    if (step.length > 2) return false
    if (step.length === 2) {
      const interval = Number(step[1])
      if (!Number.isInteger(interval) || interval <= 0) return false
    }
    if (range === "*") continue
    const bounds = range.split("-")
    if (bounds.length > 2) return false
    for (const bound of bounds) {
      const value = Number(bound)
      if (!Number.isInteger(value) || value < low || value > high) return false
    }
  }
  return true
}

export function isValidCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return false
  return fields.every((field, index) => {
    const [low, high] = CRON_FIELD_RANGES[index]
    return field.length > 0 && parseCronField(field, low, high)
  })
}

function fieldMatches(field: string, value: number, high: number, dow = false): boolean {
  if (field === "*") return true
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/")
    const step = stepPart === undefined ? 1 : Number(stepPart)
    let low: number
    let highBound: number
    if (rangePart === "*") {
      low = 0
      highBound = high
    } else {
      const bounds = rangePart.split("-")
      low = Number(bounds[0])
      highBound = bounds.length === 2 ? Number(bounds[1]) : stepPart !== undefined ? high : low
    }
    for (let candidate = low; candidate <= highBound; candidate += step) {
      if (candidate === value || (dow && candidate === 7 && value === 0) || (dow && candidate === 0 && value === 7)) {
        return true
      }
    }
  }
  return false
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Next fire times of a cron expression after `from` (local time), oldest first. */
export function nextCronRuns(expr: string, from: number, count: number): number[] {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return []
  const [minField, hourField, domField, monthField, dowField] = fields
  const domRestricted = domField !== "*"
  const dowRestricted = dowField !== "*"

  const runs: number[] = []
  const cursor = new Date(from)
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  for (let guard = 0; guard < 366 * 24 * 60 && runs.length < count; guard += 1) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    if (!fieldMatches(monthField, month + 1, 12)) {
      cursor.setMonth(month + 1, 1)
      cursor.setHours(0, 0, 0, 0)
      continue
    }
    const dayOk =
      fieldMatches(domField, cursor.getDate(), daysInMonth(year, month)) &&
      fieldMatches(dowField, cursor.getDay(), 7, true)
    const dayCombined =
      domRestricted && dowRestricted
        ? fieldMatches(domField, cursor.getDate(), daysInMonth(year, month)) ||
          fieldMatches(dowField, cursor.getDay(), 7, true)
        : dayOk
    if (!dayCombined) {
      cursor.setDate(cursor.getDate() + 1)
      cursor.setHours(0, 0, 0, 0)
      continue
    }
    if (!fieldMatches(hourField, cursor.getHours(), 23)) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0)
      continue
    }
    if (!fieldMatches(minField, cursor.getMinutes(), 59)) {
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0)
      continue
    }
    runs.push(cursor.getTime())
    cursor.setMinutes(cursor.getMinutes() + 1, 0, 0)
  }
  return runs
}

/** Reference-only preview timestamps (local estimate, never the official nextDueAt). */
export function previewRuns(draft: TriggerDraft, now: number, count = 4): number[] {
  if (draft.kind === "cron") return isValidCron(draft.cron) ? nextCronRuns(draft.cron, now, count) : []
  if (draft.kind === "in") {
    const minutes = Number(draft.minutes)
    return Number.isFinite(minutes) && minutes > 0 ? [now + minutes * 60_000] : []
  }
  if (draft.kind === "at") {
    const at = Date.parse(draft.at)
    return Number.isNaN(at) ? [] : [at]
  }
  if (draft.kind === "every") {
    const minutes = Number(draft.minutes)
    if (!Number.isFinite(minutes) || minutes <= 0) return []
    return Array.from({ length: count }, (_, index) => now + (index + 1) * minutes * 60_000)
  }
  return []
}

/** Turn a stored trigger into a form draft, so 编辑 opens on the current settings. */
export function draftFromTrigger(trigger: AutomationTrigger, tz: string): TriggerDraft {
  const base: TriggerDraft = { kind: "cron", minutes: "", at: "", cron: "", tz }
  if (trigger.type === "cron") return { ...base, kind: "cron", cron: trigger.cron }
  if (trigger.type === "every") {
    const minutes = durationToMinutes(trigger.every)
    return { ...base, kind: "every", minutes: minutes === null ? "" : String(Math.round(minutes)) }
  }
  if (trigger.type === "at") {
    const parsed = Date.parse(trigger.at)
    const at = Number.isNaN(parsed) ? "" : toLocalInput(parsed)
    // A one-shot in the past can no longer run; keep it visible but let the user re-pick.
    return { ...base, kind: "at", at }
  }
  return { ...base, kind: "event" }
}

export function targetFromAction(action: AutomationAction): TargetDraft {
  if (action.type === "prompt" && action.to && "subagent" in action.to && action.to.subagent) {
    return { kind: "subagent", agent: action.to.subagent }
  }
  return { kind: "session" }
}

/** Last path segment of a directory, for compact display. */
export function dirName(directory: string | undefined): string {
  if (!directory) return ""
  const trimmed = directory.replace(/[\\/]+$/, "")
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  return index >= 0 ? trimmed.slice(index + 1) || trimmed : trimmed
}
