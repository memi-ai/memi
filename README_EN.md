
<p align="center">
  <pre style="font-size: 12px; line-height: 1.2;">
 __  __  ___  __  __  ___
|  \/  || __||  \/  ||_ _|
| |\/| || _| | |\/| | | |
|_|  |_||___||_|  |_||___|
  </pre>
</p>

<p align="center">
  <strong>Your personal AI assistant — terminal, web, chat apps, everywhere.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/memi-agent"><img src="https://img.shields.io/npm/v/memi-agent?style=for-the-badge&color=6366f1" alt="npm version"></a>
  <a href="https://github.com/memi-ai/memi/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-18+-green.svg?style=for-the-badge" alt="Node.js 18+"></a>
  <a href="#docker"><img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white&style=for-the-badge" alt="Docker"></a>
</p>

**Memi** is a personal AI assistant that runs on your own machine. Chat in the terminal, manage on the web Dashboard, and connect through Telegram / Feishu / WeCom / QQ / Discord / Slack / DingTalk — all channels share the same session and memory.

Supports 80+ AI providers (DeepSeek / OpenAI / Anthropic / Qwen / Moonshot / GLM ...), 70+ built-in tools, and ClawHub skill ecosystem compatibility.

---

## Quick Start

```bash
# Global install
npm install -g memi-agent
memi onboard

# Or one-liner via npx
npx memi-agent onboard

# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/memi-ai/memi/main/install.sh | bash

# Windows PowerShell
irm https://raw.githubusercontent.com/memi-ai/memi/main/install.ps1 | iex
```

After onboarding:

```bash
memi chat        # Terminal chat
memi dashboard   # Web Dashboard → http://localhost:3001/dashboard
memi status      # View status
```

---

## Highlights

- **Dual Interface** — CLI + Web Dashboard, same backend, seamless switching.
- **7 Channels** — Telegram, Feishu/Lark, WeCom, QQ, Discord, Slack, DingTalk.
- **70+ Tools** — File I/O, shell commands, web search, image generation, HTTP, system info, browser automation, vector memory, web scraping, cron, webhooks...
- **ClawHub Compatible** — Install OpenClaw community skills directly.
- **Multi-Agent** — `@agent` syntax for switching/collaboration.
- **12-Step Onboarding** — Interactive setup for models, daemon, channels.
- **System Daemon** — schtasks (Windows) / launchd (macOS) / systemd (Linux).
- **Gateway Security** — `MEMI_GATEWAY_TOKEN` auth + DM whitelist.
- **Voice** — Click 🎤 to speak, Agent reads replies aloud (Web Speech API + Whisper + TTS).
- **Safety Approval** — Confirm dangerous operations before execution.
- **MCP Protocol** — Connect to Model Context Protocol ecosystem. Memi can be both MCP client and server.
- **Plugin System** — Custom tools and middleware via `memi-config/plugins/`.
- **Long-term Memory** — Auto-summarization, cross-session retrieval, knowledge base upload.
- **Cron Scheduler** — `memi cron add` for automated Agent tasks.
- **Browser Automation** — Real browser control via Playwright.
- **Docker Sandbox** — Isolated command execution with network/memory limits.
- **i18n** — Chinese + English (Dashboard + CLI).
- **PWA** — Install Dashboard to desktop/mobile home screen.
- **Image Pipeline** — Text → Image → Vision Review → Auto-retry.
- **80+ Providers** — OpenAI-compatible API, switch models freely.
- **Persona Market** — `memi persona use coder` to switch Agent personality.

---

## Channels

| Channel | Method | Command |
|---|---|---|
| Telegram | Webhook | `memi telegram <token>` |
| Feishu / Lark | Webhook + WebSocket | `memi feishu <token>` |
| WeCom | Webhook | `memi wecom <key>` |
| QQ | Webhook (go-cqhttp) | `memi qq <token>` |
| Discord | Interactions Endpoint | `memi discord <token>` |
| Slack | Events API | `memi slack <token>` |
| DingTalk | Outgoing Webhook | `memi dingtalk <token>` |

> **Security**: Set `MEMI_GATEWAY_TOKEN` before exposing publicly.

---

## Docker

```bash
git clone https://github.com/memi-ai/memi.git
cd memi
docker compose up -d
# → http://localhost:3001/dashboard
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| CLI | Node.js (CommonJS) |
| Backend | Express + WebSocket |
| Frontend | React + Vanilla HTML Dashboard |
| AI Protocol | OpenAI-compatible `/v1/chat/completions` |
| Sandbox | Docker container isolation |
| Cron | Built-in scheduler |
| i18n | zh-CN / en-US |
| PWA | Service Worker + manifest.json |
| Browser | Playwright (Chromium) — optional |
| Image | pollinations.ai + vision review loop |
| Platform | Windows / macOS / Linux |

---

## Community

- Issues & PR: [github.com/memi-ai/memi](https://github.com/memi-ai/memi)
- AI/vibe-coded PRs welcome! 🤖
- Built with DeepSeek V4 Pro + Reasonix framework
- Contact: danzai268@qq.com

---

MIT © 2025 Memi
