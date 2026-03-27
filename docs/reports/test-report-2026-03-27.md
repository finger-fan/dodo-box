# dodo-box 全流程测试报告

**测试日期**: 2026-03-27
**分支**: dev
**版本**: 0.8.8

---

## 1. 总览

| 类别 | 总数 | 通过 | 失败 | 跳过 | 结果 |
|------|------|------|------|------|------|
| 单元/集成测试 (Vitest) | 202 | 202 | 0 | 0 | PASS |
| E2E 测试 (Playwright) | 24 | 24/22 | 0/2 | 0 | FLAKY |
| TypeScript 类型检查 | - | - | 0 错误 | - | PASS |
| ESLint 检查 | - | - | 0 错误 | - | PASS |

> E2E 测试两次运行结果不一致（第1次 24/24 通过，第2次 22/24），存在 flaky 用例。

---

## 2. 单元/集成测试详情

**测试文件**: 17 个，全部通过
**测试用例**: 202 个，全部通过
**运行时间**: ~19s（无覆盖率） / ~26s（含覆盖率）

### 覆盖率统计

| 指标 | 百分比 | 目标 (80%) | 状态 |
|------|--------|-----------|------|
| 语句 (Statements) | 52.87% | 80% | 未达标 |
| 分支 (Branches) | 41.91% | 80% | 未达标 |
| 函数 (Functions) | 48.14% | 80% | 未达标 |
| 行 (Lines) | 54.47% | 80% | 未达标 |

### 覆盖率良好的模块 (>80%)

| 模块 | 覆盖率 |
|------|--------|
| `lib/nostr/events.ts` | 100% |
| `lib/nostr/key-derivation.ts` | 100% |
| `lib/nostr/types.ts` | 100% |
| `lib/nostr/vault-sync.ts` | 100% |
| `lib/nostr/gap-detection.ts` | 100% |
| `hooks/nostr/use-chats.ts` | 100% |
| `lib/nostr/seq-counter.ts` | 96% |
| `lib/nostr/contact-cache.ts` | 92-97% |
| `lib/nostr/vault-crypto.ts` | 91-92% |
| `lib/utils.ts` | 85-91% |
| `lib/nostr/relay-client.ts` | 84-86% |

### 覆盖率不足的模块 (<10%)

| 模块 | 覆盖率 | 说明 |
|------|--------|------|
| `lib/welshman/` | ~7% | 新集成模块，仅 `crypto.ts` 有测试 (95%) |
| `hooks/use-mobile.ts` | 0% | UI Hook |
| `hooks/use-mounted.ts` | 0% | UI Hook |
| `hooks/use-updater.ts` | 0% | 更新检测 Hook |
| `lib/i18n.ts` | 0% | 国际化配置 |
| `lib/updater.ts` | 0% | 应用更新逻辑 |
| `lib/nostr/empty-adapter.ts` | 0% | 空适配器 |
| `lib/nostr/index.ts` | 0% | 入口文件 |

---

## 3. E2E 测试详情

**测试用例**: 24 个
**浏览器**: Chromium (headless)
**测试中继**: 本地 Docker (端口 7778)

### 测试文件概况

| 测试文件 | 用例数 | 第1次运行 | 第2次运行 |
|----------|--------|-----------|-----------|
| `login.spec.ts` | 8 | 8 PASS | 7 PASS, 1 FAIL |
| `messages.spec.ts` | 9 | 9 PASS | 9 PASS |
| `multi-user-chat.spec.ts` | 3 | 3 PASS | 2 PASS, 1 FAIL |
| `settings.spec.ts` | 4 | 4 PASS | 4 PASS |

### E2E 覆盖的关键流程

- 登录/注册（表单验证、错误处理、成功流程）
- 消息列表展示、聊天详情、消息发送
- 多用户注册、添加联系人、消息交换
- 快速消息发送（无消息丢失验证）
- 设置页面功能

### Flaky 测试分析

**1. `login.spec.ts:56` - "register then login succeeds"**
- 现象：登录后页面停留在 `/login`，未在 5 秒内跳转到 `/messages`
- 原因：登录后路由跳转时间不稳定

**2. `multi-user-chat.spec.ts:13` - "Alice and Bob can register, add contacts, and exchange messages"**
- 现象：点击联系人导航后 `waitForURL("**/contacts")` 超时 (10s)
- 原因：底部导航点击后页面路由切换延迟

失败截图保存在 `test-results/` 目录下。

---

## 4. 编译器警告

| 文件 | 警告内容 | 严重性 |
|------|---------|--------|
| `app/login/page.tsx` | 从默认导出模块中导入命名导出 `version` | 低 (webpack 警告) |

---

## 5. 结论与建议

**整体状态: 功能正常，核心测试全部通过。**

### 待改进项

1. **测试覆盖率偏低** (52.87%)：距目标 80% 有差距，主要缺口在 `lib/welshman/` 模块和 UI Hooks
2. **E2E Flaky 测试**: 2 个用例存在竞态条件，建议增加超时或添加重试机制
3. **`version` 导入警告**: `app/login/page.tsx` 中的 named export 导入方式需改为 default import
4. **E2E 测试耗时较长** (近6分钟)：可考虑增加并行 worker 数量
