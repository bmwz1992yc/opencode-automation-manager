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

const client: any = {
  list: async () => automations,
  sessionTitle: async () => "自动任务：示例会话",
  sessionMeta: async () => ({ title: "自动任务：示例会话", model: { id: "m", providerID: "p", variant: "medium" } }),
  pause: async () => automations[0],
  resume: async () => automations[1],
  remove: async () => undefined,
  get: async () => automations[0],
  runNow: async () => automations[2],
  history: async () => [],
  runOutput: async () => "",
  sessionTurns: async () => [],
  subagents: async () => [{ id: "general", name: "General" }],
  modelCatalog: async () => [
    { key: "p/m", id: "m", providerID: "p", providerName: "P", name: "M", variants: ["low", "medium", "high"] },
  ],
  recentDirectories: async () => ["C:\\Users\\yangc"],
}

export async function run() {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const dispose = render(() => <ManagerPage client={client} onOpenSession={() => undefined} />, container)
  // Let the first async load settle.
  await new Promise((resolve) => setTimeout(resolve, 120))
  const text = container.textContent ?? ""
  for (const needle of ["自动任务", "易代账税务进度日报", "每周库存巡检", "已暂停", "立即运行", "编辑"]) {
    if (!text.includes(needle)) throw new Error(`missing text: ${needle}`)
  }
  if (container.querySelectorAll(".am-card").length !== 3) {
    throw new Error(`expected 3 cards, got ${container.querySelectorAll(".am-card").length}`)
  }

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
  for (const needle of ["任务名称", "触发方式", "执行目标", "结束条件", "创建任务"]) {
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
  if (!subagentText.includes("子代理会继承这个任务的会话模型与思考等级")) {
    throw new Error("subagent model note missing")
  }
  if (![...container.querySelectorAll(".am-form select")].some((n) => (n as HTMLSelectElement).value === "p/m")) {
    throw new Error("model picker hidden for a subagent target")
  }
  if (![...container.querySelectorAll(".am-form select")].some((n) => (n as HTMLSelectElement).value === "medium")) {
    throw new Error("reasoning level not prefilled for the subagent task")
  }

  console.log("render ok; html bytes:", container.innerHTML.length)
  dispose()
}
