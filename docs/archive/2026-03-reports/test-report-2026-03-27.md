# 测试报告 2026-03-27

## 总览

| 测试类型 | 状态 | 通过 | 失败 | 覆盖率 |
|---------|------|-----|------|--------|
| 单元/集成测试 | 通过 | 202 | 0 | 52.87% |
| E2E 测试 | 通过 | 24 | 0 | N/A |
| TypeScript 类型检查 | 通过 | - | - | - |
| ESLint | 通过 | - | - | - |

**总体状态**: 通过 (4/4)

---

## 单元/集成测试详情

**测试框架**: Vitest 4.1.0

| 指标 | 数值 |
|------|-----|
| 测试文件 | 17 passed |
| 测试用例 | 202 passed |
| 运行时间 | 19.16s |

### 覆盖率摘要

| 类型 | 覆盖率 | 状态 |
|------|--------|------|
| 语句 (Statements) | 52.87% | 低于目标 |
| 分支 (Branches) | 41.91% | 低于目标 |
| 函数 (Functions) | 48.14% | 低于目标 |
| 行 (Lines) | 54.47% | 低于目标 |

**目标覆盖率**: 80% | **差距**: 约 27%

### 按模块覆盖率

| 模块 | 语句 | 分支 | 函数 | 行 | 状态 |
|------|------|------|------|-----|------|
| lib/nostr/ | 82.00% | 69.28% | 76.80% | 83.87% | 良好 |
| hooks/nostr/ | 62.19% | 41.66% | 51.92% | 65.92% | 中等 |
| contexts/ | 55.62% | 42.30% | 60.00% | 57.04% | 中等 |
| lib/ | 52.77% | 28.26% | 63.15% | 55.17% | 中等 |
| lib/welshman/ | 6.99% | 2.58% | 9.67% | 7.56% | 较差 |
| hooks/ | 0.00% | 0.00% | 0.00% | 0.00% | 无覆盖 |

### 完全覆盖的文件

- lib/nostr/events.ts - 100%
- lib/nostr/types.ts - 100%
- lib/nostr/vault-sync.ts - 100%
- lib/nostr/key-derivation.ts - 100%

### 无覆盖的文件 (需关注)

- hooks/use-mobile.ts
- hooks/use-mounted.ts
- hooks/use-updater.ts
- lib/i18n.ts
- lib/updater.ts
- lib/welshman/* (整个模块)
- lib/nostr/empty-adapter.ts
- lib/nostr/index.ts

---

## E2E 测试详情

**测试框架**: Playwright 1.58
**浏览器**: Chromium (headless)

| 指标 | 数值 |
|------|-----|
| 测试用例 | 24 passed |
| 运行时间 | 5.4m |
| 失败 | 0 |

### 测试文件分布

| 文件 | 用例数 | 状态 |
|------|--------|------|
| tests/e2e/login.spec.ts | 8 | 通过 |
| tests/e2e/messages.spec.ts | 9 | 通过 |
| tests/e2e/multi-user-chat.spec.ts | 2 | 通过 |
| tests/e2e/settings.spec.ts | 5 | 通过 |

### 关键测试场景

- 登录/注册流程
- 消息列表和聊天详情
- 多用户消息交换
- 设置页面导航
- 未认证用户重定向

---

## 编译器警告

### 警告: ./app/login/page.tsx

```
Should not import the named export 'version' (imported as 'version')
from default-exporting module (only default export is available soon)
```

**影响**: 非阻塞警告，不影响功能
**建议**: 检查 app/login/page.tsx 中的导入语句，确保正确导入 package.json 的 version。

---

## 结论与建议

### 结论

1. **所有测试通过** - 202 个单元/集成测试 + 24 个 E2E 测试全部通过
2. **类型检查通过** - 无 TypeScript 错误
3. **代码规范通过** - 无 ESLint 错误

### 待改进项

1. **覆盖率提升** (高优先级)
   - 当前 52.87%，目标 80%
   - 重点关注 lib/welshman/ 模块和 hooks/ 目录
   - 新增 hooks (use-updater.ts, use-mobile.ts) 需要测试

2. **编译器警告修复** (中优先级)
   - 修复 app/login/page.tsx 中的 named import 警告

3. **测试速度优化** (低优先级)
   - E2E 测试耗时 5.4 分钟，可考虑并行化优化

---

## 运行命令

```bash
# 单元/集成测试
pnpm test
pnpm test:coverage

# E2E 测试
pnpm test:e2e

# 类型检查 + Lint
pnpm check
```

---

报告生成时间: 2026-03-27
