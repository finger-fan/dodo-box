# Changelog

All notable changes to dodo-box are documented here.

---

## v0.8.1 — 2026-03-19

### Bug Fixes

- **登录页面暗色模式**：为 `app/login/page.tsx` 全页面补全 `dark:` Tailwind 变体，修复登录页始终显示亮色的问题
- **部署版本出现 mock 数据**：将 mock 模式判断从 opt-out 改为 opt-in（`=== 'true'` 而非 `!== 'false'`）；在 Dockerfile builder stage 添加 `ARG/ENV NEXT_PUBLIC_NOSTR_MOCK=false` 确保构建时内联；将 `docker-compose.yml` 中该变量从 `environment:` 移至 `build.args:`
- **Settings 账号/身份逻辑混淆**：Hero 卡 Share 按钮改为仅在 `activeIdentity` 存在时显示；无 identity 时显示 "Account" 标签和引导文案，而非暴露 master key pubkey
- **Dockerfile 切换为 pnpm**：修复 Docker 构建使用 pnpm 而非 npm，修复 docker-compose relay 命令
- **登录输入框暗色模式**：修复登录表单输入框在暗色模式下不可见的问题

### Features

- **Nostr 协议集成**：实现基于 vault + NIP-17 DM 的身份管理与消息系统，包含 key-derivation、vault-crypto、vault-sync、relay-client、mock/real adapter
- **Discover 页面**：新增频道订阅与帖子流浏览功能
- **暗色模式 + 国际化**：集成 `next-themes` 暗色模式和 i18next 多语言支持（中/英）
- **核心应用结构**：完整的 Next.js 15 App Router 架构，包含 Messages、Contacts、Discover、Settings 四大模块和底部导航

### Tests

- **测试基础设施**：引入 Vitest 4.1（单元/集成）+ Playwright 1.58（E2E），共 80 个单元测试和 23 个 E2E 测试

### Tooling

- **Ship / Deploy 命令**：新增 `.claude/commands/ship.md` 和 `.claude/commands/deploy.md` 项目级 Claude skill
- **测试套件 skill**：新增 `build-test-suite` 和 `test-run-fix-report` 命令

### Changed Files

- `app/login/page.tsx` — 登录页全页面暗色模式支持
- `app/(main)/settings/page.tsx` — 修复账号/身份 hero 卡逻辑
- `lib/nostr/index.ts` — mock 模式 opt-in 逻辑
- `lib/nostr/vault-sync.ts` — mock 模式 opt-in 逻辑
- `Dockerfile` — 添加 `NEXT_PUBLIC_NOSTR_MOCK=false` 构建参数
- `docker-compose.yml` — 将 mock 配置移至 `build.args`
- `contexts/NostrContext.tsx` — Nostr session 管理，私钥仅存于内存引用
- `lib/nostr/` — 完整 Nostr 协议层（8 个模块）
