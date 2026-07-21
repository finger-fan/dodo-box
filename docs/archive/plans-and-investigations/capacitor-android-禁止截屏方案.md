# Capacitor Android 应用「指定页面禁止截屏」方案

## 一、原理说明

Android 原生截屏拦截依赖 `Window` 的一个标志位：

```java
window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
```

设置了 `FLAG_SECURE` 之后：
- 系统截屏 / 第三方录屏工具会拿到黑屏或空白
- App 切换器（最近任务列表）里该 Activity 的预览也是黑的
- 投屏 / 非安全外接显示器上内容也会被屏蔽

清除该 flag 即可恢复正常。

由于 Capacitor App 本质上是**一个 Activity + 一个 WebView**（承载你的 H5 SPA），"某些页面禁止截屏"并不是原生多 Activity 的概念，而是：**在 H5 路由切换到敏感页面时，通过 JS 调用 Capacitor 插件，动态给当前唯一的 Activity 加/去掉 `FLAG_SECURE`**。

---

## 二、推荐方案：官方 `@capacitor/privacy-screen` 插件

Capacitor 官方（ionic-team）已经收编了原先社区版 `@capacitor-community/privacy-screen`，发布了正式的 `@capacitor/privacy-screen`，内部就是基于 `FLAG_SECURE` 实现，并且**明确支持"按页面 enable/disable"**的用法，不需要自己写原生代码，优先用这个。

### 1. 安装

```bash
npm install @capacitor/privacy-screen
npx cap sync android
```

### 2. （可选）全局默认配置

如果大部分页面不需要保护、只有个别敏感页要开，`capacitor.config.ts` 里可以不写默认开启，走手动调用即可：

```ts
// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  plugins: {
    PrivacyScreen: {
      // 不设为 true，默认不开启，由具体页面自行 enable/disable
      enable: false,
    },
  },
};

export default config;
```

### 3. 业务代码中按页面开关

以 Vue Router 为例（React Router / 原生路由监听思路一致）：

```ts
import { PrivacyScreen } from '@capacitor/privacy-screen';

// 需要保护的页面路由 name 或 path 列表
const SECURE_ROUTES = ['BankCard', 'IDCardUpload', 'Payment'];

router.afterEach((to) => {
  if (SECURE_ROUTES.includes(to.name as string)) {
    PrivacyScreen.enable({
      android: {
        dimBackground: true, // 切到后台/最近任务时额外遮罩，可选
      },
    });
  } else {
    PrivacyScreen.disable();
  }
});
```

或者更细粒度地在具体页面组件里控制：

```ts
// SecurePage.vue
import { onMounted, onUnmounted } from 'vue';
import { PrivacyScreen } from '@capacitor/privacy-screen';

onMounted(() => {
  PrivacyScreen.enable();
});

onUnmounted(() => {
  PrivacyScreen.disable();
});
```

### 4. 查询当前状态

```ts
const { enabled } = await PrivacyScreen.isEnabled();
```

**优点**：零原生代码、官方维护、iOS 也有对应能力（进入后台时遮罩防止任务列表截图）、API 语义清晰。

---

## 三、备选方案：自己写一个极简原生插件

如果你不想引入依赖，或者想要更可控的实现（比如只想拦截截屏，不想要它连带处理的后台遮罩逻辑），可以自己写一个几十行的 Capacitor 原生插件，直接操作 `FLAG_SECURE`。

### 1. 创建插件文件

`android/app/src/main/java/你的包名/ScreenshotGuardPlugin.java`

```java
package com.yourcompany.yourapp;

import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenshotGuard")
public class ScreenshotGuardPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            );
        });
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().clearFlags(
                WindowManager.LayoutParams.FLAG_SECURE
            );
        });
        call.resolve();
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        int flags = getActivity().getWindow().getAttributes().flags;
        boolean secure = (flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
        JSObject ret = new JSObject();
        ret.put("value", secure);
        call.resolve(ret);
    }
}
```

### 2. 在 MainActivity 中注册

```java
// MainActivity.java
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(ScreenshotGuardPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

### 3. JS 侧调用

```ts
import { registerPlugin } from '@capacitor/core';

interface ScreenshotGuardPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
  isEnabled(): Promise<{ value: boolean }>;
}

const ScreenshotGuard = registerPlugin<ScreenshotGuardPlugin>('ScreenshotGuard');

// 进入敏感页
await ScreenshotGuard.enable();

// 离开敏感页
await ScreenshotGuard.disable();
```

改完后执行：

```bash
npx cap sync android
npx cap open android
```

**优点**：无第三方依赖、代码量小、行为完全可控。
**缺点**：iOS 端要自己再实现一遍（如果你的项目也发布 iOS 的话），官方插件已经帮你做好了双端。

---

## 四、两个方案怎么选

| | 官方 `@capacitor/privacy-screen` | 自定义原生插件 |
|---|---|---|
| 开发成本 | 低，装包即用 | 需要写 Java/Kotlin 原生代码 |
| iOS 支持 | 内置支持 | 需自己实现 |
| 维护成本 | 跟随官方升级 | 自己维护 |
| 灵活性 | 附带后台遮罩等能力，配置项较多 | 只做你要的事，逻辑最简单 |
| 适用场景 | 常规业务（支付、证件、银行卡等页面） | 有特殊定制需求，或不想引入依赖 |

**建议：优先用官方插件**，除非你有明确理由要自己控制原生逻辑。

---

## 五、注意事项

1. **单 Activity 架构**：Capacitor 默认是单 Activity + WebView 承载所有 H5 页面，所以"某页面禁止截屏"本质是"在该路由激活期间给整个 Activity 加 FLAG_SECURE"，无法做到"同一屏幕内一部分区域可截、一部分不可截"。如果页面里同时有敏感内容和非敏感内容需要分别处理，得在离开敏感区域时立刻 `disable()`。
2. **路由切换要成对调用**：一定要保证 `enable()` 和 `disable()` 成对触发，比如用 `onMounted/onUnmounted`、路由守卫的 `beforeEach/afterEach` 配合、或者用一个全局路由监听统一判断当前路由是否在保护名单里，避免因为快速切换导致 flag 没清除干净。
3. **模拟器/部分定制 ROM 表现不一致**：有些国产 ROM（小米/华为等）对 `FLAG_SECURE` 的截屏拦截和录屏拦截支持程度不同，建议用真机在目标机型上实测。
4. **无法防止物理拍照**：`FLAG_SECURE` 只能挡系统截屏/录屏/投屏，防不住用另一台设备拍照，这是所有方案的共同局限，如有更高安全要求需要配合水印等手段。
5. **Camera / 文件选择等插件可能受影响**：官方文档提到 `preventScreenshots`（旧版策略）可能与某些会临时隐藏 WebView 的插件（如 Camera）冲突，如果用到相机功能出现异常黑屏，检查是否是 privacy screen 冲突导致。

---

## 六、验证方法

1. 进入被保护页面后，用系统自带截屏快捷键（电源+音量下）截图，应提示"因应用限制，无法截取屏幕截图"或直接截得黑屏。
2. 打开"最近任务"切换器，该 App 卡片预览应为黑屏/纯色，而不是页面内容。
3. 离开该页面后，再次截屏应恢复正常。
