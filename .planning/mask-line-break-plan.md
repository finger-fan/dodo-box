# 遮罩折行问题修复方案

## 问题

聊天消息启用「阅后遮罩」后，遮罩文本与原文折行位置不一致，导致气泡高度/行数在明文 ↔ 遮罩切换时跳动。

- 中文、韩文：基本正常（单码点 ≈ 单视觉字符）。
- 藏文：一个视觉字符由多个 Unicode 码点组合而成，遮罩后字符数量膨胀，折行点偏移明显。

## 诉求（与产品确认后）

1. **矩形宽度固定**：由原文渲染决定气泡宽度。
2. **行数固定**：原文有几行，遮罩就占几行。
3. **允许溢出截断**：每行内部遮罩字符超出时直接 `overflow: hidden`，不换行。
4. **不改动语义层**：`lib/message-mask.ts` 只负责生成无意义遮罩串，分行是视觉布局问题，不在库层处理。

## 方案：透明原文占位 + 遮罩层覆盖

核心思路：用**原文透明占位**撑出矩形框（宽度和高度），再用一个**绝对定位的遮罩层**覆盖在上面。遮罩层宽度/高度与占位层完全一致，超出部分隐藏。

```
┌─────────────────────────────┐
│ 原文（透明，仅占位）          │  ← 决定气泡宽度和行数
│                             │
├─────────────────────────────┤
│ 遮罩字符░░░░░░░░░░░           │  ← 绝对定位覆盖，overflow:hidden
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░  │
└─────────────────────────────┘
```

### 具体改动

#### 1. `components/chat/MaskedText.tsx`

当前实现是一个 `<span>` 内直接切换 `{text}` / `{masked}`。改为：

```tsx
<span
  onClick={handleClick}
  role="button"
  tabIndex={0}
  // ... 其他交互属性不变
  className="cursor-pointer"
>
  {revealed ? (
    // 未遮罩：直接正常渲染原文，无透明层、无覆盖层，保证语义/选择/复制正常
    <span className="whitespace-pre-wrap break-words">{text}</span>
  ) : (
    // 遮罩：原文透明占位 + 遮罩层绝对定位覆盖
    <span className="relative inline-block">
      <span className="whitespace-pre-wrap break-words select-none text-transparent">
        {text}
      </span>
      <span className="absolute inset-0 whitespace-pre-wrap break-words overflow-hidden select-none">
        {masked}
      </span>
    </span>
  )}
</span>
```

要点：
- **未遮罩时**：只渲染一层原文，和原来语义完全一致，不影响选择、复制、无障碍。
- **遮罩时**：外层 `relative inline-block`，给绝对定位子元素提供定位上下文。
- 底层原文 `text-transparent` + `select-none`，**仍在文档流中**，因此真实宽度和高度由原文决定。
- 上层 `absolute inset-0`，宽/高与底层完全一致；`overflow: hidden` 保证超出的遮罩字符被截断。
- 点击切换仍绑定在最外层元素上。

> 不需要 JS 函数去“分行”。CSS 布局本身会让遮罩文本在同样宽度的框里折行，行高由底层原文决定，多余的行被 `overflow: hidden` 截掉。

#### 2. `app/(main)/chat/chat-view.tsx`

当前气泡加了 `font-mono`：

```tsx
"bubble px-3 py-2 rounded-2xl text-sm shadow-sm font-mono"
```

这个类对藏文无效（系统会回退到藏文字体），且会让中文/英文显示变丑。改为去掉 `font-mono`：

```tsx
"bubble px-3 py-2 rounded-2xl text-sm shadow-sm"
```

#### 3. 不改动

- `lib/message-mask.ts`：保持现有按码点生成遮罩串的逻辑不变。
- 不新增任何“语义分行”函数。

## 测试策略

1. **单元测试**：`message-mask.test.ts` 已有用例，因库层无变更，无需新增。
2. **类型检查 + lint**：`pnpm check`。
3. **单元/集成测试**：`pnpm test`。
4. **真机验证**：在 Android 真机上用藏文、中文、韩文、英文长文本分别测试明文/遮罩切换，确认气泡高度不跳、宽度不变。

## 风险

- 遮罩字符平均宽度若大于原文，可见遮罩可能只显示每行左侧一部分，右侧被截断。产品方已接受此 trade-off。
- 若遮罩字符行高与原文行高差异较大，可能出现每行文字上下轻微不齐。可通过显式设置 `line-height` 缓解（与 bubble 现有行高一致即可）。
