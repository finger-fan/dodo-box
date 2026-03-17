# CLAUDE.md

为 Claude Code (claude.ai/code) 提供本仓库的代码导航指引。

## 项目概述

**dodo-box** - 基于 Nostr 协议的隐私优先多账户消息应用原型。作为 Google AI Studio applet 构建，使用 Next.js。当前使用模拟数据（尚未连接真实 Nostr 中继）。

## 命令

```bash
npm run dev      # 启动开发服务器 (Next.js)
npm run build    # 生产构建
npm run lint     # ESLint 检查
npm run clean    # 清除 Next.js 缓存
```

尚未配置测试框架。

## 架构

- **Next.js 15** App Router + React 19 + TypeScript 5.9 + Tailwind CSS v4
- **Standalone output** 模式（`next.config.ts`），用于容器部署
- **路径别名**: `@/*` 映射到项目根目录

### 路由

使用 Next.js App Router，通过路由组管理认证页面：

- `/` - 重定向到 `/login`
- `/login` - 账户创建/登录（在 localStorage 中存储 `dodobox_account_active`）
- `/(main)/messages` - 聊天列表
- `/(main)/messages/[id]` - 单个聊天会话
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
