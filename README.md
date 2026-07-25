# dodo-box

基于 Nostr 协议的隐私优先多账户消息应用。使用 Next.js + Capacitor 构建，支持 Web 部署和 Android APK 构建，可连接真实 Nostr 中继。

## 技术栈

- **Next.js 15**（App Router）+ **React 19** + **TypeScript 5.9**
- **Tailwind CSS v4**，暗色模式（class 策略，`next-themes`）
- **i18next** 国际化（英文 / 中文）
- **motion**（Framer Motion）动画
- **Lucide React** 图标
- **Capacitor 8** + **Android Gradle** 构建移动端 APK
- **@capgo/capacitor-updater** OTA 更新
- **Standalone output** 模式（Web 容器部署）和 **Static export** 模式（Capacitor）

## 快速开始

**前置要求：** Node.js + pnpm

```bash
pnpm install
pnpm dev
```

## 脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动 Next.js 开发服务器 |
| `pnpm build` | 生产构建（Web standalone） |
| `pnpm lint` | ESLint 检查 |
| `pnpm clean` | 清除 Next.js 缓存 |
| `pnpm check` | 类型检查 + lint |
| `pnpm test` | 运行 Vitest 单元/集成测试 |
| `pnpm test:e2e` | Playwright E2E 测试 |
| `pnpm cap:build` | 构建 Capacitor 静态资源并同步到 Android |
| `pnpm cap:apk:debug` | 构建 Android debug APK |
| `pnpm cap:apk:release` | 构建 Android release APK 并复制到下载站点 |
| `pnpm cap:bundle` | 构建 OTA 更新 bundle |
| `pnpm cap:deploy` | 部署 APK + OTA + 下载落地页 |

## 路由

| 路径 | 说明 |
|------|------|
| `/` | 重定向到 `/login` |
| `/login` | 账户创建 / 登录 |
| `/(main)/messages` | 聊天列表（右上角 + 添加联系人，列表项滑动删除） |
| `/(main)/chat?peer=<pubkey>` | 单个聊天会话 |
| `/(main)/discover` | 发现页（频道订阅与内容流） |
| `/(main)/settings` | 身份管理、主题、语言、中继配置、遮罩与隐私设置 |

`(main)` 路由组通过 localStorage（`dodobox_session`）进行认证守护，并渲染底部导航栏。

## 架构

### 核心模块

- **`components/Providers.tsx`** - ThemeProvider（next-themes）+ i18n 初始化
- **`lib/i18n.ts`** - i18next 浏览器语言检测；翻译文件位于 `public/locales/{en,zh}.json`
- **`lib/utils.ts`** - `cn()` 工具（clsx + tailwind-merge）、`dodobox://` 协议编解码、聊天日期格式化
- **`lib/storage.ts`** - 集中式 localStorage 存取（带 key 常量）
- **`lib/privacy-screen.ts`** - 截屏隐私屏 enable/disable
- **`lib/updater.ts` / `hooks/use-updater.ts`** - OTA 更新逻辑
- **`components/UpdateChecker.tsx`** - OTA 更新提示 UI
- **`components/ui/`** - 公共 UI：`BottomNav`、`ConfirmDialog`、`SwipeableListItem`、`Toast`

### Nostr 相关

- **`contexts/NostrContext.tsx`** - 会话状态、登录/注册、适配器生命周期
- **`lib/nostr/real-adapter.ts`** - 真实 Nostr 中继适配器（Welshman）
- **`lib/nostr/mock-telegram-adapter.ts`** - 本地模拟适配器（无网络）
- **`lib/nostr/vault-sync.ts`** / **`vault-crypto.ts`** - 加密 vault 同步
- **`lib/nostr/message-read-state.ts`** - 每个聊天的最新消息 ID / 已读 ID 追踪
- **`lib/nostr/contact-cache.ts`** - 联系人/聊天本地缓存
- **`lib/nostr/gap-detection.ts`** - 消息 seq 断层检测与恢复
- **`hooks/nostr/use-messages.ts`** - 聊天消息订阅、分页加载、发送
- **`hooks/nostr/use-chats.ts`** - 聊天列表
- **`hooks/nostr/use-contacts.ts`** - 联系人列表

## 自定义协议

使用 `dodobox://` URI 方案分享联系人和身份信息：

- `dodobox://contact/<encoded-pubkey>` - 分享联系人
- `dodobox://identity/<encoded-privkey>` - 分享身份

## 数据存储

所有本地数据使用 localStorage 持久化（通过 `lib/storage.ts`）：

| Key | 用途 |
|-----|------|
| `dodobox_session` | 当前会话（加密） |
| `dodobox_account_active` | 认证状态标志 |
| `dodobox_current_user` | 当前用户名 |
| `dodobox_adapter_mode` | 适配器模式 |
| `dodobox_message_ttl` | 消息 TTL |
| `dodobox_mask_seconds` | 遮罩屏显秒数 |
| `dodobox_mask_charset` | 遮罩字符集 |
| `dodobox_mask_swipe_enabled` | 滑动是否重新显示遮罩 |
| `dodobox_mask_swipe_threshold` | 滑动触发阈值 |
| `dodobox_allow_screenshot` | 是否允许截屏 |
| `dodobox_contact_cache` | 联系人缓存开关 |
| `dodobox_contacts_cache_<pubkey>` | 某身份的联系人缓存 |
| `dodobox_chats_cache_<pubkey>` | 某身份的聊天缓存 |
| `dodobox_user_relays` | 用户自定义中继 |
| `dodobox_relay_quality` | 中继质量记录 |
| `dodobox_last_read_message_id_<pubkey>` | 每个聊天的已读消息 ID |
| `dodobox_last_message_id_<pubkey>` | 每个聊天的最新消息 ID |

## 环境变量

| 变量 | 说明 |
|------|------|
| `GEMINI_API_KEY` | Gemini AI API 密钥（AI Studio 注入） |
| `APP_URL` | 托管 URL（AI Studio 注入） |
| `DISABLE_HMR` | 设为 `"true"` 禁用 HMR |
| `NEXT_PUBLIC_DEFAULT_RELAYS` | 默认 Nostr relay 列表（逗号分隔） |
| `NEXT_PUBLIC_UPDATE_URL` | OTA 更新 manifest URL |
| `NEXT_PUBLIC_APP_VERSION` | 应用版本号（默认从 package.json 读取） |

## 移动端构建

Capacitor 配置位于 `capacitor.config.ts`。release 构建使用 `.env.release` 加载默认 relay 等变量：

```bash
pnpm cap:apk:release
```

构建产物：
- APK：`docker/download-site/apk/dodo-box-<version>-<date>.apk`
- OTA bundle：`bundle.zip` + `manifest.json`

详细部署流程见 `docs/deployment.md`。

## 设计系统

- 翡翠绿（Emerald）主色调
- Zinc 中性色用于文本和背景
- 毛玻璃效果（backdrop blur）
- 移动优先响应式设计
- 底部导航栏（3 个标签页）：消息、发现、设置
