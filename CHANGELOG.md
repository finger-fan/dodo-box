# Changelog

All notable changes to dodo-box are documented here.

---

## v0.8.4 — 2026-03-20

### Improvements

- **Dockerfile 分层优化**：builder 阶段改为 `FROM deps AS builder`，消除重复的 corepack 安装和 node_modules 拷贝层，去掉 `--mount=type=cache`（会破坏 Docker layer cache 导致每次重新 install）
- **Docker 镜像版本标签**：`docker-compose.yml` 新增 `image: dodo-box:${APP_VERSION:-latest}`，容器运行时可通过 `docker inspect` 直接看到版本号
- **Deploy 流程完善**：docker build 改用 `run_in_background` 避免卡死；新增 Step 11 将 release 合并回 dev，确保版本号和 CHANGELOG 同步

### Changed Files

- `Dockerfile` — `FROM deps AS builder` 减少层数，移除 cache mount
- `docker-compose.yml` — 新增 `image: dodo-box:${APP_VERSION:-latest}`
- `.claude/commands/deploy.md` — docker build 后台执行 + release 合并回 dev

---

## v0.8.3 — 2026-03-20

### Improvements

- **彻底移除所有 mock 适配器和假数据**：删除 `MockNostrAdapter`、`mock-data.ts` 及所有 `NEXT_PUBLIC_NOSTR_MOCK` 环境变量引用，生产环境不再出现 Alice/Bob/Charlie 假数据
- **新增 EmptyNostrAdapter**：用于 SSR 和未认证状态，替代原来的 MockNostrAdapter fallback，所有方法返回空结果
- **页面刷新自动登出**：新增 auto-logout useEffect，当 session 从 localStorage 恢复但私钥已丢失时自动清除 session 并跳转登录
- **vault-sync 精简**：移除 `isMockMode()` 和 localStorage mock vault 存储逻辑，仅保留真实 relay 通信路径
- **Discover 页面**：移除硬编码 mock 频道和帖子，初始状态为空数组
- **测试更新**：集成测试用内联 test stub 替代 MockNostrAdapter，新增 auto-logout 行为测试

### Changed Files

- `lib/nostr/mock-adapter.ts` — 删除（261 行 mock 适配器）
- `lib/mock-data.ts` — 删除（废弃的旧 mock 数据）
- `lib/nostr/empty-adapter.ts` — 新增（轻量空适配器）
- `lib/nostr/index.ts` — 移除 mock 导入，改用 EmptyNostrAdapter
- `lib/nostr/vault-sync.ts` — 移除 mock 分支（-52 行）
- `contexts/NostrContext.tsx` — 新增 auto-logout useEffect
- `app/(main)/discover/page.tsx` — 移除 mock 频道和帖子常量
- `Dockerfile` / `docker-compose.yml` / `.env.example` — 移除 NOSTR_MOCK 配置
- `playwright.config.ts` / `tests/` — 移除 mock 注入，更新测试

---

## v0.8.2 — 2026-03-19

### Features

- **Identity 分享协议重设计**：新格式 `dodobox://identity/npub1<payload>-<key>-<checksum>`，使用 XOR 加密编码 nickname + pubkey，添加联系人时自动携带昵称而非截断 pubkey
- **随机 key + checksum**：每次编码生成不同随机 key，附带 1 字节校验，篡改串即失效
- **npub1 前缀伪装**：分享串外观类似 Nostr npub 密钥
- **登录页版本号显示**：右下角小字灰色显示当前版本

### Improvements

- **废弃 dodobox://contact/ 协议**：删除 `encodeContactInfo`，统一使用 identity 格式；保留 `decodeContactInfo` 做向后兼容
- **deploy 命令升级**：新增 CHANGELOG 生成、git tag、release 分支部署流程

### Changed Files

- `lib/utils.ts` — 重写 encodeIdentityInfo/decodeIdentityInfo，新增 XOR + checksum 编解码
- `lib/nostr/mock-adapter.ts` / `real-adapter.ts` — addContact 支持 identity 协议解码及昵称提取
- `app/(main)/settings/page.tsx` — Share/Copy 传入 nickname
- `app/(main)/contacts/page.tsx` — 验证和提示文案统一为 identity 格式
- `app/login/page.tsx` — 添加版本号显示
- `tests/unit/lib/utils.test.ts` — 新增 6 个 identity 编解码测试

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
