# Repository Guidelines

## Project Structure & Module Organization
Core app code lives in `src/`. Use `src/routes/` for TanStack file-based routes, `src/components/` for reusable UI and page components, `src/hooks/` for React hooks, and `src/lib/` for shared utilities (for example audio parsing and WebGPU helpers). Database access is in `src/db/`, with SQL history in `drizzle/`. Static assets belong in `public/`, and i18n message catalogs are in `messages/`. Use the path alias `@/*` for imports from `src/*`.

## Build, Test, and Development Commands
- `pnpm dev`: Start the Vite dev server.
- `pnpm build`: Create a production build.
- `pnpm preview`: Preview the production build locally.
- `pnpm test`: Run Vitest test suites once.
- `pnpm check`: Run Biome checks (lint + format diagnostics).
- `pnpm lint`: Run Biome linter rules.
- `pnpm format`: Apply Biome formatting.
- `pnpm deploy`: Build and deploy with Wrangler.
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:push`: Manage Drizzle schema migrations.

## Coding Style & Naming Conventions
Biome is the source of truth for style: tabs for indentation and double quotes for JavaScript/TypeScript strings. Prefer TypeScript (`.ts`/`.tsx`) for new code. Use `PascalCase` for React component files (for example `LocaleSwitcher.tsx`), and `use-*.ts` or `use-*.tsx` naming for hooks. Keep route modules aligned with TanStack route naming and store cross-route helpers in `src/lib/`.

## Testing Guidelines
Use Vitest for unit/integration tests, with Testing Library for React behavior tests where needed. Name tests `*.test.ts` or `*.test.tsx`, colocated with source files or inside `__tests__` folders under `src/`. Add tests for new logic in utilities, hooks, and non-trivial route behavior. Before opening a PR, run `pnpm test` and `pnpm check`.

## Commit & Pull Request Guidelines
Follow Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, and `chore:` (optionally with scope, e.g. `feat(routes): add live photo parser`). Keep commits focused and reversible. PRs should include a concise summary, linked issue/context, test evidence, screenshots or GIFs for UI changes, and notes for environment variable, migration, or deploy impacts.

## Security & Configuration Tips
Never commit secrets. Keep sensitive values in `.env.local`, and maintain `.env.example` with safe placeholders. Validate Wrangler and database configuration before running deploy or migration commands.

## Agent Preferences
- If code is modified, do not run tests or formatting unless the user explicitly asks for it.
- Before running `git commit`, provide a brief summary of the proposed commit message.
