# 计划：合并「联系人」标签页进首页（4 Tab → 3 Tab）

> 状态：待实施。前置条件：Android 实时消息修复（AbortSignal.any polyfill）验证通过后
> 再动手，避免两组改动叠在一起无法归因。

## 背景与目标

当前底部 4 个 Tab：消息 / 联系人 / 发现 / 设置。联系人页（`/contacts`）与消息页
（`/messages`）列表内容本质相同（都是联系人列表），联系人页独立存在意义不大。

目标：

1. 底部 Tab 从 4 个减为 3 个：**联系人 / 发现 / 设置**
2. 第一个 Tab 就是现在的消息列表页，但**文案从「消息」改为「联系人」**
   （它列的就是联系人；点进去的聊天窗口不体现"消息"字样，无需改动）
3. 消息页右上角的**搜索按钮（当前是死的，无功能）移除**，换成**添加联系人按钮**
4. 联系人页 `/contacts` 整个删除，其「添加联系人」弹窗迁移到首页

## 现状梳理（已读码确认）

- `components/ui/BottomNav.tsx:14-19` — 4 个 Tab 定义，`/contacts` 是其中之一
- `app/(main)/messages/page.tsx:45-47` — 右上角 Search 按钮无 onClick，纯摆设
- `app/(main)/contacts/page.tsx` — 包含：
  - 添加联系人弹窗（含输入校验、`useContacts().addContact`、Toast）→ **要迁移**
  - 联系人搜索框（页内过滤）→ 随页面删除（隐私聊天不做搜索）
  - 滑动删除联系人（SwipeableListItem + ConfirmDialog）→ **需要决策去处**（见下）
  - 弹窗里的相机按钮（`page.tsx:202`）也是死的，无 onClick → 迁移时一并移除
- i18n key：`common.messages` / `common.contacts` 在 `public/locales/{en,zh}.json`

## 实施步骤

### 1. 抽取添加联系人弹窗为共享组件

新建 `components/contacts/AddContactModal.tsx`：把 `contacts/page.tsx` 中的
modal JSX + `contactInput/error/handleAddContact` 逻辑原样搬入，props 为
`isOpen / onClose / onAdded`，内部继续用 `useContacts().addContact`。
迁移时**移除死相机按钮**。

### 2. 改造消息页（`app/(main)/messages/page.tsx`）

- header 标题：`t('common.messages')` → `t('common.contacts')`
- 右上角 Search 按钮替换为 Plus 按钮（样式沿用 contacts 页的 emerald 按钮），
  点击打开 `AddContactModal`
- 空列表状态的文案 `messages.add_contact_prompt` 保留；可加一个可点的
  「添加联系人」按钮直接开弹窗（可选增强，做不做都行）
- 顺手清理：页面临时诊断埋点（pagehide/beforeunload 监听）若已无需求可移除

### 3. 底部导航（`components/ui/BottomNav.tsx`）

- 删除 `{ label: t('common.contacts'), icon: Users, href: '/contacts' }` 项
- 第一项 label 改为 `t('common.contacts')`，图标可从 MessageSquare 换成 Users
  （语义更准；不换也行，属于视觉偏好）
- href 保持 `/messages` 不变 —— 不改路由，避免连锁影响

### 4. 删除联系人页

- 删除 `app/(main)/contacts/` 目录
- 全局搜索 `/contacts` 引用（跳转、测试、文档）并清理

### 5. 决策点：删除联系人的能力放哪

联系人页删掉后，「删除联系人」目前没有入口。两个方案：

- **方案 A（推荐）**：首页列表项加滑动删除（`SwipeableListItem` +
  `ConfirmDialog`，组件都现成），滑动删除 = 移除联系人及其会话
- 方案 B：暂不提供删除入口（加错了只能留在列表里）

### 6. i18n

- `public/locales/en.json` / `zh.json`：确认 `common.contacts` 文案合适；
  首页空态、弹窗相关 key 沿用 `contacts.*` 不动

### 7. 测试

- `pnpm check` + `pnpm test`
- 检查 `tests/e2e/` 是否有走 `/contacts` 或 4-Tab 导航的用例，同步更新
- 手动验证：3 个 Tab 切换、首页加联系人全流程、滑动删除（如选方案 A）、
  深/浅主题

## 明确不做

- 不改 `/messages` 路由路径（仅改文案，零路由风险）
- 不做消息/联系人搜索（隐私聊天定位，用户明确不要）
- 不动聊天窗口页（`chat-view.tsx`）
- 联系人搜索框不迁移（随 `/contacts` 一起删）
