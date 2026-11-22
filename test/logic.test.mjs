import assert from "node:assert/strict"
import {
  describeCron,
  describeTrigger,
  draftFromTrigger,
  durationToMinutes,
  friendlyOutput,
  isValidCron,
  nextCronRuns,
  toLocalInput,
  previewRuns,
  friendlyOutput as fo,
  serverHost,
  serverLabel,
  looksLikeMissingRoute,
  describeServerError,
  isLegacyAutomationVersion,
  runMode,
} from "./.build/format.js"
import { AutomationClient } from "./.build/client.js"
import { toServerOption, pickDefaultServer, isServerReady } from "./.build/servers.js"

// cron human text
assert.equal(describeCron("0 21 * * *"), "每天 21:00")
assert.equal(describeCron("0 9 * * 1-5"), "工作日 09:00")
assert.equal(describeCron("*/30 * * * *"), "每 30 分钟")
assert.equal(describeCron("0 9 * * 1"), "周一 09:00")
assert.equal(isValidCron("0 9 * * 1-5"), true)
assert.equal(isValidCron("0 9 * *"), false)
assert.equal(isValidCron("99 9 * * *"), false)

// durations
assert.equal(durationToMinutes("2 hours"), 120)
assert.equal(durationToMinutes("90 minutes"), 90)
assert.equal(durationToMinutes("30 seconds"), 0.5)

// trigger -> draft round trip
const cronDraft = draftFromTrigger({ type: "cron", cron: "0 21 * * *", tz: "Asia/Shanghai" }, "Asia/Shanghai")
assert.equal(cronDraft.kind, "cron")
assert.equal(cronDraft.cron, "0 21 * * *")

const everyDraft = draftFromTrigger({ type: "every", every: "2 hours" }, "UTC")
assert.equal(everyDraft.kind, "every")
assert.equal(everyDraft.minutes, "120")
assert.equal(everyDraft.tz, "UTC")

const atMs = Date.now() + 3 * 3600_000
const atDraft = draftFromTrigger({ type: "at", at: new Date(atMs).toISOString() }, "Asia/Shanghai")
assert.equal(atDraft.kind, "at")
assert.ok(atDraft.at.includes("T"), `datetime-local shape: ${atDraft.at}`)
assert.equal(Math.abs(Date.parse(atDraft.at) - Math.floor(atMs / 60000) * 60000) < 120000, true)

assert.equal(describeTrigger({ type: "cron", cron: "0 21 * * *" }), "每天 21:00")
assert.equal(friendlyOutput("Prompted ses_abc"), "已把提示词投递到绑定会话")
assert.equal(friendlyOutput("Started subagent ses_x_1"), "已启动子代理运行")
assert.equal(fo("other text"), "other text")

// preview
const pv = previewRuns({ kind: "cron", minutes: "", at: "", cron: "0 21 * * *", tz: "" }, Date.now(), 3)
assert.equal(pv.length, 3)
assert.ok(pv[0] < pv[1] && pv[1] < pv[2])
assert.equal(new Date(pv[0]).getHours(), 21)
assert.equal(new Date(pv[0]).getMinutes(), 0)

const nr = nextCronRuns("*/15 * * * *", Date.now(), 4)
assert.equal(nr.length, 4)
assert.ok(nr.every((t) => new Date(t).getMinutes() % 15 === 0))

// sessionTurns: newest-first message stream -> turns with replies
const fixtures = [
  { id: "m5", type: "assistant", time: { created: 500 }, content: [{ type: "text", text: "答复二" }] },
  { id: "m4", type: "user", time: { created: 400 }, text: "提示词二" },
  { id: "m3", type: "assistant", time: { created: 300 }, content: [{ type: "reasoning", text: "思考" }] },
  { id: "m2", type: "assistant", time: { created: 200 }, content: [{ type: "text", text: "答复一" }] },
  { id: "m1", type: "user", time: { created: 100 }, text: "提示词一" },
]
const stub = {
  message: { list: async () => ({ data: fixtures, cursor: { previous: null, next: null } }) },
}
const client = new AutomationClient(stub)
const turns = await client.sessionTurns("ses_test", 5)
assert.equal(turns.length, 2)
assert.equal(turns[0].prompt, "提示词二")
assert.equal(turns[0].reply, "答复二")
assert.equal(turns[1].prompt, "提示词一")
assert.equal(turns[1].reply, "答复一")

// toLocalInput shape
assert.match(toLocalInput(1795145713092), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)

// ---- servers ----
assert.equal(serverHost("http://204.152.198.222:4096"), "204.152.198.222:4096")
assert.equal(serverHost("https://oc.example.com/"), "oc.example.com")
assert.equal(serverHost("not a url"), "not a url")

const localRef = {
  id: "sidecar",
  name: "sidecar",
  url: "http://127.0.0.1:4096",
  builtin: true,
  local: true,
  connected: true,
  compatible: true,
  client: {},
}
const remoteRef = {
  id: "http://204.152.198.222:4096",
  // A server with no configured name reports its id, which is the URL.
  name: "http://204.152.198.222:4096",
  url: "http://204.152.198.222:4096",
  builtin: false,
  local: false,
  connected: true,
  compatible: true,
  client: {},
}
const namedRef = { ...remoteRef, id: "rs", name: "研发机", url: "https://oc.example.com" }

assert.equal(serverLabel(localRef), "127.0.0.1:4096（本机）")
assert.equal(serverLabel(remoteRef), "204.152.198.222:4096")
assert.equal(serverLabel(namedRef), "研发机")

const options = [remoteRef, localRef].map(toServerOption)
assert.equal(options[0].id, "http://204.152.198.222:4096")
assert.equal(options[0].client, remoteRef.client)
// The panel must always open on the app's own server, whatever the order.
assert.equal(pickDefaultServer(options)?.id, "sidecar")
assert.equal(pickDefaultServer([toServerOption(remoteRef)])?.id, remoteRef.id)
assert.equal(pickDefaultServer([]), undefined)

assert.equal(isServerReady(toServerOption(localRef)), true)
assert.equal(isServerReady(toServerOption({ ...remoteRef, connected: false })), false)
assert.equal(isServerReady(toServerOption({ ...remoteRef, compatible: false })), false)
assert.equal(isServerReady(undefined), false)

assert.equal(looksLikeMissingRoute("404 Not Found"), true)
assert.equal(looksLikeMissingRoute("Cannot GET /api/experimental/automation"), true)
assert.equal(looksLikeMissingRoute("No such route"), true)
assert.equal(looksLikeMissingRoute("Unauthorized"), false)

assert.ok(describeServerError(new Error("boom"), toServerOption(remoteRef)).includes("boom"))
assert.match(describeServerError(new Error("x"), toServerOption({ ...remoteRef, connected: false })), /未连接/)
assert.match(describeServerError(new Error("x"), toServerOption({ ...remoteRef, compatible: false })), /版本与桌面端不匹配/)
assert.match(
  describeServerError(new Error("404 Not Found"), toServerOption(remoteRef)),
  /experimental.*automations/s,
)
assert.equal(describeServerError(new Error("boom")), "boom")
// A server that answers its web page instead of JSON, as an old server does.
assert.match(
  describeServerError(new Error("UnsupportedContentType: text/html; charset=UTF-8"), toServerOption(remoteRef), "2.2.6"),
  /2\.2\.6.*旧的 schedule 接口/s,
)
assert.match(
  describeServerError(new Error("UnsupportedContentType: text/html"), toServerOption(remoteRef), "2.3.2"),
  /没开自动任务接口|automations.*true/s,
)
assert.match(describeServerError(new Error("UnsupportedContentType: text/plain"), toServerOption(remoteRef)), /没有自动任务接口/)
assert.match(describeServerError(new Error("404 Not Found"), toServerOption(remoteRef), "v2.1.0"), /schedule 接口/)
assert.equal(isLegacyAutomationVersion("2.2.6"), true)
assert.equal(isLegacyAutomationVersion("v2.2.6"), true)
assert.equal(isLegacyAutomationVersion("2.3.2"), false)
assert.equal(isLegacyAutomationVersion("2.10.0"), false)
assert.equal(isLegacyAutomationVersion("3.0.0"), false)
assert.equal(isLegacyAutomationVersion(undefined), false)
assert.equal(isLegacyAutomationVersion("garbage"), false)

// ---- run placement ----
assert.equal(runMode({ type: "prompt", prompt: "x", to: { subagent: "general" } }).text, "每次新建会话")
assert.match(runMode({ type: "prompt", prompt: "x", to: { subagent: "general" } }).hint, /上下文独立/)
assert.equal(runMode({ type: "prompt", prompt: "x", to: { session: "ses_1" } }).text, "同一会话")
assert.match(runMode({ type: "prompt", prompt: "x", to: { session: "ses_1" } }).hint, /累积/)
assert.equal(runMode({ type: "code", code: "return 1" }).text, "在绑定会话里执行")

console.log("all logic checks passed")
