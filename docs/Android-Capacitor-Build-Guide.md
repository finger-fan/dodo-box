# Next.js + Capacitor Android 打包完整指南

> 基于 Capacitor 8 + Next.js 14 实际生产项目提炼，涵盖从零配置到签名发布的所有细节。

---

## 目录

1. [前置环境要求](#1-前置环境要求)
2. [项目初始化](#2-项目初始化)
3. [Capacitor 配置详解](#3-capacitor-配置详解)
4. [Android 项目结构全览](#4-android-项目结构全览)
5. [Gradle 构建配置](#5-gradle-构建配置)
6. [签名配置](#6-签名配置)
7. [AndroidManifest 与权限](#7-androidmanifest-与权限)
8. [资源文件（图标、启动页、字符串、样式）](#8-资源文件图标启动页字符串样式)
9. [原生 Activity 代码](#9-原生-activity-代码)
10. [Capacitor 插件集成](#10-capacitor-插件集成)
11. [NPM Scripts 配置](#11-npm-scripts-配置)
12. [构建流程（完整步骤）](#12-构建流程完整步骤)
13. [远端 URL 模式 vs 静态导出模式](#13-远端-url-模式-vs-静态导出模式)
14. [Next.js 配置注意事项](#14-nextjs-配置注意事项)
15. [多环境配置](#15-多环境配置)
16. [Docker 部署（远端模式服务端）](#16-docker-部署远端模式服务端)
17. [常见问题与排错](#17-常见问题与排错)
18. [检查清单](#18-检查清单)

---

## 1. 前置环境要求

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | 20+ | 推荐 20 LTS |
| pnpm | 8+ | 包管理器（npm/yarn 亦可） |
| Java JDK | **21** | 必须是 OpenJDK 21，Capacitor 8 要求 Java 21 编译 |
| Android Studio | 最新稳定版 | 提供 SDK、模拟器、构建工具 |
| Android SDK | compileSdk 35 | 通过 Android Studio SDK Manager 安装 |
| Gradle | 8.10.2 | 由 Gradle Wrapper 自动管理，无需手动安装 |

### Java 版本管理

在项目根目录创建 `.java-version` 文件：

```
openjdk64-21.0.4
```

如果使用 SDKMAN 或 jEnv 管理 Java 版本：

```bash
# SDKMAN
sdk install java 21.0.4-open
sdk use java 21.0.4-open

# jEnv
jenv add /path/to/jdk-21
jenv local 21.0
```

### Android SDK 组件

通过 Android Studio > SDK Manager 确保已安装：
- Android SDK Platform 35 (Android 15)
- Android SDK Build-Tools (最新)
- Android SDK Command-line Tools
- Android Emulator（可选，用于模拟器测试）

---

## 2. 项目初始化

### 2.1 安装 Capacitor 依赖

```bash
# 核心依赖
pnpm add @capacitor/core@^8.0.0
pnpm add -D @capacitor/cli@^8.0.0

# Android 平台
pnpm add @capacitor/android@^8.0.0

# 常用插件（按需）
pnpm add @capacitor/app@^7.0.0        # App 生命周期
pnpm add @capacitor/status-bar@^7.0.0  # 状态栏控制
pnpm add @capacitor/camera@^8.0.0      # 相机
pnpm add @capacitor/filesystem@^8.0.0  # 文件系统
```

### 2.2 初始化 Capacitor

```bash
npx cap init "你的应用名" "com.yourcompany.appname"
```

这会在项目根目录创建 `capacitor.config.ts`。

### 2.3 添加 Android 平台

```bash
npx cap add android
```

这会在项目根目录创建 `android/` 目录，包含完整的 Android 项目。

---

## 3. Capacitor 配置详解

### `capacitor.config.ts`

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // 应用唯一标识符，必须与 Android build.gradle 中的 applicationId 一致
  appId: 'com.yourcompany.appname',

  // 应用显示名称
  appName: 'Your App Name',

  // Web 构建输出目录
  // 静态导出模式：设为 Next.js 导出目录（如 'out'）
  // 远端 URL 模式：仍需设置，但内容不重要（目录必须存在）
  webDir: 'out',

  server: {
    // 远端 URL 模式：App 直接加载远程服务器内容
    // 静态导出模式：注释掉此行
    url: 'https://your-domain.com',

    // 允许 HTTP 明文流量（开发时可能需要）
    cleartext: true,
  },

  android: {
    // 允许 HTTPS 和 HTTP 混合内容
    allowMixedContent: true,
  },

  ios: {
    // iOS 特定配置（如果也需要 iOS）
    backgroundColor: '#f8f5f0',
  },
};

export default config;
```

### 关键配置说明

| 配置项 | 作用 | 注意事项 |
|--------|------|---------|
| `appId` | Android 包名，全局唯一 | 发布后不可更改，格式：`com.company.app` |
| `appName` | 应用名 | 可随时修改 |
| `webDir` | Web 资源目录 | 远端模式下仍需存在（可为空目录） |
| `server.url` | 远端服务器地址 | 仅远端 URL 模式需要 |
| `server.cleartext` | 允许 HTTP | 生产环境应使用 HTTPS |
| `android.allowMixedContent` | 混合内容 | WebView 加载 HTTPS 页面中的 HTTP 资源 |

---

## 4. Android 项目结构全览

执行 `npx cap add android` 后生成的完整目录结构：

```
android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/yourcompany/appname/
│   │   │   │   └── MainActivity.java          # 主 Activity
│   │   │   ├── res/
│   │   │   │   ├── drawable/
│   │   │   │   │   ├── splash.xml              # 启动画面布局
│   │   │   │   │   └── splash_logo.png         # 启动画面 Logo
│   │   │   │   ├── layout/
│   │   │   │   │   └── activity_main.xml       # 主布局（WebView）
│   │   │   │   ├── mipmap-mdpi/                # 48x48 图标
│   │   │   │   │   ├── ic_launcher.png
│   │   │   │   │   └── ic_launcher_round.png
│   │   │   │   ├── mipmap-hdpi/                # 72x72 图标
│   │   │   │   ├── mipmap-xhdpi/               # 96x96 图标
│   │   │   │   ├── mipmap-xxhdpi/              # 144x144 图标
│   │   │   │   ├── mipmap-xxxhdpi/             # 192x192 图标
│   │   │   │   ├── values/
│   │   │   │   │   ├── strings.xml             # 应用名称等字符串
│   │   │   │   │   ├── styles.xml              # 主题样式
│   │   │   │   │   └── colors.xml              # 颜色定义（如有）
│   │   │   │   └── xml/
│   │   │   │       └── file_paths.xml          # FileProvider 路径配置
│   │   │   ├── assets/                         # Web 资源（cap sync 写入）
│   │   │   └── AndroidManifest.xml             # 应用清单
│   │   ├── test/                               # 单元测试
│   │   └── androidTest/                        # 集成测试
│   ├── build.gradle                            # App 模块构建配置
│   ├── capacitor.build.gradle                  # Capacitor 自动生成的依赖
│   └── proguard-rules.pro                      # ProGuard 混淆规则
│
├── build.gradle                                # 根构建配置
├── settings.gradle                             # 项目模块声明
├── capacitor.settings.gradle                   # Capacitor 自动生成的模块路径
├── variables.gradle                            # SDK 版本和依赖版本变量
├── gradle.properties                           # Gradle 全局属性
├── gradlew                                     # Gradle Wrapper 脚本 (Linux/Mac)
├── gradlew.bat                                 # Gradle Wrapper 脚本 (Windows)
├── gradle/
│   └── wrapper/
│       ├── gradle-wrapper.jar
│       └── gradle-wrapper.properties           # Gradle 版本配置
│
├── sign-key/                                   # 签名密钥（自行创建）
│   └── release                                 # keystore 文件
│
└── capacitor-cordova-android-plugins/          # Cordova 兼容插件（自动生成）
```

### 重要：自动生成 vs 手动维护

| 文件 | 生成方式 | 是否需要手动修改 |
|------|---------|----------------|
| `capacitor.settings.gradle` | `cap sync` 自动生成 | 否，每次 sync 会覆盖 |
| `capacitor.build.gradle` | `cap sync` 自动生成 | 否，每次 sync 会覆盖 |
| `capacitor-cordova-android-plugins/` | `cap sync` 自动生成 | 否 |
| `build.gradle` (根) | 初始生成 | 是，升级 Gradle 插件版本等 |
| `app/build.gradle` | 初始生成 | 是，签名、版本号等 |
| `variables.gradle` | 初始生成 | 是，SDK 版本升级 |
| `AndroidManifest.xml` | 初始生成 | 是，权限、Activity 配置 |
| `res/` 下所有资源 | 初始生成 | 是，替换图标、启动页等 |

---

## 5. Gradle 构建配置

### 5.1 根 `build.gradle`

```gradle
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        // Android Gradle Plugin - 必须与 Gradle 版本匹配
        classpath 'com.android.tools.build:gradle:8.8.0'

        // Google Services（如需 Firebase 推送等）
        classpath 'com.google.gms:google-services:4.4.4'
    }
}

// 引入版本变量定义
apply from: "variables.gradle"

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

task clean(type: Delete) {
    delete rootProject.buildDir
}
```

### 5.2 `variables.gradle` - 版本集中管理

```gradle
ext {
    // SDK 版本
    minSdkVersion = 24              // Android 7.0 最低支持
    compileSdkVersion = 35          // Android 15 编译
    targetSdkVersion = 35           // Android 15 目标

    // AndroidX 依赖版本
    androidxActivityVersion = '1.10.0'
    androidxAppCompatVersion = '1.7.1'
    androidxCoordinatorLayoutVersion = '1.3.0'
    androidxCoreVersion = '1.13.1'
    androidxFragmentVersion = '1.8.9'
    coreSplashScreenVersion = '1.2.0'
    androidxWebkitVersion = '1.14.0'

    // 测试依赖版本
    junitVersion = '4.13.2'
    androidxJunitVersion = '1.3.0'
    androidxEspressoCoreVersion = '3.7.0'

    // Cordova 兼容版本
    cordovaAndroidVersion = '14.0.1'
}
```

### 5.3 `app/build.gradle` - 应用模块配置

```gradle
apply plugin: 'com.android.application'

android {
    // 命名空间（Capacitor 8 / AGP 8+ 必需）
    namespace = "com.yourcompany.appname"

    compileSdk = rootProject.ext.compileSdkVersion

    defaultConfig {
        applicationId "com.yourcompany.appname"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion

        // 版本号管理
        versionCode 1          // 整数，每次发布递增
        versionName "1.0.0"    // 用户可见版本号

        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"

        // 忽略无关资源文件
        aaptOptions {
            ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }

    // 签名配置（见第 6 节）
    signingConfigs {
        release {
            storeFile file("../sign-key/release")
            keyAlias "release"
            keyPassword "your-key-password"
            storePassword "your-store-password"
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false    // 是否启用代码混淆
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }

    // 自定义 APK 输出文件名
    applicationVariants.all { variant ->
        variant.outputs.all {
            outputFileName = "${variant.applicationId}-${variant.versionName}-${variant.versionCode}.apk"
        }
    }
}

// 本地 libs 目录
repositories {
    flatDir {
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
    implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
    implementation project(':capacitor-android')

    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
    androidTestImplementation "androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion"

    implementation project(':capacitor-cordova-android-plugins')
}

// 引入 Capacitor 自动生成的构建配置
apply from: 'capacitor.build.gradle'

// Google Services 插件（可选，需要 google-services.json）
try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied.")
}
```

### 5.4 `capacitor.build.gradle` - 自动生成的依赖

> 此文件由 `cap sync` 自动生成，**不要手动修改**。

```gradle
android {
    compileOptions {
        // Capacitor 8 要求 Java 21
        sourceCompatibility JavaVersion.VERSION_21
        targetCompatibility JavaVersion.VERSION_21
    }
}

apply from: "../capacitor-cordova-android-plugins/cordova.variables.gradle"

dependencies {
    // 根据安装的 Capacitor 插件自动添加
    implementation project(':capacitor-app')
    implementation project(':capacitor-camera')
    implementation project(':capacitor-filesystem')
    implementation project(':capacitor-status-bar')
}

if (hasProperty('postBuildExtras')) {
    postBuildExtras()
}
```

### 5.5 `settings.gradle`

```gradle
include ':app'
include ':capacitor-cordova-android-plugins'
project(':capacitor-cordova-android-plugins').projectDir = new File('./capacitor-cordova-android-plugins/')

// 引入 Capacitor 自动生成的模块路径
apply from: 'capacitor.settings.gradle'
```

### 5.6 `gradle.properties`

```properties
# JVM 堆内存大小（构建大项目时可能需要增大）
org.gradle.jvmargs=-Xmx1536m

# 使用 AndroidX（必须为 true）
android.useAndroidX=true
```

### 5.7 `gradle-wrapper.properties`

```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.10.2-all.zip
networkTimeout=10000
validateDistributionUrl=true
```

### 版本兼容对照表

| Gradle 版本 | AGP (Android Gradle Plugin) 版本 | 最低 JDK |
|-------------|----------------------------------|----------|
| 8.10.x | 8.8.x | JDK 17+ |
| 8.9.x | 8.7.x | JDK 17+ |
| 8.4+ | 8.3+ | JDK 17+ |

> Capacitor 8 的 `capacitor.build.gradle` 设置了 `JavaVersion.VERSION_21`，因此实际需要 JDK 21。

---

## 6. 签名配置

### 6.1 创建 Keystore

```bash
# 在 android/ 目录下创建 sign-key 目录
mkdir -p android/sign-key

# 生成 keystore
keytool -genkey -v \
  -keystore android/sign-key/release \
  -alias release \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass "your-store-password" \
  -keypass "your-key-password" \
  -dname "CN=Your Name, OU=Your Org, O=Your Company, L=City, ST=State, C=CN"
```

### 6.2 在 `app/build.gradle` 中配置签名

```gradle
android {
    signingConfigs {
        release {
            storeFile file("../sign-key/release")  // 相对于 app/ 目录
            keyAlias "release"
            keyPassword "your-key-password"
            storePassword "your-store-password"
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 6.3 安全注意事项

- **Keystore 文件绝对不要提交到 Git**（加入 `.gitignore`）
- 密码不要硬编码在 `build.gradle` 中，生产环境应使用环境变量：

```gradle
// 更安全的方式：从环境变量或 local.properties 读取
signingConfigs {
    release {
        storeFile file(System.getenv("ANDROID_KEYSTORE_PATH") ?: "../sign-key/release")
        keyAlias System.getenv("ANDROID_KEY_ALIAS") ?: "release"
        keyPassword System.getenv("ANDROID_KEY_PASSWORD") ?: ""
        storePassword System.getenv("ANDROID_STORE_PASSWORD") ?: ""
    }
}
```

- Keystore 丢失 = 无法更新已发布的应用，**务必备份**

---

## 7. AndroidManifest 与权限

### `android/app/src/main/AndroidManifest.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- FileProvider - 相机插件需要 -->
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>

    <!-- 基础权限 -->
    <uses-permission android:name="android.permission.INTERNET" />

    <!-- 相机权限（使用 @capacitor/camera 时需要） -->
    <uses-permission android:name="android.permission.CAMERA" />

    <!-- 其他常用权限（按需添加） -->
    <!-- <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" /> -->
    <!-- <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" /> -->
    <!-- <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" /> -->
    <!-- <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" /> -->
    <!-- <uses-permission android:name="android.permission.RECORD_AUDIO" /> -->
</manifest>
```

### 关键配置说明

| 属性 | 说明 |
|------|------|
| `android:launchMode="singleTask"` | 防止重复创建 Activity |
| `android:configChanges="..."` | 配置变化时不重建 Activity（避免 WebView 重载） |
| `android:exported="true"` | Android 12+ 必须显式声明 |
| `FileProvider` | 相机插件拍照存储需要 |

### `xml/file_paths.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <cache-path name="my_cache_images" path="." />
</paths>
```

---

## 8. 资源文件（图标、启动页、字符串、样式）

### 8.1 应用图标

需要为不同屏幕密度提供不同尺寸的图标：

| 目录 | 尺寸 | DPI |
|------|------|-----|
| `mipmap-mdpi/` | 48x48 | 160 |
| `mipmap-hdpi/` | 72x72 | 240 |
| `mipmap-xhdpi/` | 96x96 | 320 |
| `mipmap-xxhdpi/` | 144x144 | 480 |
| `mipmap-xxxhdpi/` | 192x192 | 640 |

每个目录下放两个文件：
- `ic_launcher.png` - 方形图标
- `ic_launcher_round.png` - 圆形图标

> 推荐使用 Android Studio 的 **Image Asset Studio** (右键 res > New > Image Asset) 自动生成所有尺寸。

在 `AndroidManifest.xml` 中引用：

```xml
android:icon="@mipmap/ic_launcher"
android:roundIcon="@mipmap/ic_launcher_round"
```

### 8.2 启动画面 (Splash Screen)

#### `res/drawable/splash.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- 背景颜色 -->
    <item android:drawable="@android:color/white"/>
    <!-- 居中 Logo -->
    <item>
        <bitmap
            android:src="@drawable/splash_logo"
            android:gravity="center"/>
    </item>
</layer-list>
```

#### `res/drawable/splash_logo.png`

放置启动画面 Logo 图片（建议 288x288 左右，PNG 格式）。

#### 在 `styles.xml` 中引用

```xml
<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
    <item name="android:background">@drawable/splash</item>
</style>
```

### 8.3 字符串资源

#### `res/values/strings.xml`

```xml
<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">你的应用名</string>
    <string name="title_activity_main">你的应用名</string>
    <string name="package_name">com.yourcompany.appname</string>
    <string name="custom_url_scheme">com.yourcompany.appname</string>
</resources>
```

### 8.4 主题样式

#### `res/values/styles.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- 基础主题 -->
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <!-- 无 ActionBar 主题（应用运行时） -->
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
    </style>

    <!-- 启动画面主题 -->
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
```

### 8.5 布局文件

#### `res/layout/activity_main.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<androidx.coordinatorlayout.widget.CoordinatorLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    tools:context=".MainActivity">

    <WebView
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

</androidx.coordinatorlayout.widget.CoordinatorLayout>
```

---

## 9. 原生 Activity 代码

### `MainActivity.java`

```java
package com.yourcompany.appname;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // 默认情况下无需添加任何代码
    // BridgeActivity 已处理 WebView 初始化、插件加载等
    // 如需自定义原生功能，可在此覆写方法
}
```

路径：`android/app/src/main/java/com/yourcompany/appname/MainActivity.java`

> 包路径必须与 `applicationId` 对应：`com.yourcompany.appname` → `com/yourcompany/appname/`

---

## 10. Capacitor 插件集成

### 安装插件

```bash
# 安装插件到 Node.js 项目
pnpm add @capacitor/app @capacitor/camera @capacitor/status-bar @capacitor/filesystem

# 同步到 Android 项目（自动更新 capacitor.settings.gradle 和 capacitor.build.gradle）
npx cap sync
```

### `cap sync` 做了什么

1. 将 `webDir` 目录的内容复制到 `android/app/src/main/assets/public/`
2. 更新 `android/capacitor.settings.gradle` - 添加插件模块路径
3. 更新 `android/app/capacitor.build.gradle` - 添加插件依赖
4. 更新 `android/capacitor-cordova-android-plugins/` - Cordova 兼容层

### 自动生成的 `capacitor.settings.gradle` 示例

```gradle
// DO NOT EDIT - GENERATED EACH TIME "capacitor update" IS RUN
include ':capacitor-android'
project(':capacitor-android').projectDir = new File('../node_modules/.pnpm/@capacitor+android@8.0.0_@capacitor+core@8.0.0/node_modules/@capacitor/android/capacitor')

include ':capacitor-app'
project(':capacitor-app').projectDir = new File('../node_modules/.pnpm/@capacitor+app@7.1.1_@capacitor+core@8.0.0/node_modules/@capacitor/app/android')

include ':capacitor-camera'
project(':capacitor-camera').projectDir = new File('../node_modules/.pnpm/@capacitor+camera@8.0.0_@capacitor+core@8.0.0/node_modules/@capacitor/camera/android')

include ':capacitor-filesystem'
project(':capacitor-filesystem').projectDir = new File('../node_modules/.pnpm/@capacitor+filesystem@8.1.0_@capacitor+core@8.0.0/node_modules/@capacitor/filesystem/android')

include ':capacitor-status-bar'
project(':capacitor-status-bar').projectDir = new File('../node_modules/.pnpm/@capacitor+status-bar@7.0.4_@capacitor+core@8.0.0/node_modules/@capacitor/status-bar/android')
```

> 注意：使用 pnpm 时路径包含 `.pnpm/` 目录结构，这是正常的。

---

## 11. NPM Scripts 配置

在 `package.json` 中添加便捷脚本：

```json
{
  "scripts": {
    "cap:sync": "npx cap sync",
    "cap:open:android": "npx cap open android",
    "cap:run:android": "npx cap run android",
    "android:clean": "cd android && ./gradlew clean",
    "android:build:release": "pnpm cap:sync && cd android && ./gradlew assembleRelease",
    "android:build:debug": "pnpm cap:sync && cd android && ./gradlew assembleDebug"
  }
}
```

### 各命令说明

| 命令 | 作用 |
|------|------|
| `cap:sync` | 同步 Web 资源和插件到 Android 项目 |
| `cap:open:android` | 用 Android Studio 打开 Android 项目 |
| `cap:run:android` | 在连接的设备或模拟器上运行 |
| `android:clean` | 清理 Gradle 构建缓存 |
| `android:build:release` | 同步 + 构建签名 Release APK |
| `android:build:debug` | 同步 + 构建 Debug APK |

---

## 12. 构建流程（完整步骤）

### 首次构建

```bash
# 1. 安装所有依赖
pnpm install

# 2. 构建 Next.js 应用（根据你的环境选择）
pnpm build:production    # 或 pnpm build:local

# 3. 确保 webDir 目录存在（远端 URL 模式下）
mkdir -p out

# 4. 同步到 Android
pnpm cap:sync

# 5. 用 Android Studio 打开项目检查
pnpm cap:open:android

# 6. 或者直接构建 Release APK
cd android && ./gradlew assembleRelease
```

### 日常构建

```bash
# 一条命令完成：同步 + 构建 Release
pnpm android:build:release
```

### APK 输出位置

```
android/app/build/outputs/apk/release/com.yourcompany.appname-1.0.0-1.apk
```

文件名格式由 `build.gradle` 中的 `outputFileName` 配置决定：
`${applicationId}-${versionName}-${versionCode}.apk`

### 构建 AAB（上架 Google Play 需要）

```bash
cd android && ./gradlew bundleRelease
```

输出位置：`android/app/build/outputs/bundle/release/app-release.aab`

---

## 13. 远端 URL 模式 vs 静态导出模式

### 远端 URL 模式（本项目采用）

```typescript
// capacitor.config.ts
server: {
    url: 'https://your-domain.com',
    cleartext: true,
}
```

| 优点 | 缺点 |
|------|------|
| 更新 Web 内容无需重新发布 APK | 必须联网才能使用 |
| 支持 Next.js SSR/SSG 全部功能 | 依赖服务器可用性 |
| 版本管理简单 | 首次加载较慢 |
| 可以使用 API Routes | 需要部署和维护 Web 服务器 |

### 静态导出模式

```typescript
// capacitor.config.ts
// 不设置 server.url
webDir: 'out',  // Next.js 静态导出目录
```

```javascript
// next.config.js
const nextConfig = {
    output: 'export',  // 启用静态导出
    images: {
        unoptimized: true,  // 静态导出不支持图片优化
    },
};
```

| 优点 | 缺点 |
|------|------|
| 离线可用 | 更新需重新发布 APK |
| 无需服务器 | 不支持 API Routes |
| 加载速度快 | 不支持 SSR |
| 分发简单 | 不支持 Next.js Image 优化 |

### 选择建议

- **远端 URL 模式**：适合需要频繁更新、有后端 API、需要 SSR 的应用
- **静态导出模式**：适合内容相对固定、需要离线使用、无后端的应用

---

## 14. Next.js 配置注意事项

### `next.config.js`

```javascript
const nextConfig = {
    reactStrictMode: true,

    // 图片域名白名单（远端模式加载外部图片）
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '*.myqcloud.com',  // 你的 CDN/对象存储域名
                pathname: '/**',
            },
        ],
    },

    // TypeScript 严格检查
    typescript: {
        ignoreBuildErrors: false,
    },

    // ESLint（构建时可选跳过以加速）
    eslint: {
        ignoreDuringBuilds: true,
    },

    // Server Actions 请求体大小限制
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
        },
    },
};

module.exports = nextConfig;
```

### 静态导出模式特殊配置

如果选择静态导出模式，需额外配置：

```javascript
const nextConfig = {
    output: 'export',           // 启用静态导出
    images: {
        unoptimized: true,       // 必须，静态模式不支持图片优化
    },
    trailingSlash: true,         // 推荐，确保路由正确
};
```

---

## 15. 多环境配置

### 环境文件结构

```
.env-local        # 本地开发环境
.env-production    # 生产环境
.env-remote        # 远程测试环境
.env.example       # 环境变量模板
```

### NPM Scripts（多环境）

```json
{
  "scripts": {
    "dev:local": "dotenv -e .env-local next dev",
    "dev:production": "dotenv -e .env-production next dev",
    "dev:remote": "dotenv -e .env-remote next dev",
    "build:local": "cross-env NODE_ENV=production dotenv -e .env-local next build",
    "build:production": "cross-env NODE_ENV=production dotenv -e .env-production next build",
    "build:remote": "cross-env NODE_ENV=production dotenv -e .env-remote next build",
    "start:local": "dotenv -e .env-local next start",
    "start:production": "dotenv -e .env-production next start",
    "start:remote": "dotenv -e .env-remote next start"
  }
}
```

需要安装辅助包：

```bash
pnpm add -D cross-env dotenv-cli
```

### YAML 配置系统（可选但推荐）

使用 `application.yaml` 统一管理配置，通过 `PROFILE` 环境变量切换：

```yaml
_default:
  app:
    version: "1.0.0"
    build: "1"

local:
  database:
    host: "${DB_HOST:-127.0.0.1}"
  app:
    apiBaseUrl: "http://localhost:3000"

production:
  database:
    host: "${DB_HOST}"
  app:
    apiBaseUrl: "https://your-domain.com"
```

---

## 16. Docker 部署（远端模式服务端）

远端 URL 模式下，你需要部署 Next.js 服务端：

### Dockerfile

```dockerfile
# Stage 1: 构建
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: 运行
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN npm install -g pnpm

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/application.yaml ./application.yaml
COPY --from=builder /app/.next ./.next

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --prod --frozen-lockfile

EXPOSE 3000
CMD ["pnpm", "start"]
```

### .dockerignore

```
node_modules
.next
out
build
dist
.env*
android/**
.git
*.md
```

---

## 17. 常见问题与排错

### Q1: `cap sync` 报错找不到 webDir

```
[error] Capacitor could not find the web assets directory "out".
```

**解决**：创建 `out` 目录或确保 `webDir` 路径正确。

```bash
mkdir -p out
# 或先执行 Next.js 构建
pnpm build:production
```

### Q2: Gradle 构建失败 - Java 版本不对

```
Unsupported class file major version 65
```

**解决**：确保使用 JDK 21。

```bash
java -version  # 确认版本
# 如果不对，安装并切换到 JDK 21
```

### Q3: pnpm + Capacitor 路径问题

pnpm 的 `node_modules/.pnpm/` 结构可能导致 Capacitor 找不到插件。

**解决**：确保执行 `cap sync` 后检查 `capacitor.settings.gradle` 中的路径是否正确指向 `.pnpm/` 下的实际目录。

### Q4: APK 安装后白屏

- **远端模式**：检查 `server.url` 是否可访问，手机网络是否正常
- **静态模式**：检查 `webDir` 中是否有正确的构建产物
- 检查 `AndroidManifest.xml` 是否有 `INTERNET` 权限

### Q5: 签名错误

```
Execution failed for task ':app:validateSigningRelease'.
```

**解决**：
1. 确认 keystore 文件路径正确（相对于 `android/app/` 目录）
2. 确认密码正确
3. 确认 key alias 正确

### Q6: 版本更新后无法覆盖安装

**原因**：`versionCode` 没有递增。

**解决**：每次发布必须增大 `versionCode`（整数值），`versionName` 可以自由设置。

### Q7: Android Studio 打开后 Gradle Sync 失败

**可能原因**：
1. Gradle 版本不匹配 - 检查 `gradle-wrapper.properties`
2. AGP 版本不匹配 - 检查根 `build.gradle` 的 classpath
3. 网络问题 - Gradle 需要下载依赖，确保能访问 `google()` 和 `mavenCentral()`

### Q8: `cap sync` 后插件没有被添加

**解决**：
```bash
# 清理后重新同步
rm -rf android/capacitor-cordova-android-plugins
npx cap sync android
```

### Q9: 远端模式下 Capacitor 插件不工作

远端 URL 模式下，Capacitor JS Bridge 需要通过 `<script>` 标签加载。确保你的 Web 应用中正确导入了 Capacitor：

```typescript
import { Capacitor } from '@capacitor/core';

// 检测是否在原生环境中运行
if (Capacitor.isNativePlatform()) {
    // 使用原生功能
}
```

### Q10: 构建时内存不足 (OOM)

**解决**：增大 Gradle JVM 内存：

```properties
# gradle.properties
org.gradle.jvmargs=-Xmx4096m
```

---

## 18. 检查清单

### 新项目首次配置

- [ ] 安装 Node.js 20+、JDK 21、Android Studio
- [ ] 通过 SDK Manager 安装 Android SDK Platform 35
- [ ] `pnpm add @capacitor/core @capacitor/android @capacitor/cli`
- [ ] `npx cap init` 初始化 Capacitor
- [ ] 编辑 `capacitor.config.ts` 设置 appId、appName、webDir
- [ ] `npx cap add android` 添加 Android 平台
- [ ] 替换应用图标（5 个密度的 mipmap 目录）
- [ ] 替换启动页 Logo（`res/drawable/splash_logo.png`）
- [ ] 修改 `res/values/strings.xml` 中的应用名称
- [ ] 修改 `app/build.gradle` 中的 applicationId、versionCode、versionName
- [ ] 创建签名 keystore 并配置到 `build.gradle`
- [ ] 在 `AndroidManifest.xml` 中添加所需权限
- [ ] `.java-version` 文件写入 `openjdk64-21.0.4`
- [ ] 在 `package.json` 中添加 Android 构建脚本

### 每次发布前

- [ ] 递增 `versionCode`
- [ ] 更新 `versionName`
- [ ] 确认 `capacitor.config.ts` 中的 `server.url` 正确（远端模式）
- [ ] 执行 `pnpm cap:sync`
- [ ] 执行 `./gradlew assembleRelease`
- [ ] 在真机上测试 APK
- [ ] 备份签名 keystore

### Git 忽略（添加到 `.gitignore`）

```gitignore
# Android 构建产物
android/app/build/
android/.gradle/
android/build/
android/local.properties

# 签名密钥（安全考虑）
android/sign-key/

# Capacitor 自动生成
android/app/src/main/assets/public/
```

---

## 附录：完整依赖清单

```json
{
  "dependencies": {
    "@capacitor/android": "^8.0.0",
    "@capacitor/app": "^7.0.0",
    "@capacitor/camera": "^8.0.0",
    "@capacitor/core": "^8.0.0",
    "@capacitor/filesystem": "^8.0.0",
    "@capacitor/status-bar": "^7.0.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^8.0.0",
    "cross-env": "^7.0.0",
    "dotenv-cli": "^7.0.0"
  }
}
```

---

> 本文档基于 Capacitor 8.0 + Next.js 14 + Gradle 8.10 + AGP 8.8 + JDK 21 编写。
> 版本迭代时请注意各工具链的兼容性变化。
