# dodo-box 可部署测试 MVP 实施追踪

> 对应分支：`feat/deployable-mvp`
> 对应 Spec：[deploy-spec-and-plan.md](./deploy-spec-and-plan.md)
> 最后更新：2026-07-10

---

## 总体进度

| Phase | 目标 | 状态 |
|---|---|---|
| Phase 1 | 修复构建阻塞 | 已完成 |
| Phase 2 | 修复 Docker 部署 | 代码已完成，Docker 验证待手动启动 |
| Phase 3 | 运行时可靠性补齐 | 已完成 |
| Phase 4 | 测试修复与补齐 | 已完成（224 测试全绿，覆盖率 82%） |
| Phase 5 | E2E 与部署验证 | 部署文档已写，Docker/E2E 验证待手动启动 |

---

## Phase 1：修复构建阻塞 — 已完成

- [x] T1.1-T1.5 修复所有测试 mock 中 `NostrContextValue` 缺少 `adapterMode`/`setAdapterMode` 的类型错误
- [x] T1.6 修复 `pnpm-workspace.yaml` 使用有效的 `onlyBuiltDependencies` 列表
- [x] T1.7 删除 `package-lock.json`
- [x] T1.8 `pnpm check` 通过
- [x] T1.9 `pnpm test` 全绿

---

## Phase 2：Docker 部署 — 代码已完成

- [x] T2.1 运行时 relay 配置：新增 `/api/config` 端点，客户端通过 `getRuntimeConfig()` 拉取
- [x] T2.2 Dockerfile 复制 `pnpm-workspace.yaml`，pnpm 11 构建脚本授权
- [x] T2.3 Dockerfile 添加 `ARG NEXT_PUBLIC_APP_VERSION`
- [x] T2.4 docker-compose relay URL 改为 `ws://localhost:7777`
- [ ] T2.5 `docker build` 验证（待 Docker Desktop 启动）
- [ ] T2.6 `docker compose up` 验证（待 Docker Desktop 启动）

---

## Phase 3：运行时可靠性补齐 — 已完成

- [x] T3.1 Relay 连接状态 UI：settings 页面显示每个 relay 的连接状态（polling 3s）
- [x] T3.2 登录等待 relay 连接：`ensureRelays()` 优先使用用户配置 > runtime config > 默认值
- [x] T3.3 联系人名称 fallback：petname > display_name > name > npub 截断（`getContacts` 中 fetch kind:0 profile）
- [x] T3.4 聊天列表空状态：无联系人时显示"添加联系人"引导按钮
- [x] T3.5 Settings relay 编辑：textarea 编辑 + 保存 + localStorage 持久化（`setUserRelays`/`getUserRelays`）
- [x] T3.6 刷新后登出提示：login 页面检测 `dodobox_refresh_logout` flag 并显示 info toast

新增文件/函数：
- `lib/runtime-config.ts`: `getUserRelays` / `setUserRelays` / `clearUserRelays`
- `lib/welshman/relay-manager.ts`: `getRelayStatusMap` / `waitForRelayConnection`
- `lib/nostr/real-adapter.ts`: 构造器读取用户 relay，`setRelays` 持久化

---

## Phase 4：测试修复与补齐 — 已完成

- [x] T4.1 修复 `vitest.config.ts` integration include 模式（`.test.{ts,tsx}`）
- [x] T4.2 为 `nostr-adapter.test.ts` 指定 `node` 环境
- [x] T4.3 添加 `global-setup.ts` / `global-teardown.ts`（docker-compose.test.yml 自动启停）
- [x] T4.4 `nostr-adapter.test.ts` relay 不可达时自动跳过
- [x] T4.5 新增单元测试（224 测试，23 文件）：
  - `seq-counter.test.ts`: T-MSG-01 seq 乱序排序、increment/recover/parseSeqTag
  - `vault-crypto.test.ts`: T-IDT-05/06/07 CRUD + encrypt/decrypt round-trip
  - `real-adapter.test.ts`: T-CON-01 名称优先级、T-CON-13 重复拒绝、T-CON-14 协议解析、T-CHT-01 chat 重建
  - `empty-adapter.test.ts`: 全方法覆盖
  - `index.test.ts`: factory 函数 SSR/无session/无privkey
  - `runtime-config.test.ts`: getUserRelays/setUserRelays/clearUserRelays/corrupted JSON
  - `relay-manager.test.ts`: connectToRelays/getConnectedRelays/getFailedRelays/getRelayStatusMap/waitForRelayConnection
- [x] T4.6 `pnpm test:coverage` 通过：全局行覆盖 82.32%，核心模块（nostr）87.86%

---

## Phase 5：E2E 与部署验证 — 部分完成

- [x] T5.8 部署文档 `docs/deployment.md`
- [ ] T5.1-T5.5 E2E 测试（待 Docker Desktop 启动后运行 `pnpm test:e2e`）
- [ ] T5.6 Docker 端到端验证（待 Docker Desktop 启动后运行 `docker compose up`）

---

## 当前阻塞

| 阻塞项 | 影响 | 解决方案 |
|---|---|---|
| Docker Desktop 未启动 | 无法验证 docker build/compose + E2E | 用户手动启动 Docker Desktop |
