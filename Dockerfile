FROM node:22-alpine

LABEL org.opencontainers.image.title="Memi Agent"
LABEL org.opencontainers.image.description="本地 AI 助手 — 终端 + 网页 + 多渠道"
LABEL org.opencontainers.image.source="https://github.com/memi-ai/memi"

WORKDIR /app

# 复制依赖清单
COPY memi-server/package.json memi-server/package-lock.json ./memi-server/

# 安装后端依赖
RUN cd memi-server && npm install --omit=dev

# 复制程序文件
COPY memi-agent.js ./
COPY memi-server/ ./memi-server/
COPY memi-dashboard.html ./
COPY memi-config/ ./memi-config/
COPY package.json ./

# 创建 workspace 软链 (让用户可挂载自己的配置)
RUN mkdir -p /app/memi-config/workspace /app/memi-config/sessions /app/memi-config/skills

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s CMD node -e "require('http').get('http://localhost:3001/health',r=>{process.exit(r.statusCode===200?0:1)})"

CMD ["node", "memi-server/index.js"]
