# memi-client

Memi 的 React + Vite 前端项目，用于调用后端图片生成流水线。

## 页面

- Studio：图片创作工作台，包含新手引导、提示词输入、生成进度和结果详情。
- Gallery：本地生成历史，展示最近作品、分数和最终提示词。
- Settings：三段式 API 配置，保存到浏览器 `localStorage`。

## 安装

```bash
npm install
```

## 启动

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:5173
```

## API 代理

Vite 已将 `/api` 代理到：

```text
http://localhost:3001
```

前端会调用：

```text
POST /api/pipeline/image
```

配置面板中的 API1、API2、API3 会保存到浏览器 `localStorage`。
