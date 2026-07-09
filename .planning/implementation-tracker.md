# dodo-box 可部署测试 MVP 实施追踪

> 对应分支：`feat/deployable-mvp`  
> 对应 Spec：[deploy-spec-and-plan.md](./deploy-spec-and-plan.md)  
> 最后更新：2026-07-10

---

## 总体进度

| Phase | 目标 | 预计工期 | 状态 |
|---|---|---|---|
| Phase 1 | 修复构建阻塞 | 1-2 天 | 已完成 |
| Phase 2 | 修复 Docker 部署 | 1-2 天 | 未开始 |
| Phase 3 | 运行时可靠性补齐 | 2-3 天 | 未开始 |
| Phase 4 | 测试修复与补齐 | 2-3 天 | 未开始 |
| Phase 5 | E2E 与部署验证 | 2-3 天 | 未开始 |

---

## Phase 1：修复构建阻塞

### 任务清单

- [x] **T1.1** 修复 `tests/integration/contexts/NostrContext.test.tsx` 中 `NostrContext` mock 缺少 `adapterMode` / `setAdapterMode` 的类型错误
- [x] **T1.2** 修复 `tests/integration/hooks/use-messages.test.tsx` 中 `NostrContext` mock 缺少 `adapterMode` / `setAdapterMode` 的类型错误
- [x] **T1.3** 修复 `tests/integration/hooks/use-messages-rapid.test.tsx` 中 `NostrContext` mock 缺少 `adapterMode` / `setAdapterMode` 的类型错误
- [x] **T1.4** 修复 `tests/unit/hooks/use-chats.test.tsx` 中 `NostrContext` mock 缺少 `adapterMode` / `setAdapterMode` 的类型错误
- [x] **T1.5** 修复 `tests/unit/hooks/use-contacts.test.tsx` 中 `NostrContext` mock 缺少 `adapterMode` / `setAdapterMode` 的类型错误
- [x] **T1.6** 修复 pnpm 构建脚本授权配置
  - 方案 A：将 `pnpm-workspace.yaml` 的 `allowBuilds` 改为有效的 `onlyBuiltDependencies` 列表
  - 方案 B：删除 `pnpm-workspace.yaml` 并改用 `.npmrc` 配置 `onlyBuiltDependencies`
- [x] **T1.7** 删除 `package-lock.json`（项目使用 pnpm）
- [x] **T1.8** 验证 `pnpm check` 通过
- [x] **T1.9** 验证 `pnpm test` 仍通过（202 个测试）

### Phase 1 验收标准

- `pnpm check` 无错误、无警告
- `pnpm test` 全绿
- 仓库不再存在 `package-lock.json`

---

## Phase 2：修复 Docker 部署

### 任务清单

- [ ] **T2.1** 将客户端 relay 配置从 build-time 改为 runtime
  - 新增 `/api/config` 或 window 注入配置接口，返回实际 relay URL
  - 修改 `lib/nostr/real-adapter.ts` 和 `lib/nostr/vault-sync.ts` 支持外部传入 relay URLs
  - 修改 `contexts/NostrContext.tsx` 在 mount 时拉取运行时配置
- [ ] **T2.2** 处理 Dockerfile 中 pnpm 11 的 build scripts 授权
  - 复制 `.npmrc` / `pnpm-workspace.yaml` 配置，或使用 `--ignore-scripts`（需评估原生包影响）
- [ ] **T2.3** 为必须 build 时固化的变量使用 `ARG`（如 `NEXT_PUBLIC_APP_VERSION`）
- [ ] **T2.4** 验证 `docker build` 成功
- [ ] **T2.5** 验证 `docker compose up` 成功，容器健康检查通过
- [ ] **T2.6** 验证容器内 web 应用可访问，且客户端连接的是本地 strfry relay 而非默认公网 relay

### Phase 2 验收标准

- `docker build -t dodo-box:test .` 成功
- `docker compose up` 后 `http://127.0.0.1:18300/api/health` 返回 `ok`
- 浏览器访问后，登录/注册流程指向 `ws://relay:7777`（或本地 strfry 地址）

---

## Phase 3：运行时可靠性补齐

### 任务清单

- [ ] **T3.1** 新增 relay 连接状态 UI
  - 在 settings 或 chat 页面显示连接状态
  - 失败时显示明确提示（如 "Relay 未连接，请检查网络"）
- [ ] **T3.2** 登录流程等待 relay 连接就绪
  - 修改 `vaultSync.fetchVault` 或 `NostrContext.login`，增加重试和超时提示
  - 避免误报 "Account not found"
- [ ] **T3.3** 联系人名称解析 fallback
  - `RealNostrAdapter.getContacts` 在 petname 不存在时读取 kind:0 profile
  - 优先级：petname > display_name > name > npub 截断
- [ ] **T3.4** 聊天列表空状态优化
  - 新用户无联系人时显示引导添加联系人
  - 添加联系人后自动刷新聊天列表
- [ ] **T3.5** Settings 中支持编辑并持久化 relay 列表
  - 编辑框、保存按钮
  - 保存到 localStorage，刷新后恢复
  - 修改 `RealNostrAdapter.setRelays` 从 localStorage 读取
- [ ] **T3.6** 刷新后自动登出的 UX 提示
  - 在 `app/(main)/layout.tsx` 或 `NostrContext` 中增加 toast/提示
  - 说明 "为了安全，页面刷新后需要重新登录"

### Phase 3 验收标准

- 本地 strfry relay 环境下，完整用户旅程：注册 -> 登录 -> 添加联系人 -> 发消息 -> 收消息
- 断网/relay 未启动时，用户能看到明确错误提示
- 联系人名称显示正常，不出现 hex pubkey
- 刷新后登出有提示，不突兀

---

## Phase 4：测试修复与补齐

### 任务清单

- [ ] **T4.1** 修复 `vitest.config.ts` 中 integration 测试配置
  - `include` 改为 `tests/integration/**/*.test.{ts,tsx}`
  - 为 `tests/integration/nostr-adapter.test.ts` 指定 `node` 环境（其余 integration 可保持 jsdom）
- [ ] **T4.2** 添加 Vitest 集成测试 global setup
  - 在 `tests/integration/global-setup.ts` 中启动 `docker-compose.test.yml` 的 strfry relay
  - 添加 `global-teardown.ts` 停止 relay
- [ ] **T4.3** 补齐 `TEST-TODO.md` 中的 P0 测试
  - 消息排序与去重（T-MSG-01 ~ T-MSG-04）
  - gap recovery 单元测试（T-MSG-05 ~ T-MSG-07）
  - 消息发送可靠性（T-MSG-10 ~ T-MSG-14）
  - 联系人显示正确性（T-CON-01 ~ T-CON-05）
  - 添加/删除联系人（T-CON-11 ~ T-CON-15）
- [ ] **T4.4** 补齐 P1 测试
  - 身份管理（T-IDT-01 ~ T-IDT-04）
  - relay 连接（T-RLY-01 ~ T-RLY-04）
  - chat 列表（T-CHT-01 ~ T-CHT-04）
- [ ] **T4.5** 运行 `pnpm test:coverage` 并确认核心模块覆盖率达到 80%
- [ ] **T4.6** 修复 `nostr-adapter.test.ts` 运行时的依赖问题（如 `ws` 模块）

### Phase 4 验收标准

- `pnpm test` 包含 `nostr-adapter.test.ts` 并通过
- 核心模块覆盖率 >= 80%
- P0/P1 测试基本补齐

---

## Phase 5：E2E 与部署验证

### 任务清单

- [ ] **T5.1** 运行完整 E2E 套件：`pnpm test:e2e`
- [ ] **T5.2** 修复 `tests/e2e/login.spec.ts` 中的失败项
- [ ] **T5.3** 修复 `tests/e2e/messages.spec.ts` 中的失败项
- [ ] **T5.4** 修复 `tests/e2e/settings.spec.ts` 中的失败项
- [ ] **T5.5** 修复 `tests/e2e/multi-user-chat.spec.ts` 中的失败项（多用户消息互通）
- [ ] **T5.6** 在 Docker 环境中手动或自动运行 E2E 验证
- [ ] **T5.7** 验证移动构建（可选）
  - `pnpm cap:build`
  - `pnpm cap:apk:debug`
- [ ] **T5.8** 编写部署文档 `docs/deployment.md` 或更新 `README.md`
  - Docker 部署步骤
  - 本地测试步骤
  - 环境变量说明

### Phase 5 验收标准

- `pnpm test:e2e` 全绿（或核心流程通过）
- Docker 部署可通过 E2E 验证
- 提供清晰的部署文档

---

## 全局 Definition of Done

- [ ] `pnpm check` 通过
- [ ] `pnpm test` 通过
- [ ] `pnpm build` 通过
- [ ] `docker compose up` 成功
- [ ] `pnpm test:e2e` 通过（核心流程）
- [ ] 多账户 A/B 在本地 strfry relay 下可互相收发消息
- [ ] 核心模块覆盖率 >= 80%
- [ ] 部署文档完整

---

## 进度日志

| 日期 | 完成项 | 备注 |
|---|---|---|
| 2026-07-10 | 创建分支 `feat/deployable-mvp` | 基于 dev |
| 2026-07-10 | 创建 Spec & Tracker | 文档位于 `.planning/` |
|  |  |  |
|  |  |  |
|  |  |  |

---

## 当前阻塞

| 阻塞项 | 影响 | 解决方案 | 负责人 |
|---|---|---|---|---|
| 待补充 |  |  |  |

