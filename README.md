# opencode-automation-manager

An experimental GUI plugin for **OpenCode Desktop 2.3.2+** that manages the built-in
automations the way ChatGPT's *Scheduled* page does: one list to review, create, edit,
pause/resume, run now, and inspect past runs.

界面为中文。

## 功能

| 能力 | 说明 |
|---|---|
| 列表 | 全局任务；状态徽章、下次运行倒计时、上次结果与输出、已运行次数；按状态筛选 + 搜索 |
| 新建 | 提示词或代码动作；触发方式：延迟 / 定时 / 间隔 / Cron；时区、结束时间、执行目录、模型与思考等级 |
| 编辑 | 官方 API 没有 update，保存 = 先建新任务再删旧任务（任务 ID 变化、运行计数清零，其余配置保留；暂停态保持暂停） |
| 暂停 / 恢复 / 删除 | 调用官方接口；删除只删任务，不删会话 |
| 立即运行 | 官方没有 run 接口，这里新建一条 `at: in 1 minute` 的一次性任务复用原动作与目标，触发后自动清理 |
| 运行记录 | 子代理任务读取 `ses_<任务ID>_<序号>` 运行会话；独立会话任务读取绑定会话里的运行轮次（提示词 + 回复）；可一键打开会话 |

## 安装

```bash
opencode plugin add opencode-automation-manager
```

或手动在 `~/.config/opencode/opencode.json` 中声明：

```jsonc
{
  "plugins": ["opencode-automation-manager"],
  "experimental": { "automations": true }
}
```

本地开发可以直接指向目录（改完 `npm run build` 由宿主热重载）：

```jsonc
{
  "plugins": ["C:/path/to/automation-manager"]
}
```

放进全局插件目录则**不需要任何配置**，宿主会自动发现并加载：

```text
~/.config/opencode/plugins/automation-manager/
```

删掉该目录即停用；`dist/gui-experimental.cjs` 变化时宿主会自动重载 GUI。

## 入口

- 标题栏「自动任务」按钮
- 快捷键 `Ctrl+Alt+A`（命令 ID `opencode-automation-manager.open`）
- 设置页 → 自动任务
- 命令面板搜索「自动任务」

## 模型与思考等级

模型不是 automation 的字段，官方接口里它属于会话：

- **独立会话**任务：模型即该任务专用会话的模型，改模型等于切换这个会话。
- **子代理**任务：子代理会继承父会话（任务会话）的模型与思考等级；若该子代理在自身配置里固定了模型，以它的配置为准，表单会给出提示。
- **代码**动作以 Code Mode 运行，不调用模型。

思考等级即 API 里的 `variant`（`minimal` / `low` / `medium` / `high` / `xhigh` 等，取决于模型）。

## 前置条件

1. OpenCode Desktop 2.3.2+（GUI 插件是桌面端专属）
2. `experimental.automations: true`
3. 任务在 OpenCode 后台服务运行时触发；应用退出则不会触发

## 开发

```bash
npm install
npm run build          # 生成 dist/gui-experimental.cjs
npm run dev            # vite build --watch，宿主监听并热重载 GUI
npm run typecheck
npm test               # 纯逻辑 + headless 渲染冒烟测试
```

服务端日志确认加载：`~/.local/share/opencode/log/opencode.log` 中
`msg="loading plugin" id=...automation-manager`。

## 已知限制

- GUI 插件 API 属 experimental，与 OpenCode Desktop 版本绑定（当前 `@opencode/*` 2.3.2）。
- 编辑即重建：任务 ID 变化、运行计数清零。官方将来提供 update 接口后可无缝替换。
- 立即运行有约 1 分钟延迟（复用原生 `at` 触发，不绕过调度语义）。
- 事件（`event`）触发的任务只支持暂停、立即运行、删除，暂不支持编辑。
- 每次新建任务会创建一个「自动任务：名称」的载体会话，这是任务的运行载体。

## License

MIT
