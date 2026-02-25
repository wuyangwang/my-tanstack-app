# TanStack Toolbox (工具箱)

一个基于最新前端技术栈构建的现代化全栈工具应用，集成了 AI 语音转文字、物体检测及多种实用工具。

## 核心功能
- **语音转文字 (ASR)**：基于 Whisper 模型的实时语音转写。
- **物体检测**：利用 Transformers.js 和 WebGPU 在浏览器内实现高效识别。
- **抖音工具**：针对抖音内容的专用处理工具。
- **多语言支持**：集成 Paraglide 实现中英文等多语言切换。

## 技术栈
- **框架**：[TanStack Start](https://tanstack.com/start) (React 19)
- **路由**：TanStack Router (全栈文件路由)
- **样式**：Tailwind CSS v4
- **后端/数据库**：tRPC + Drizzle ORM + Neon (PostgreSQL)
- **认证**：Better Auth

## 快速开始
```bash
pnpm install
pnpm dev
```

## 构建与部署
```bash
pnpm build
pnpm deploy # 部署至 Cloudflare Workers
```
