# TODO

- Mediabunny 文档入口: https://mediabunny.dev/llms.txt
- Mediabunny LLM 说明页: https://mediabunny.dev/llms
- Demo 文件: public/shelf-christmas-decoration.heic
- 现有实现: src/routes/live-photo-tool.tsx
- 现有实现: src/lib/live-photo-parser.ts
- 现有实现: src/lib/live-photo-parser2.ts

## HEIC 解析器计划（Mediabunny 路线）

- [ ] 新建 `src/lib/heic-parser.ts`，实现 ISO box 扫描（`ftyp/meta/moov/trak`）与容器分类。
- [ ] 在 `heic-parser.ts` 实现两条解析分支：
- [ ] `Track` 分支：若存在 `moov/trak`，提取可播放视频轨字节并校验。
- [ ] `Item` 分支：解析 `meta` 相关 box，提取主图 item 负载。
- [ ] 主图统一输出 `Blob` 并接入 `heic2any` 转 JPEG（浏览器兼容预览）。
- [ ] 若为图片序列（无独立视频轨），补一个帧序列到 MP4 的接口（用 Mediabunny `Output + Mp4OutputFormat + CanvasSource`）。
- [ ] 在 `src/lib/live-photo-parser2.ts` 里接入 `heic-parser.ts`，保留旧逻辑作为回退。
- [ ] 在 `src/routes/live-photo-tool.tsx` 增加状态提示：
- [ ] `有独立视频` / `动画HEIC无独立视频` / `普通静态HEIC`。
- [ ] 补测试：至少覆盖容器分类与无 `moov/trak` 的分支行为。
- [ ] 运行 `npm run format`、`pnpm test`、`pnpm check` 验证。
