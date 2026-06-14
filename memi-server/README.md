# memi-server

Memi 的 Express 后端服务。

## 功能

- 服务端口默认 `3001`
- 开启 CORS，仅允许 `http://localhost:5173`
- 支持 JSON 请求体解析
- 提供 `/health` 健康检查接口
- 提供图片和视频流水线占位接口

## 安装

```bash
npm install
```

## 启动

```bash
npm start
```

## 接口

### GET /health

返回：

```json
{
  "status": "ok",
  "name": "memi"
}
```

### POST /api/pipeline/image

返回：

```json
{
  "status": "image pipeline placeholder"
}
```

### POST /api/pipeline/video

返回：

```json
{
  "status": "video pipeline placeholder"
}
```
