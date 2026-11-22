import { render } from "solid-js/web"
import { ManagerPage } from "../src/gui/page"

const now = Date.now()

const automations = [
  {
    id: "aut_test_cron",
    name: "易代账税务进度日报",
    projectID: "proj_1",
    sessionID: "ses_creator",
    directory: "C:\\Users\\yangc\\opencode工作区域",
    trigger: { type: "cron", cron: "0 21 * * *", tz: "Asia/Shanghai" },
    tz: "Asia/Shanghai",
    action: { type: "prompt", prompt: "执行日报脚本并发送飞书", to: { subagent: "general" } },
    status: "active",
    nextDueAt: now + 3_600_000,
    runCount: 4,
    lastRunAt: now - 86_400_000,
    lastOutcome: "fired",
    lastOutput: "Started subagent ses_aut_test_cron_4",
    time: { created: now - 864_000_000, updated: now - 86_400_000 },
  },
  {
    id: "aut_test_paused",
    name: "每周库存巡检",
    projectID: "proj_1",
    sessionID: "ses_creator2",
    directory: "C:\\Users\\yangc\\opencode工作区域",
    trigger: { type: "every", every: "2 hours" },
    tz: "Asia/Shanghai",
    action: { type: "prompt", prompt: "巡检库存并汇总", to: { session: "ses_creator2" } },
    status: "paused",
    runCount: 2,
    lastRunAt: now - 7_200_000,
    lastOutcome: "skipped",
    lastOutput: "Prompted ses_creator2",
    expires: now + 30 * 86_400_000,
    time: { created: now - 1000, updated: now - 900 },
  },
  {
    id: "aut_test_done",
    name: "一次性的提醒",
    projectID: "proj_1",
    directory: "C:\\Users\\yangc",
    trigger: { type: "at", at: new Date(now - 60_000).toISOString() },
    tz: "Asia/Shanghai",
    action: { type: "code", code: "return null" },
    status: "done",
    runCount: 1,
    lastRunAt: now - 60_000,
    lastOutcome: "fired",
    lastOutput: "",
    time: { created: now - 2000, updated: now - 1500 },
  },
]

/**
 * A raw server client, shaped like the SDK's OpenCodeClient: the page wraps it in
 * an AutomationClient, so this is the same boundary the real app crosses.
 */
function rawClient(list: () => any[], directory: string) {
  const find = (automationID: string) => list().find((item) => item.id === automationID) ?? list()[0]
  return {
    experimental: {
      automation: {
        list: async () => list(),
        get: async ({ automationID }: any) => find(automationID),
        pause: async ({ automationID }: any) => ({ ...find(automationID), status: "paused" }),
        resume: async ({ automationID }: any) => ({ ...find(automationID), status: "active" }),
        delete: async () => undefined,
        create: async (input: any) => ({ ...list()[0], ...input, id: `aut_${list().length + 1}` }),
      },
    },
    session: {
      get: async () => ({
        title: "自动任务：示例会话",
        model: { id: "m", providerID: "p", variant: "medium" },
        agent: "general",
      }),
      list: async () => ({
        data: [{ id: "ses_recent", location: { directory }, time: { created: 1, updated: 2 } }],
      }),
      create: async () => ({ id: "ses_new" }),
      remove: async () => undefined,
      switchModel: async () => undefined,
    },
    message: { list: async () => ({ data: [] }) },
    model: {
      list: async () => ({
        data: [
          {
            id: "m",
            providerID: "p",
            name: "M",
            enabled: true,
            variants: [{ id: "low" }, { id: "medium" }, { id: "high" }],
          },
        ],
      }),
    },
    provider: { list: async () => ({ data: [{ id: "p", name: "P" }] }) },
    agent: { list: async () => ({ data: [{ id: "general", name: "General", mode: "subagent" }] }) },
  }
}

// A second server, as the app would list one added in Settings → Servers.
const remoteAutomations = [
  {
    id: "aut_remote_1",
    name: "远程任务：日志清理",
    projectID: "proj_9",
    directory: "/srv/app",
    trigger: { type: "cron", cron: "0 3 * * *", tz: "UTC" },
    tz: "UTC",
    action: { type: "prompt", prompt: "清理 7 天前的日志", to: { subagent: "general" } },
    status: "active",
    nextDueAt: now + 7_200_000,
    runCount: 1,
    time: { created: now - 3600_000, updated: now - 3600_000 },
  },
]

const localServer = {
  id: "sidecar",
  name: "sidecar",
  url: "http://127.0.0.1:4096",
  builtin: true,
  local: true,
  connected: true,
  compatible: true,
  client: rawClient(() => automations, "C:\\Users\\yangc"),
}
const remoteServer = {
  id: "http://204.152.198.222:4096",
  name: "http://204.152.198.222:4096",
  url: "http://204.152.198.222:4096",
  builtin: false,
  local: false,
  connected: true,
  compatible: true,
  client: rawClient(() => remoteAutomations, "/srv/app"),
}
const servers = () => [localServer, remoteServer]

export async function run() {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(
    () => <ManagerPage servers={servers} openSession={() => undefined} />,
    container,
  )
  // Let the first async load settle.
  await new Promise((resolve) => setTimeout(resolve, 120))
  const text = container.textContent ?? ""
  for (const needle of ["自动任务", "易代账税务进度日报", "每周库存巡检", "已暂停", "立即运行", "编辑"]) {
    if (!text.includes(needle)) throw new Error(`missing text: ${needle}`)
  }
  if (container.querySelectorAll(".am-card").length !== 3) {
    throw new Error(`expected 3 cards, got ${container.querySelectorAll(".am-card").length}`)
  }
  // Each card states how its runs are placed, so the choice is visible without
  // opening the edit form.
  if (!text.includes("每次新建会话")) throw new Error("subagent card does not show its run placement")
  if (!text.includes("同一会话")) throw new Error("session card does not show its run placement")

  // Server picker: two servers, defaulting to the app's own one.
  const serverSelect = [...container.querySelectorAll(".am-serverbar select")][0] as HTMLSelectElement | undefined
  if (!serverSelect) throw new Error("server picker did not render for multiple servers")
  if (serverSelect.options.length !== 2) throw new Error(`expected 2 servers, got ${serverSelect.options.length}`)
  if (serverSelect.value !== "sidecar") throw new Error(`default server is not the local one: ${serverSelect.value}`)
  if (!text.includes("（本机）")) throw new Error("local server is not tagged as local")

  // Expand the first card: the detail panel must render.
  const first = container.querySelector(".am-card") as HTMLElement
  first.click()
  await new Promise((resolve) => setTimeout(resolve, 120))
  if (!container.querySelector(".am-detail")) throw new Error("detail panel did not render")
  if (!(container.textContent ?? "").includes("运行记录")) throw new Error("history block missing")

  // Create form must render and prefill nothing.
  const create = [...container.querySelectorAll("button")].find((b) => b.textContent === "新建任务") as HTMLElement
  create.click()
  await new Promise((resolve) => setTimeout(resolve, 120))
  if (!container.querySelector(".am-form")) throw new Error("create form did not render")
  const formText = container.textContent ?? ""
  for (const needle of ["任务名称", "触发方式", "执行目标", "结束条件", "创建任务", "每次新建会话", "固定会话"]) {
    if (!formText.includes(needle)) throw new Error(`form missing: ${needle}`)
  }

  // Edit mode: the form must open pre-filled with the stored task (card 2 is the
  // session-target task, so it also proves the model picker is pre-filled).
  const back = [...container.querySelectorAll("button")].find((b) => b.textContent === "返回列表") as HTMLElement
  back.click()
  await new Promise((resolve) => setTimeout(resolve, 80))
  const cards = [...container.querySelectorAll(".am-card")] as HTMLElement[]
  cards[1].click()
  await new Promise((resolve) => setTimeout(resolve, 120))
  const editButton = [...cards[1].querySelectorAll("button")].find((b) => b.textContent === "编辑") as HTMLElement
  editButton.click()
  await new Promise((resolve) => setTimeout(resolve, 200))
  if (!container.querySelector(".am-form")) throw new Error("edit form did not render")
  const inputs = [...container.querySelectorAll(".am-form input")] as HTMLInputElement[]
  if (!inputs.find((input) => input.value === "每周库存巡检")) {
    throw new Error(`edit form did not prefill the name: ${inputs.map((i) => i.value).join(" | ")}`)
  }
  if (!inputs.find((input) => input.value === "120")) throw new Error("edit form did not prefill the interval")
  const modelSelect = [...container.querySelectorAll(".am-form select")].find(
    (node) => (node as HTMLSelectElement).value === "p/m",
  )
  if (!modelSelect) {
    const values = [...container.querySelectorAll(".am-form select")].map((n) => (n as HTMLSelectElement).value)
    throw new Error(`edit form did not prefill the session model: ${values.join(" | ")}`)
  }
  const editText = container.textContent ?? ""
  for (const needle of ["保存修改", "保存会新建一条任务再删除旧任务", "改动后会切换原绑定会话的模型"]) {
    if (!editText.includes(needle)) throw new Error(`edit form missing: ${needle}`)
  }

  // A subagent target keeps the model + reasoning controls.
  const backToList = [...container.querySelectorAll("button")].find((b) => b.textContent === "返回列表") as HTMLElement
  if (!backToList) throw new Error("back button missing after edit")
  backToList.click()
  await new Promise((resolve) => setTimeout(resolve, 120))
  const firstCard = container.querySelector(".am-card") as HTMLElement
  if (!firstCard) throw new Error("cards missing after leaving edit")
  firstCard.click()
  await new Promise((resolve) => setTimeout(resolve, 120))
  const firstEdit = [...firstCard.querySelectorAll("button")].find((b) => b.textContent === "编辑") as HTMLElement
  if (!firstEdit) throw new Error("edit button missing on the subagent task")
  firstEdit.click()
  await new Promise((resolve) => setTimeout(resolve, 250))
  const subagentText = container.textContent ?? ""
  if (!subagentText.includes("每次新建的会话会继承这个任务的模型与思考等级")) {
    throw new Error("subagent model note missing")
  }
  if (![...container.querySelectorAll(".am-form select")].some((n) => (n as HTMLSelectElement).value === "p/m")) {
    throw new Error("model picker hidden for a subagent target")
  }
  if (![...container.querySelectorAll(".am-form select")].some((n) => (n as HTMLSelectElement).value === "medium")) {
    throw new Error("reasoning level not prefilled for the subagent task")
  }

  // Switch servers: the remote list replaces the local one, and the banner names
  // the host the tasks will run on.
  const backFromEdit = [...container.querySelectorAll("button")].find((b) => b.textContent === "返回列表") as
    | HTMLElement
    | undefined
  if (backFromEdit) {
    backFromEdit.click()
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  const picker = [...container.querySelectorAll(".am-serverbar select")][0] as HTMLSelectElement
  if (!picker) throw new Error("server picker disappeared after leaving the form")
  picker.value = remoteServer.id
  picker.dispatchEvent(new Event("change", { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 300))
  const remoteText = container.textContent ?? ""
  if (!remoteText.includes("远程任务：日志清理")) throw new Error("remote tasks did not load after switching server")
  if (remoteText.includes("易代账税务进度日报")) throw new Error("local tasks stayed visible after switching server")
  if (!remoteText.includes("任务在那台机器上执行")) throw new Error("remote execution notice missing")
  if (container.querySelectorAll(".am-card").length !== 1) {
    throw new Error(`expected 1 remote card, got ${container.querySelectorAll(".am-card").length}`)
  }

  console.log("render ok; html bytes:", container.innerHTML.length)
  dispose()
}
