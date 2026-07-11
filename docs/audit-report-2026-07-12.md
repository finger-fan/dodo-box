# dodo-box 全量 Audit 报告

> **分支**: `feat/deployable-mvp` vs `main`
> **日期**: 2026-07-12
> **审计范围**: 代码健康度、正确性、安全性、性能/架构、开发者体验 (DX)
> **工具**: /health, code-review-and-quality, security-and-hardening, devex-review, performance-optimization

---

## 一、总览

| 维度 | 得分 | 状态 |
|------|------|------|
| 代码健康度 (Health) | **8.0 / 10** | ⚠️ WARNING |
| 正确性 (Correctness) | **6.5 / 10** | 🔴 NEEDS WORK |
| 安全性 (Security) | **5.5 / 10** | 🔴 NEEDS WORK |
| 性能/架构 (Perf & Arch) | **6.0 / 10** | 🔴 NEEDS WORK |
| 开发者体验 (DX) | **5.0 / 10** | 🔴 NEEDS WORK |

**综合评分: 6.2 / 10** — MVP 阶段可接受，但有多项需优先修复的问题。

---

## 二、代码健康度 Dashboard

### 工具检测结果

| 类别 | 工具 | 得分 | 状态 | 耗时 | 详情 |
|------|------|------|------|------|------|
| 类型检查 | `tsc --noEmit` | 7/10 | ⚠️ WARNING | 8s | 1 个废弃配置项 |
| Lint | `eslint .` | 10/10 | ✅ CLEAN | 5s | 0 warnings |
| 测试 | `vitest run` | 10/10 | ✅ CLEAN | 5s | 224/224 passed |
| 死代码 | `knip` | 4/10 | 🔴 NEEDS WORK | 12s | 12 未用文件 + 10 未用依赖 |

**复合得分: 8.0 / 10**

### 具体问题

#### 🔧 Type Check — 1 个警告
- `tsconfig.json:21` — `"baseUrl"` 选项已被 TypeScript 移除，应删除以避免未来兼容性问题

#### 🧪 Tests — 全部通过 ✅
- 23 个测试文件，224 个测试全部通过
- ⚠️ 集成测试因 Docker 未运行被跳过（`strfry` 中继容器无法启动）

#### 💀 Dead Code — 需要清理
**未使用的文件 (12):**
- `hooks/use-mobile.ts` — Hook 未被引用
- `lib/welshman/message-store.ts` — Welshman 消息存储模块
- `lib/welshman/publish.ts` — Welshman 发布模块
- `lib/welshman/relay-quality.ts` — 中继质量评估
- `lib/welshman/router-config.ts` — 路由器配置
- `lib/welshman/storage.ts` — Welshman 存储适配
- `lib/welshman/store-adapter.ts` — Store 适配器
- `lib/welshman/types.ts` — Welshman 类型定义
- `scripts/cap-postbuild.js` — Capacitor 后处理脚本
- `scripts/cap-prebuild.js` — Capacitor 预构建脚本
- `site/assets/style.css` — 站点样式表
- `tests/integration/global-teardown.ts` — 集成测试清理

**未使用的依赖 (10):**
- `@capacitor/app`, `@capacitor/status-bar` — Capacitor 相关
- `@google/genai` — Google AI SDK
- `@hookform/resolvers` — React Hook Form 解析器
- `@welshman/app`, `@welshman/router`, `@welshman/store` — Welshman 库
- `class-variance-authority` — CSS 类名合并工具
- `idb` — IndexedDB 封装

---

## 三、正确性审查 (Correctness Review)

### Critical — 必须修复

| # | 问题 | 文件 | 行号 |
|---|------|------|------|
| 1 | **pubkey/chatId 碰撞** — hex 前 8 位转 number 会丢失精度，不同联系人可能共享同一 chat_id，导致消息覆盖 | `mock-telegram-adapter.ts` | 16-18 |
| 2 | **relay 状态不一致** — `ensureRelays()` 返回的 relay 结果在 `createIdentity`/`deleteIdentity`/`updateIdentityName` 中被调用但忽略返回值，adapter 使用过期的 relay 配置 | `NostrContext.tsx` | 358-359, 385-386, 409-410 |
| 3 | **relay 配置更新不传播** — 用户在 Settings 修改 relay 后，`vaultSync.setRelayUrls()` 不会被调用，直到页面刷新才生效 | `NostrContext.tsx` | 190-203 |

### Important — 建议修复

| # | 问题 | 文件 | 行号 |
|---|------|------|------|
| 4 | **发送失败消息丢失** — `setMsgInput('')` 在 `await sendMessage()` 之前执行，发送失败时输入框已清空且消息不可恢复 | `chat-view.tsx` | 289-290 |
| 5 | **GET/POST 对 `getChat` 处理不一致** — GET 从 query params 解析 `chat_id`，POST 从 JSON body 解析 | `app/api/telegram/[token]/route.ts` | 145-149, 1334-1338 |
| 6 | **discover 页面空白** — MOCK_CHANNELS 和 MOCK_POSTS 已删除，channels 初始化为空数组，页面完全空白 | `discover/page.tsx` | 52-54 |
| 7 | **fetchChatMessages 每次从 offset 0 开始** — 未利用 `lastUpdateId`，重复拉取所有历史数据 | `mock-telegram-adapter.ts` | 131-134 |
| 8 | **MAX_EVENTS = 10000 未实施** — 常量定义但未实现任何驱逐逻辑，IndexedDB 无界增长 | `lib/welshman/storage.ts` | 12 |

### Suggestions

| # | 问题 |
|---|------|
| 9 | TTL 下拉框 z-index=20 可能与 IdentityModal(z-50) 冲突 |
| 10 | `use-profile.ts` 被删除但功能内联到 `chat-view.tsx`，模式重复 |
| 11 | `getRuntimeConfig()` 错误信息包含 HTTP status code，可能泄露基础设施细节 |

---

## 四、安全性审查 (Security Review)

### Critical — 必须立即修复

| # | 问题 | 文件 | 严重性 |
|---|------|------|--------|
| 1 | **Shell 注入漏洞** — `cap-deploy.sh` 将用户输入直接插值到 `node -e` 字符串中，未做引号转义。攻击向量：`--notes "'; rm -rf /; '"` | `scripts/cap-deploy.sh` | 🔴 可远程执行命令 |

### Important — 高优先级

| # | 问题 | 文件 | 严重性 |
|---|------|------|--------|
| 2 | **Bot token 使用 `NEXT_PUBLIC_` 前缀** — 值会被内联到客户端 JS bundle，任何人 inspect 浏览器都能看到 | `docker-compose.yml:42` | ⚠️ 凭证暴露 |
| 3 | **Relay URL 无协议校验** — 用户可输入 `javascript:` 或 `file://` 等任意协议，可能导致 SSRF | `settings/page.tsx:102-116` | ⚠️ SSRF 风险 |
| 4 | **Vault salt 硬编码** — `dodobox-vault-v1` 是固定盐值，降低 PBKDF2 密钥派生强度，可被预计算彩虹表攻击 | `docker-compose.yml:40` | ⚠️ 加密弱化 |
| 5 | **Telegram mock 端点无速率限制** — `sendMessage` 可被无限调用，`getUpdates` long-poll 无并发上限 | `app/api/telegram/[token]/route.ts` | ⚠️ DoS 风险 |

### Suggestions

| # | 问题 |
|---|------|
| 6 | `/api/config` 端点无认证/限速，公开暴露 relay 配置 |
| 7 | localStorage 明文存储 session 数据（username + pubkeys），本地隐私风险 |
| 8 | `sendMessage` 的 `text` 字段无长度限制和字符过滤 |
| 9 | `.gitignore` 正确排除了 `.env*` 和 `*.keystore` ✅ |
| 10 | 加密实现良好 — AES-GCM 256-bit + PBKDF2 100k iterations ✅ |

---

## 五、性能与架构审查 (Performance & Architecture)

### Performance Anti-Patterns

| # | 严重度 | 文件 | 行号 | 问题 |
|---|--------|------|------|------|
| 1 | HIGH | `NostrContext.tsx` | 154-170 | auto-logout effect 在 `queueMicrotask` 中触发 re-render，session 可能在 microtask 执行期间变化 |
| 2 | MEDIUM | `chat-view.tsx` | 76-78 | 每条消息变化都触发 `scrollIntoView({behavior:'smooth'})`，包括 gap indicator 更新 |
| 3 | MEDIUM | `use-messages.ts` | 34-38 | 每次新消息到达时对**整个消息列表**做 O(n log n) sort |
| 4 | MEDIUM | `settings/page.tsx` | 59-63 | relay 状态每 3 秒创建新 Map 对象，即使内容未变也触发 full re-render |
| 5 | LOW | `real-adapter.ts` | 228-286 | profile fetch 批量处理正确，但 JSON.parse 静默失败无日志 |

### Bundle Size Concerns

| # | 严重度 | 问题 |
|---|--------|------|
| 6 | HIGH | knip 报告 10 个未使用的依赖，验证后再删除 |
| 7 | MEDIUM | `motion/react` 在 IdentityModal 中使用 slide-in 动画，增加 ~15KB 包体积 |
| 8 | LOW | `use-mounted.ts` 抽取了 4+ 处重复模式，是 bundle 正面改进 ✅ |

### Architecture Issues

| # | 严重度 | 问题 |
|---|--------|------|
| 9 | MEDIUM | **Relay 配置三重来源** — `NostrContext.ensureRelays()`, `runtime-config.ts.getUserRelays()/getDefaultRelays()`, `real-adapter.ts` 构造函数各自独立实现 fallback chain |
| 10 | MEDIUM | **`settings/page.tsx` 422 行 god component** — 处理身份管理、语言、主题、联系人缓存、adapter 模式切换、relay 编辑、TTL 配置、OTA 更新检查 |
| 11 | MEDIUM | **`IdentityModal.tsx` 包含两个独立 modal** — 全屏身份列表 + 创建/编辑名称对话框 |
| 12 | MEDIUM | **Telegram mock init 逻辑重复** — `app/api/telegram/[token]/route.ts` 和 `contacts/route.ts` 各有一份 |
| 13 | LOW | **Welshman 目录 7 个文件 knip 报未使用** — 可能是预留迁移层尚未接入 |
| 14 | LOW | **TTL 设置在 UI 中存在但后端未读取** — UI-only feature |

### Code Duplication

| # | 严重度 | 问题 |
|---|--------|------|
| 15 | MEDIUM | **Relay 初始化逻辑重复 3 处** — `NostrContext.tsx`, `runtime-config.ts`, `real-adapter.ts` |
| 16 | MEDIUM | **Message sorting 重复** — `use-messages.ts` 和 `real-adapter.ts` 各有 sort 函数 |

---

## 六、开发者体验审查 (DX Audit)

### DX Scorecard

| 维度 | 得分 | 证据 | 方法 |
|------|------|------|------|
| Getting Started | 5/10 | README 说 `npm install`，项目实际用 pnpm | INFERRED |
| API/CLI/SDK | 6/10 | pnpm scripts 完整，但缺少 CLI help | TESTED |
| Error Messages | 5/10 | 构建失败只看到 `fonts.googleapis.com` 网络错误，无修复指引 | TESTED |
| Documentation | 6/10 | docs/ 有架构文档但无 contributing guide | TESTED |
| Upgrade Path | 4/10 | CHANGELOG 质量好，但无 migration guide | INFERRED |
| Dev Environment | 5/10 | Docker compose 配置完善但无快速启动脚本 | INFERRED |
| Community | 3/10 | 无 GitHub issues template, 无 contributing guide | INFERRED |
| DX Measurement | 2/10 | 无反馈机制 | INFERRED |

**Overall DX: 4.6 / 10**

### 具体问题

1. **README 误导** — 写的是 `npm install`/`npm run dev`，但项目使用 pnpm。新手会踩坑。
2. **构建失败无指引** — `pnpm build` 因 Google Fonts 网络不可达而失败，错误信息没有说明这是网络问题而非代码问题，也没有离线字体方案。
3. **无 CI/CD** — 没有 GitHub Actions 或 GitLab CI 配置，PR 合并无自动化门禁。
4. **无 Contributing Guide** — 外部贡献者不知道如何提交 PR。
5. **CHANGELOG 质量高** — 按版本详细记录 features/fixes/improvements/tests，值得保留 ✅
6. **Docker 配置完善** — 多阶段构建 + healthcheck + resource limits，部署体验好 ✅
7. **i18n 支持** — en/zh 双语言，浏览器自动检测 ✅

---

## 七、综合问题清单 (按优先级排序)

### P0 — 立即修复 (阻塞合并)

| # | 严重度 | 问题 | 影响 |
|---|--------|------|------|
| 1 | 🔴 Critical | `cap-deploy.sh` shell 注入漏洞 | 任意命令执行 |
| 2 | 🔴 Critical | relay 配置在身份操作中不传播 | 用户切换身份后消息发不出去 |
| 3 | 🔴 Critical | mock-telegram chatId 碰撞 | 不同联系人消息互相覆盖 |

### P1 — 高优先级 (本迭代修复)

| # | 严重度 | 问题 | 影响 |
|---|--------|------|------|
| 4 | ⚠️ Important | Bot token 通过 `NEXT_PUBLIC_` 暴露到客户端 | 凭证泄露 |
| 5 | ⚠️ Important | Relay URL 无协议校验 | SSRF 风险 |
| 6 | ⚠️ Important | Vault salt 硬编码 | 加密弱化 |
| 7 | ⚠️ Important | 发送失败消息丢失 | 用户体验差 |
| 8 | ⚠️ Warning | relay 配置更新不传播到 vaultSync | 设置修改不生效 |
| 9 | ⚠️ Warning | message sort O(n log n) 全量排序 | 长对话卡顿 |

### P2 — 中优先级 (下个迭代)

| # | 问题 | 建议 |
|---|------|------|
| 10 | 12 个未使用文件 + 10 个未使用依赖 | 清理 dead code |
| 11 | settings/page.tsx 422 行 god component | 拆分为子组件 |
| 12 | relay 配置三重来源 | 统一到 `lib/relay-config.ts` |
| 13 | discover 页面空白 | 添加 placeholder 或 mock 数据 |
| 14 | tsconfig.json `baseUrl` 废弃 | 删除该选项 |
| 15 | 无 CI/CD | 添加 GitHub Actions |
| 16 | 无 Contributing Guide | 添加 CONTRIBUTING.md |

### P3 — 低优先级 (技术债)

| # | 问题 |
|---|------|
| 17 | README 中的 npm → pnpm 修正 |
| 18 | Google Fonts 离线方案 |
| 19 | MAX_EVENTS 未实施驱逐逻辑 |
| 20 | Welshman 模块群是否保留 |

---

## 八、改进计划建议

基于以上审计结果，建议按以下顺序制定改进计划：

### Phase 1: 安全加固 (1-2 天)
1. 修复 `cap-deploy.sh` shell 注入 — 使用 heredoc 或参数化调用
2. 移除 `NEXT_PUBLIC_MOCK_TELEGRAM_TOKEN` — 改用服务端环境变量
3. 添加 relay URL 协议白名单校验 (`wss://` 或 `ws://`)
4. 生成随机 vault salt（首次运行时生成并持久化）

### Phase 2: 正确性修复 (2-3 天)
5. 修复 relay 配置传播 — 身份操作后调用 `vaultSync.setRelayUrls()`
6. 修复 chatId 碰撞 — 使用完整 pubkey 或 `tg:` 前缀编码
7. 修复消息发送失败 — 先 await 再清空输入框
8. 统一 Telegram API GET/POST 处理

### Phase 3: 架构重构 (3-5 天)
9. 提取统一 relay config 模块
10. 拆分 `settings/page.tsx` — 提取 IdentitySection, RelaySection, TtlSection
11. 拆分 `IdentityModal.tsx` — 分离列表 modal 和编辑 dialog
12. 去重 Telegram mock init 逻辑
13. 优化 message sort — 改为二分插入

### Phase 4: 开发体验 (2-3 天)
14. 修正 README 中的 npm → pnpm
15. 添加 Google Fonts 离线 fallback
16. 添加 GitHub Actions CI（lint + test + typecheck）
17. 添加 CONTRIBUTING.md
18. 清理 dead code 和未使用依赖

### Phase 5: 性能优化 (2-3 天)
19. 节流 scroll-to-bottom（仅对新消息触发）
20. relay status polling 改用 ref-based equality check
21. 微任务 state update 改为条件渲染
22. 考虑 knip 报告的未使用依赖是否真未使用

---

## 九、附录

### A. 运行命令汇总

```bash
# 类型检查
tsc --noEmit          # 8s, 1 warning
pnpm lint             # 5s, clean
pnpm test             # 5s, 224/224 passed

# 死代码检测
npx knip              # 12s, 12 unused files, 10 unused deps

# 构建测试
pnpm build            # FAIL (Google Fonts 网络不可达)

# 安全审计
npm audit             # N/A (使用 pnpm registry, endpoint 不存在)

# 依赖审计
pnpm audit            # N/A (pnpm mirror 不支持 audit endpoint)
```

### B. 变更统计

| 类型 | 文件数 | 行数 |
|------|--------|------|
| 新增 | ~80+ | ~5000+ |
| 修改 | ~30+ | ~2000+ |
| 删除 | ~5 | ~200 |

主要新增模块：
- `lib/welshman/` — Welshman Nostr 库适配层
- `components/settings/IdentityModal.tsx` — 身份管理模态框
- `app/api/telegram/` — Mock Telegram Bot API
- `android/` — Capacitor Android 原生项目
- `docs/` — 架构文档、部署指南、测试 TODO

### C. 审计方法

本次审计使用了以下 gstack 技能：
1. `/health` — 代码健康仪表盘（类型检查、lint、测试、死代码）
2. `code-review-and-quality` — 五轴代码审查（正确性、可读性、架构、安全、性能）
3. `security-and-hardening` — 安全审查（OWASP Top 10、输入验证、密钥管理）
4. `devex-review` — 开发者体验审计（Getting Started、API Ergonomics、Error Messages）
5. `performance-optimization` — 性能审查（Bundle Size、Re-renders、N+1、架构一致性）

其中三个审查维度（Correctness、Security、Performance & Architecture）通过并行 subagent 完成。
