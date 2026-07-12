# AGENTS.md

## 仓库速览

- 这是 OpenCode 的第三方 UI：前端为 React 19 + Vite 8 + Tailwind CSS v4，桌面/移动端壳在 `src-tauri/`（Tauri 2 + Rust）。
- 根目录只有一个 npm 包，锁文件是 `package-lock.json`；优先用 `npm ci` 安装，避免混用 pnpm/yarn/bun。
- 前端入口是 `src/main.tsx`，业务入口在 `src/App.tsx`；API 聚合出口是 `src/api/client.ts`。
- `src-tauri/` 是单独的 Rust/Tauri 工程，`src-tauri/Cargo.toml` 要求 Rust `1.85.0`。

## 常用命令

- 本地 Web 开发：先运行 `opencode serve`，再运行 `npm run dev`；Vite 默认在 `http://localhost:5173`，开发代理把 `/api` 转到 `http://127.0.0.1:4096`。
- 完整校验：`npm run validate`，顺序是 `typecheck -> lint -> test:run -> build`。
- 提交前更严格检查：`npm run check`，比 `validate` 多跑 `format:check`。
- 单测：`npm run test:run`；聚焦单文件可用 `npx vitest run src/path/file.test.ts`。
- 类型检查：`npm run typecheck` 或别名 `npm run type-check`。
- 桌面构建：`npm run tauri build`；Tauri 配置会先执行 `npm run build`。
- 图标生成：`npm run icons:tauri`，输入是 `src-tauri/app-icon.manifest.json`，输出到 `src-tauri/icons`。

## 验证与测试细节

- Vitest 使用 `jsdom`、全局测试 API 和 `src/test/setup.ts`；setup 中补了 `localStorage`、`ResizeObserver`、`matchMedia` 等浏览器能力。
- ESLint 只检查 `**/*.{ts,tsx}`，并忽略 `dist`、`node_modules`、`public/material-icons`、`src-tauri/target/**`。
- `npm install` 后的 `postinstall` 会运行 `scripts/copy-material-icons.mjs`，从 `material-icon-theme` 只复制被 `src/utils/materialIcons.ts` 引用的 SVG 到 `public/material-icons/`。
- Docker 前端镜像构建用 `npm ci --ignore-scripts`，随后显式运行 `node scripts/copy-material-icons.mjs`；修改图标映射时不要只依赖 postinstall。

## 通信路径

- 常规 OpenCode API 经 `@opencode-ai/sdk` 封装，SDK client 在 `src/api/sdk.ts` 中按 active server URL + Basic Auth 缓存。
- `src/api/http.ts` 只保留给 SSE 和 PTY WebSocket 的 URL/auth 辅助，不要把普通 REST 调用重新散落到这里。
- 浏览器环境走原生 `fetch`；Tauri 环境通过 `@tauri-apps/plugin-http` 预加载 fetch，以绕开桌面端跨域限制。
- SSE 在 `src/api/events.ts` 里是单例连接；切换服务器时 `src/main.tsx` 会取消进行中的 API 请求、清空会话/消息/todo 内存状态并重连 SSE。
- Tauri 侧 `bridge_connect` 会按 URL scheme 自动选择传输：`http(s)` 用 HTTP stream 供 SSE 使用，`ws(s)` 用 WebSocket 供 PTY 使用。

## Tauri 注意事项

- 桌面端会自动检测并可启动 `opencode serve`，核心命令在 `src-tauri/src/app/commands/opencode.rs`；Android 不注册这些 service management 命令。
- 桌面端窗口、单实例、多窗口目录参数、窗口状态保存等逻辑集中在 `src-tauri/src/app/mod.rs`；Android 路径只注册 bridge commands。
- Tauri 能力在 `src-tauri/capabilities/default.json`；当前允许 `http://**`、`https://**`、通知、对话框、文件读写和 opener。
- `src/utils/tauri.ts` 用 `window.__TAURI_INTERNALS__` 判断 Tauri，用 user agent 区分移动端；改平台判断前先同步相关测试。

## Docker 与部署

- `docker-compose.yml` 默认使用 GHCR 预构建镜像，网关入口绑定 `127.0.0.1:${GATEWAY_PORT:-6658}`，预览入口绑定 `127.0.0.1:${PREVIEW_PORT:-6659}`。
- 网关 `:6658` 的 `/api/*` 反代到 backend `:4096`，`/routes` 与 `/preview/*` 到内置 router `:7070`，其他请求到 frontend `:3000`。
- `docker-compose.standalone.yml` 是纯前端模式，默认把 `/api` 反代到 `host.docker.internal:4096`，远程后端用 `BACKEND_URL=host:port`，不要带协议前缀。
- `docker-compose.host.yml` 会给 backend 开 `privileged`、挂载 `/var/run/docker.sock` 和 `/:/host`；只在确实需要宿主机 Docker/文件系统能力时叠加。
- `docker-compose.build.yml` 才从本地 Dockerfile 构建 gateway/frontend/backend；默认 compose 不会读取本地源码构建镜像。

## 发版

- 发版准备用 `npm run release:prepare -- <version>`；脚本要求工作区干净，默认先跑 `npm run validate`。
- 版本脚本会同步更新 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.lock`（若存在）并追加 `CHANGELOG.md`。
- `release:prepare` 只打印后续 `git commit`、`git tag`、`git push` 步骤，不会自动提交或打 tag。
