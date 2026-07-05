## v1.3.2

### ✨ 新增
- **Provider CLI**: `memi provider list|detect|test|switch|add` — 管理 LLM Provider
- **Shell 自动补全**: `memi completion bash|zsh|powershell` — 一键生成补全脚本
- **4 个新 Provider**: Perplexity, NVIDIA NIM, Cloudflare Workers AI, LocalAI
- **18 个测试用例**: Provider 自动探测 / CLI 框架 / 备份系统 全覆盖
- **智能 Provider 探测**: OpenAI 仅在无其他 Provider 匹配时作为兜底

### 🔧 改进
- openai.detect 白名单+黑名单策略，避免抢占新 Provider
- .gitignore 增加 backup/cache/logs 目录
- Provider 均导出 defaultBaseUrl / defaultModel，支持 `memi provider switch`
- registry.loadBuiltinProviders() 自动加载全部 9 个 Provider

### 📦 安装
```
npm install -g memi-agent
```
