## v1.3.1 (2025-07-03)

### 🏗 架构重构
- **模块化 CLI** — 1966 行 `memi-agent.js` 拆分为 35 文件 `cli/` 架构，每个命令独立文件 + 自动注册
- **Provider 插件系统** — `memi-server/providers/` 插件化，新增 provider 无需改核心代码
  - OpenAI, Gemini (含 native imageGen), Anthropic, Groq, Cohere
  - 自动探测 + 兜底 fallback
- **双轨备份/恢复** — `memi backup` / `memi restore`
  - Git tag（开发者版本化） + Snapshot 文件复制（无 git 用户）

### ✨ 新功能
- **memi backup / memi restore** — 一键备份与恢复配置/会话/技能
- **UI 组件库** (`cli/ui.js`) — Spinner 加载动画、Table 表格（`┌┬┐`）、Box 边框、Diff 差异对比、Section 章节标题
- **帮助系统升级** — 按类别分组展示，支持 `memi help <命令>` 查看详细用法

### 📱 移动端 (memi-mobile)
- React Native (Expo) 应用：ChatScreen 流式对话/语音/Voice/TTS
- 自动服务发现 + ngrok 默认隧道
- Dashboard 响应式：汉堡菜单/全屏聊天/隐藏 Monitor
- EAS Build 配置 + 商店元数据

### 🌐 跨国安装修复
- `install.sh` / `install.ps1` — 自动检测 npmjs.org 可达性
- 不可达时自动切换 `registry.npmmirror.com` 镜像
- Node.js 安装走 CDN 备选链路（官方 / npmmirror / GitHub fastgit）
- `scripts/install-deps.js` — postinstall 镜像感知脚本
- 支持 `MEMI_NPM_MIRROR=direct` 环境变量强制直连

### 🔧 修复
- server 在 expose 模式下正确绑定 `0.0.0.0`
- LAN IP 自动显示
- ngrok-skip-browser-warning header

### 📦 杂项
- `package.json files` 更新包含 `cli/`, `scripts/`, `providers/`
- 共 51 个文件变更，+2867 / -2018 行
