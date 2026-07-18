# dodo-box

基于 Nostr 协议的隐私优先多账户消息应用原型。作为 Google AI Studio applet 构建，使用 Next.js。当前使用模拟数据（尚未连接真实 Nostr 中继）。

## 技术栈

- **Next.js 15**（App Router）+ **React 19** + **TypeScript 5.9**
- **Tailwind CSS v4**，暗色模式（class 策略，`next-themes`）
- **i18next** 国际化（英文 / 中文）
- **Framer Motion**（`motion`）动画
- **Lucide React** 图标
- **Standalone output** 模式，支持容器部署

## 快速开始

**前置要求：** Node.js

```bash
npm install
npm run dev
```

如需使用 Gemini AI 功能，在 `.env.local` 中设置 `GEMINI_API_KEY`。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint 检查 |
| `npm run clean` | 清除 Next.js 缓存 |

## 路由

| 路径 | 说明 |
|------|------|
| `/` | 重定向到 `/login` |
| `/login` | 账户创建与登录（通过模拟 KDF 派生凭证） |
| `/(main)/messages` | 聊天列表 |
| `/(main)/messages/[id]` | 单个聊天会话 |
| `/(main)/contacts` | 联系人管理（支持滑动操作） |
| `/(main)/discover` | 发现页（可订阅频道的内容流） |
| `/(main)/settings` | 身份管理、主题、语言、中继配置 |

所有 `(main)` 路由通过 localStorage（`dodobox_account_active`）进行认证守护。

## 架构

### 核心模块

- **`components/Providers.tsx`** - ThemeProvider（next-themes）+ i18n 初始化
- **`lib/i18n.ts`** - i18next 浏览器语言检测；翻译文件位于 `public/locales/{en,zh}.json`
- **`lib/utils.ts`** - `cn()` 工具函数（clsx + tailwind-merge）及 `dodobox://` 协议编解码
- **`lib/mock-data.ts`** - TypeScript 接口（`Message`、`Chat`）和种子数据
- **`hooks/use-mobile.ts`** - 响应式断点 Hook
- **`components/ui/`** - 公共 UI：`BottomNav`、`ConfirmDialog`、`SwipeableListItem`、`Toast`

### 自定义协议

使用 `dodobox://` URI 方案分享联系人和身份信息：

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

### 设计系统

- 翡翠绿（Emerald）主色调
- Zinc 中性色用于文本和背景
- 毛玻璃效果（backdrop blur）
- 移动优先响应式设计
- 底部导航栏（4 个标签页）：消息、联系人、发现、设置

## 环境变量

| 变量 | 说明 |
|------|------|
| `GEMINI_API_KEY` | Gemini AI API 密钥（AI Studio 注入） |
| `APP_URL` | 托管 URL（AI Studio 注入） |
| `DISABLE_HMR` | 设为 `"true"` 禁用热模块替换 |


 使用方法

在需要允许截屏的页面中调用：
import { disablePrivacy, enablePrivacy } from '@/lib/privacy-screen';

  useEffect(() => {
    disablePrivacy();
    return () => { enablePrivacy(); };
  }, []);




nslookup 186.241.72.33.sslip.io
Server:		8.8.8.8
Address:	8.8.8.8#53

Non-authoritative answer:
Name:	186.241.72.33.sslip.io
Address: 186.241.72.33


http://186.241.72.33.sslip.io/download/index.html

