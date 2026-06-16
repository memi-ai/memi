
<p align="center">
  <pre style="font-size: 12px; line-height: 1.2;">
 __  __  ___  __  __  ___
|  \/  || __||  \/  ||_ _|
| |\/| || _| | |\/| | | |
|_|  |_||___||_|  |_||___|
  </pre>
</p>

<p align="center">
  <strong>你的本地 AI 助手 — 终端、网页、聊天软件，无处不在。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/memi-agent"><img src="https://img.shields.io/npm/v/memi-agent?style=for-the-badge&color=6366f1" alt="npm version"></a>
  <a href="https://github.com/memi-ai/memi/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-18+-green.svg?style=for-the-badge" alt="Node.js 18+"></a>
  <a href="#docker"><img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white&style=for-the-badge" alt="Docker"></a>
</p>

**Memi** 是一个运行在你本机的个人 AI 助手。它在终端里跟你聊天，在网页上给你看板，还打通了 Telegram / 飞书 / 企业微信 / QQ —— 所有渠道共享同一个会话和记忆。

支持 80+ AI 模型商（DeepSeek / OpenAI / Anthropic / 通义千问 / Moonshot / 智谱 …），自带 60+ 工具，兼容 ClawHub 技能生态。

---

## 快速开始

```bash
# 全局安装
npm install -g memi-agent
memi onboard

# 或者一行搞定（无需安装）
npx memi-agent onboard
```

`memi onboard` 会引导你完成模型配置、工作区初始化、渠道接入，**macOS / Linux / Windows** 都支持。

启动后：

```bash
memi chat        # 终端对话
memi dashboard   # 打开网页控制台 → http://localhost:3001/dashboard
memi status      # 查看当前状态
```

---

## 亮点

- **双界面** — 终端 CLI + 网页 Dashboard，同一个后端，无缝切换。
- **多渠道收件箱** — Telegram、飞书/Lark、企业微信、QQ，消息统一路由到 Agent 处理。
- **60+ 工具** — 文件读写、命令执行、网络搜索、图片生成、HTTP 请求、系统信息、向量记忆搜索、浏览器自动化、网页抓取、定时提醒……
- **ClawHub 兼容** — 直接安装 OpenClaw 社区的 Skill，`clawhub install` 即装即用。
- **多 Agent 协作** — `@agent` 语法切换/协作，每个 Agent 可以有独立的 system prompt 和模型。
- **12 步新手引导** — 交互式 onboard，配模型、装守护进程、接渠道，一条龙。
- **系统守护进程** — schtasks (Windows) / launchd (macOS) / systemd (Linux) 一键安装，开机自启。
- **网关安全** — `MEMI_GATEWAY_TOKEN` 鉴权，DM 白名单，避免未授权访问。
- **工作区文档** — SOUL.md / MEMORY.md / USER.md / IDENTITY.md / TOOLS.md 每日注入 system prompt，保持记忆连续性。
- **语音对话** — Dashboard 点击 🎤 说话，Agent 用 TTS 朗读回复。基于 OpenAI Whisper + TTS。
- **MCP 协议** — 接入 Model Context Protocol 生态，连接外部 MCP Server，工具无限扩展。
- **浏览器自动化** — Agent 可操控真实浏览器，打开网页、点击、截图。基于 Playwright。
- **Docker 沙箱** — Agent 命令在容器中执行，网络隔离、内存限制、进程限制，安全可靠。
- **图片管道** — 文生图 → 视觉审查 → 自动重试，直到满意。
- **会话管理** — 保存/加载/重命名会话，支持 `/stats` 统计 Token 用量和费用。
- **80+ 模型商** — 兼容 OpenAI API 格式的所有提供商，一键切换。

---

## 渠道支持

| 渠道 | 接入方式 | 配置命令 |
|---|---|---|
| Telegram | Webhook | `memi telegram <token>` |
| 飞书 / Lark | Webhook + WebSocket 长连接 | `memi feishu <token>` |
| 企业微信 | Webhook | `memi wecom <key>` |
| QQ | Webhook (go-cqhttp) | `memi qq <token>` |
| Discord | Interactions Endpoint | `memi discord <token>` |
| Slack | Events API | `memi slack <token>` |
| 钉钉 | Outgoing Webhook | `memi dingtalk <token>` |

所有渠道共享同一个 Agent 会话，在 Dashboard 里可以实时看到每条消息和工具调用。

> **安全提示**：对外暴露前务必设置 `MEMI_GATEWAY_TOKEN` 环境变量，并配置渠道白名单。

---

## 命令参考

### CLI 命令

| 命令 | 说明 |
|---|---|
| `memi chat` | 进入交互对话 |
| `memi onboard` | 12 步新手引导（模型/守护/渠道） |
| `memi dashboard` | 打开网页控制台 |
| `memi status` | 查看模型、端点、会话数、技能数 |
| `memi skills` | 列出已安装技能 |
| `memi sessions` | 列出所有会话 |
| `memi doctor` | 系统诊断（Node 版本、API 连通性、服务状态） |
| `memi agent` | 显示当前 Agent 信息 |
| `memi config` | 查看配置；`memi config edit` 重新配置 |
| `memi update` | 检查 GitHub Release 更新 |
| `memi server start` | 启动后端服务 |
| `memi voice` | 语音对话模式 |
| `memi mcp add <name> <cmd>` | 接入 MCP Server |
| `memi browser install` | 安装 Playwright + Chromium |
| `memi sandbox enable` | 启用 Docker 沙箱 |
| `memi rag index` | 索引工作区文档为向量库 |
| `memi rag search <query>` | 语义搜索工作区记忆 |
| `memi daemon install` | 安装系统守护进程（开机自启） |
| `memi version` | 显示版本号 |

### 对话内斜杠命令

| 命令 | 说明 |
|---|---|
| `/help` | 帮助信息 |
| `/history` | 查看对话历史 |
| `/sessions` | 会话列表 |
| `/new` | 新建会话 |
| `/load <name>` | 加载会话 |
| `/save` | 保存当前会话 |
| `/rename <name>` | 重命名会话 |
| `/tools` | 工具调用记录 |
| `/stats` | Token 用量与费用估算 |
| `/balance` | API 余额查询 |
| `/think off\|low\|medium\|high\|max` | 思考强度 |
| `/currency` | 切换币种 (¥/$) |
| `/clear` | 清空当前会话 |
| `/agent list\|use\|add` | 多 Agent 管理 |
| `/exit` | 退出对话 |

---

## 配置

最小配置（`memi-config/config.json`）：

```json5
{
  endpoint: "https://api.deepseek.com/v1",
  apiKey: "sk-...",
  model: "deepseek-chat",
  port: 3001
}
```

`memi onboard` 会交互式生成完整配置，包括渠道 Token、技能目录、工作区路径等。

---

## ClawHub 技能

Memi 兼容 [ClawHub](https://clawhub.ai) 技能生态：

```bash
npm install -g clawhub
clawhub install weather      # 安装天气技能
memi skills                  # 自动识别并加载
```

也可以在对话中用 `/import_skill <url>` 从 GitHub 直接导入。

---

## 工作区文档

这些文件放在 `memi-config/workspace/`，每天自动注入 Agent 的 system prompt，并支持向量搜索：

| 文件 | 作用 |
|---|---|
| `SOUL.md` | Agent 人格定义 |
| `MEMORY.md` | 长期记忆 |
| `USER.md` | 用户偏好 |
| `IDENTITY.md` | 身份设定 |
| `TOOLS.md` | 工具使用说明 |

Agent 可通过 `rag_search` 工具随时检索这些文档，无需占用每次对话的上下文窗口。

---

## 从源码运行

```bash
git clone https://github.com/memi-ai/memi.git
cd memi

npm install --prefix memi-server

# 启动后端
npm start --prefix memi-server

# 新开终端，启动 CLI
node memi-agent.js chat
```

---

## Docker

```bash
# 克隆仓库
git clone https://github.com/memi-ai/memi.git
cd memi

# 一键启动
docker compose up -d

# 或者单独构建
docker build -t memi-agent .
docker run -d -p 3001:3001 -v memi-config:/app/memi-config memi-agent
```

访问 `http://localhost:3001/dashboard`。

---

## 技术栈

| 层 | 技术 |
|---|---|
| CLI | Node.js (CommonJS) |
| 后端 | Express + WebSocket |
| 前端 | React (memi-client) + 原生 HTML Dashboard |
| AI 协议 | OpenAI-compatible `/v1/chat/completions` |
| 浏览器 | Playwright (Chromium) — 可选，按需安装 |
| 图片 | pollinations.ai + 视觉审查循环 |
| 平台 | Windows / macOS / Linux |

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=memi-ai/memi&type=date&legend=top-left)](https://www.star-history.com/#memi-ai/memi&type=date&legend=top-left)

---

## 社区

- Issues & PR: [github.com/memi-ai/memi](https://github.com/memi-ai/memi)
- AI/vibe-coded PRs welcome! 🤖
- 本项目使用deepseek-V4pro开发,框架为reaonix,如果发现了bug请及时向我反馈,邮箱:danzai268@qq.com
- 本项目全部使用中文语言如需English,请使用openclaw/Hermes/其他Agent工具,因为我们目前没有开发English版本的意向
---

MIT © 2025 Memi
