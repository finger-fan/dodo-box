# Plan: Relay 管理重构 — 合并 + 状态回调 + CLI/Web 应用

## Context

当前 lib 里存在两套几乎相同的 relay 管理代码（`lib/welshman/relay-manager.ts` 给 web，`lib/messaging/relay-node.ts` 给 CLI），唯一差异是 import 来源不同（`getPool()` vs `getNodePool()`），而这两个函数底层是同一个。这导致 CLI 的验证无法保证 web 端的正确性。

同时，relay 连接状态没有回调机制，CLI 无法实时感知连接变化，web 端也一直显示"未连接"。

目标：合并为一套 → 增加状态回调 → 先应用于 CLI → 再修复 web 端。

---

## Step 1: 合并两套 relay 管理代码为一套

### 现状
- `lib/welshman/relay-manager.ts` — web 端用，import `getPool/getTracker` from `./engine`
- `lib/messaging/relay-node.ts` — CLI 用，import `getNodePool/getNodeTracker` from `../welshman/engine-node`
- 两者函数签名和逻辑几乎完全相同
- `getNodePool()` 内部就是 `return getPool()`，同一个函数

### 操作
1. 保留 `lib/welshman/relay-manager.ts` 作为唯一的 relay 管理文件
2. 将 `relay-node.ts` 中独有的差异合并进去（如果有）
3. 删除 `lib/messaging/relay-node.ts`
4. 更新所有 import `relay-node` 的文件改为 import `relay-manager`：
   - `lib/messaging/relay-quality.ts`
   - `lib/messaging/contacts.ts`
   - `cli/main.ts`
5. 删除 `relay-manager.ts` 里多余的 `getRepository` import（代码里没用到）
6. 删除 `engine-node.ts` 里的 `getNodePool/getNodeTracker`（只保留 `initNodeEngine`/`destroyNodeEngine`）
7. 保留 `engine-node.ts` 的 `initNodeEngine`/`destroyNodeEngine`（用于 engine 初始化的 nodeMode 差异）

### 验证
- `npx tsc --noEmit` 类型检查通过
- `pnpm cli` 正常启动
- web 端 `pnpm dev` 正常启动

---

## Step 2: 增加 relay 状态回调机制

### 设计
在 `lib/welshman/relay-manager.ts` 中增加状态管理：

```ts
// 状态类型
type RelayStatus = 'connecting' | 'connected' | 'failed' | 'closed'

// 回调签名（可选）
type OnRelayStatusChange = (url: string, status: RelayStatus) => void

// 管理器初始化选项
interface RelayManagerOptions {
  onStatusChange?: OnRelayStatusChange
}
```

### 实现方式
- 监听 welshman Socket 的 `SocketEvent.Status` 事件
- 将 welshman 的 `SocketStatus`（opening/open/closed/error）映射为我们的 `RelayStatus`
- 状态变化时调用可选回调
- 提供 `getStatusMap(): Map<string, RelayStatus>` 查询当前状态

### 映射关系
- `SocketStatus.Opening` → `'connecting'`
- `SocketStatus.Open` → `'connected'`
- `SocketStatus.Error` → `'failed'`
- `SocketStatus.Closed` → `'closed'`

### 验证
- 单元测试：模拟状态变化，验证回调被触发
- **真实连接测试**：启动本地 relay（`ws://localhost:7778`），连接它，验证状态回调触发，状态流转正确
- 手动测试：连接 relay 时能观察到状态流转

---

## Step 3: 将回调应用于 CLI

### 操作
1. `cli/main.ts` 中初始化 relay manager 时传入 `onStatusChange` 回调
2. 回调中 `console.log` 输出状态变化（如 `✅ Connected to wss://relay.damus.io`），命令立即返回
3. 简化 `/relay select` — 不再手动 sleep 2 秒检查状态，等待回调通知
4. 将 `/relay list` 改名为 `/relay status` — 显示当前所有 relay 的状态
5. `/relay select` 支持逗号分隔多选：`/relay select 1,2,4`
6. 删除 `/relay test` 命令（连通性测试由 manager 内部完成）

### 验证
- `pnpm cli` → `/relay select 1` → 实时看到 connecting → connected
- `/relay select 1,3` → 选中多个 relay
- `/relay status` → 显示所有 relay 的当前状态
- 断网/relay 关闭时自动看到 failed 状态

---

## Step 4: 将回调应用于 Web UI

### 操作
1. Web 端的 relay 状态组件改为订阅 manager 的 `onStatusChange` 回调
2. 用 React state 或 store 保存状态，实时渲染
3. 解决当前 web 端一直显示"未连接"的问题

### 需要调研
- Web 端当前 relay 状态显示的组件在哪里
- 用什么状态管理（React state / zustand / context）

### 验证
- Web UI 能实时显示每个 relay 的连接状态
- 连接/断开/失败状态变化时 UI 自动更新

---

## 关键文件

| 文件 | 操作 |
|---|---|
| `lib/welshman/relay-manager.ts` | 保留，增加状态回调 |
| `lib/messaging/relay-node.ts` | 删除 |
| `lib/welshman/engine-node.ts` | 保留 initNodeEngine，去掉 relay 相关 re-export |
| `lib/messaging/relay-quality.ts` | 改 import 到 relay-manager |
| `lib/messaging/contacts.ts` | 改 import 到 relay-manager |
| `cli/main.ts` | 使用新 manager + 回调 |
| Web 端 relay 状态组件 | Step 4 时确定 |

## 执行顺序

每个 Step 独立提交。Step 1 完成后再开始 Step 2，以此类推。
