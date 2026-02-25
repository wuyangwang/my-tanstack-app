---
name: project-overview
description: Provides a high-level overview of the TanStack Toolbox project, including its tech stack, architecture, and core features. Use this to understand the project context.
---

# Project Overview: TanStack Toolbox

This project is a modern full-stack web application designed as a "Toolbox" (工具箱), integrating various AI and utility tools.

## Tech Stack
- **Frontend Framework:** React 19 (TypeScript)
- **Meta-Framework:** [TanStack Start](https://tanstack.com/start) (Full-stack TanStack Router)
- **Routing:** [TanStack Router](https://tanstack.com/router) (File-based routing in `src/routes/`)
- **State Management & Data Fetching:** [TanStack Query](https://tanstack.com/query) & [tRPC](https://trpc.io/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **UI Components:** Radix UI primitives (shadcn/ui style in `src/components/ui/`)
- **Database:** [Drizzle ORM](https://orm.drizzle.team/) with Neon (PostgreSQL)
- **Authentication:** [Better Auth](https://better-auth.com/)
- **I18n:** [Inlang Paraglide](https://inlang.com/m/gerreha4/library-inlang-paraglideJs)
- **Deployment:** Cloudflare Workers (via Wrangler)
- **Linting & Formatting:** [Biome](https://biomejs.dev/)

## Key Directories
- `src/routes/`: Main application routes (file-based).
- `src/components/`: Shared React components.
- `src/db/`: Database schema (`schema.ts`) and client (`index.ts`).
- `src/hooks/`: Custom React hooks, including tool-specific logic (ASR, Object Detection).
- `src/lib/`: Utility functions and worker setups.
- `messages/`: Translation files (en, de, etc.).

## Core Features
- **Speech to Text:** Real-time transcription using Whisper.
- **Object Detection:** In-browser object detection using Transformers.js and WebGPU.
- **Douyin Tool:** Specialized tools for Douyin content.
- **Internationalization:** Multi-language support.

## Development Commands
- `pnpm dev`: Start development server.
- `pnpm build`: Build for production.
- `pnpm check`: Run Biome linting and formatting checks.
- `pnpm db:push`: Push database schema changes to Neon.
