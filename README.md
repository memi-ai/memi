# Memi Agent

本地 AI 助手，终端 + 网页双模式，支持 DeepSeek/OpenAI/Anthropic 等模型。

## 安装

```bash
git clone https://github.com/yourname/memi.git
cd memi
npm install --prefix memi-server
npm install --prefix memi-client
```

## 启动

```bash
# 启动后端
npm start --prefix memi-server

# 启动前端（可选）
npm run dev --prefix memi-client

# 启动 CLI
node memi-agent.js
# 或用 .bat
memi chat
```

## 配置

```bash
memi onboard    # 6 步新手引导
```

## 命令

| 命令 | 说明 |
|---|---|
| `memi chat` | 进入对话 |
| `memi status` | 查看配置 |
| `memi skills` | 技能列表 |
| `memi sessions` | 会话管理 |
| `memi doctor` | 系统诊断 |
| `memi agent` | Agent 信息 |
| `memi dashboard` | 打开网页版 |
| `memi onboard` | 重新配置 |
| `memi update` | 检查更新 |
| `memi version` | 版本 |
| `memi help` | 帮助 |

## 对话内命令

| 命令 | 说明 |
|---|---|
| `/help` | 帮助 |
| `/history` | 对话历史 |
| `/sessions` | 会话列表 |
| `/new` | 新建会话 |
| `/load 名称` | 加载会话 |
| `/save` | 保存会话 |
| `/tools` | 工具调用记录 |
| `/stats` | 会话统计 |
| `/balance` | API 余额 |
| `/think` | 思考强度 |
| `/currency` | 切换币种 |
| `/agent` | 智能体管理 |

## ClawHub 兼容

```bash
npm i -g clawhub
clawhub install weather    # 安装 OpenClaw 技能
memi skills                # 自动识别
```

## 网页版

`http://localhost:3001/dashboard`

## 目录结构

```
memi/
├── memi-agent.js        # CLI 入口
├── memi.bat             # Windows 快捷启动
├── memi-server/         # Express 后端
├── memi-client/         # React 前端
├── memi-config/         # 配置 & 技能 & 会话
└── README.md
```
