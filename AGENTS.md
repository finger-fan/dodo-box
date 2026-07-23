# AGENTS.md

本文件为 Codex (Codex.ai/code) 提供本仓库的代码导航和操作指引，**所有规则必须严格遵守**。

---

## 代码质量规则
- 每次修改代码后必须运行 lint 和类型检查
- 提交代码前必须修复所有 TypeScript 错误
- 未经明确批准，不得对现有功能进行破坏性变更

## 工作偏好
- 当要求分析代码时，必须先阅读代码本身 - 不要截图或探索 UI
- 按照功能重要性优先排序实现，而不是按难度
- 如果提供了计划/PRD，请直接按照实现 - 不要反复修改计划
- 未经明确批准，永远不要升级 major 版本依赖（例如 Svelte 4→5）

## 测试协议
- 修改相关模块后必须运行自动化测试
- E2E 测试时：除非明确确认要删除，否则永远不要误点删除按钮，始终先关闭确认对话框
- 单账户和多账户场景的测试流程需要在单独文件中记录

## Git 工作流
- 提交代码前必须确认当前所在分支
- 使用规范化的提交信息（conventional commit）
- 提交成功后默认推送到远程，除非另有说明

---

## 项目概述

**dodo-box** - 基于 Nostr 协议的隐私优先多账户消息应用原型。作为 Google AI Studio applet 构建，使用 Next.js。当前使用模拟数据（尚未连接真实 Nostr 中继）。

## 命令

```bash
pnpm dev           # 启动开发服务器 (Next.js)
pnpm build         # 生产构建
pnpm lint          # ESLint 检查
pnpm clean         # 清除 Next.js 缓存
pnpm check         # 类型检查 + lint
pnpm test          # Vitest 单元/集成测试
pnpm test:coverage # 带覆盖率的测试
pnpm test:e2e      # Playwright E2E 测试
pnpm test:all      # 运行全部测试
```

**包管理器**: 必须使用 **pnpm**（不是 npm）。Docker 构建也必须使用 pnpm。

## 操作规则

以下规则基于历史会话中反复出现的问题总结，**必须遵守**：

1. **调试时先查日志**: 调试问题时，必须先检查容器/服务日志（`docker compose logs`），再提出修复方案。禁止用中间件屏蔽错误——找到并修复根因。
2. **不要擅自触发构建**: 除非明确要求，不要触发 `pnpm build` 或 `docker compose build`。重命名/重构操作后，先确认再构建。
3. **探索参考目录**: 当 `./ref` 或参考目录存在时，实现前必须先探索其内容。检查 memory/AGENTS.md 中的 TODO 和计划。
4. **Docker 构建禁止 `--mount=type=cache`**: 会破坏层缓存，导致每次全量重建。
5. **release 必须合并回 dev**: 合并到 release 分支后，必须合并回 dev，绝不跳过。
6. **使用 systemctl 管理服务**: 永远使用 `systemctl` 管理服务，禁止直接 kill 进程。

## 架构

- **Next.js 15** App Router + React 19 + TypeScript 5.9 + Tailwind CSS v4
- **Standalone output** 模式（`next.config.ts`），用于容器部署
- **路径别名**: `@/*` 映射到项目根目录

### 路由

使用 Next.js App Router，通过路由组管理认证页面：

- `/` - 重定向到 `/login`
- `/login` - 账户创建/登录（在 localStorage 中存储 `dodobox_account_active`）
- `/(main)/messages` - 聊天列表
- `/(main)/chat?peer=<pubkey>` - 单个聊天会话(查询参数形式,静态导出下避免动态路由导致整页重载)
- `/(main)/contacts` - 联系人管理
- `/(main)/discover` - 发现页（频道订阅与帖子流）
- `/(main)/settings` - 应用设置（身份管理、主题、语言、中继配置）

`(main)` 路由组布局（`app/(main)/layout.tsx`）通过 localStorage 检查守护所有认证路由，并渲染 `BottomNav`（在聊天详情页隐藏）。

### 核心模块

- **`components/Providers.tsx`** - 封装 `next-themes` ThemeProvider 并初始化 i18n
- **`lib/i18n.ts`** - i18next 配置，支持浏览器语言检测；翻译文件位于 `public/locales/{en,zh}.json`
- **`lib/utils.ts`** - `cn()` 工具函数（clsx + tailwind-merge）及 `dodobox://` 协议编解码
- **`lib/mock-data.ts`** - TypeScript 接口（`Message`、`Chat`）和种子数据
- **`hooks/use-mobile.ts`** - 响应式断点 Hook
- **`components/ui/`** - 公共 UI 组件：`BottomNav`、`ConfirmDialog`、`SwipeableListItem`、`Toast`

### 自定义协议

- `dodobox://contact/<encoded-pubkey>` - 分享联系人
- `dodobox://identity/<encoded-privkey>` - 分享身份

### 数据存储

所有数据使用 localStorage 模拟持久化：

| Key | 用途 |
|-----|------|
| `dodobox_account_active` | 认证状态标志 |
| `dodobox_current_user` | 当前用户名 |
| `dodobox_mock_relay_accounts` | 已注册账户列表 |
| `dodobox_chats` | 聊天列表数据 |

### 样式

Tailwind CSS v4 + `@tailwindcss/postcss`。暗色模式通过 class 策略（`next-themes`）实现。字体：Inter（正文，`--font-sans`）、Space Grotesk（标题，`--font-display`）。动画：`tw-animate-css` + `motion`（Framer Motion）。

### 环境变量

- `GEMINI_API_KEY` - Gemini AI API 密钥（AI Studio 运行时注入）
- `APP_URL` - 托管 URL（AI Studio 运行时注入）
- `DISABLE_HMR` - 设为 `"true"` 可禁用热模块替换
- `NEXT_PUBLIC_UPDATE_URL` - OTA 更新 manifest URL
- `NEXT_PUBLIC_APP_VERSION` - 应用版本号（可选，默认从 package.json 读取）
- `NEXT_PUBLIC_DEFAULT_RELAYS` - 默认 relay 列表（逗号分隔）。本地开发放 `.env.local`（当前为 `ws://localhost:7777`）；APK 构建放 `.env.release`（由 `scripts/cap-build-export.js` 加载，系统环境变量优先级更高）

### OTA 更新

使用 `@capgo/capacitor-updater` 实现 OTA 更新：

- `lib/updater.ts` - 核心 OTA 逻辑（notifyAppReady、checkForUpdate、downloadAndApply）
- `hooks/use-updater.ts` - React Hook，自动检查更新
- `components/UpdateChecker.tsx` - 更新提示 UI
- `scripts/cap-bundle.js` - 构建 OTA bundle（生成 bundle.zip + manifest.json）
- `scripts/cap-deploy.sh` - 统一部署脚本（APK + OTA + 落地页）
- `site/` - 落地页站点（APK 下载 + 版本历史）

OTA 脚本：
- `pnpm cap:bundle [--base-url <url>] [--notes "release notes"]` - 构建 OTA bundle
- `pnpm cap:deploy <user@host:/path> [--apk <path>] [--notes "notes"]` - 部署到服务器

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **dodo-box** (9119 symbols, 22025 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/dodo-box/context` | Codebase overview, check index freshness |
| `gitnexus://repo/dodo-box/clusters` | All functional areas |
| `gitnexus://repo/dodo-box/processes` | All execution flows |
| `gitnexus://repo/dodo-box/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
