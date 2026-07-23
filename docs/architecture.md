# dodo-box 软件架构文档

> 生成日期: 2026-04-28
> 版本: v0.8.8

---

## 1. 这个软件是干什么的？

**dodo-box** 是一个基于 **Nostr 协议** 的 **隐私优先多账户消息应用**。

### 核心理念

| 特性 | 说明 |
|------|------|
| **去中心化** | 不依赖任何中心化服务器，消息通过 Nostr relay 网络传递 |
| **隐私优先** | 所有消息使用 NIP-59 Gift Wrap 加密，中继无法知道谁在和谁聊天 |
| **多身份** | 一个账户可以创建多个 Nostr 身份（马甲），互不关联 |
| **无密码记忆** | 用用户名+密码派生密钥，不需要记住私钥 |
| **跨平台** | Web 应用 + Capacitor 打包为 Android APK，支持 OTA 热更新 |

---

## 2. 整体架构图

```mermaid
graph TB
    subgraph User["👤 用户层"]
        Browser["浏览器 / Android App"]
    end

    subgraph Presentation["🎨 表现层 (Presentation)"]
        direction TB
        P1["📄 /login<br/>登录/注册"]
        P2["💬 /messages<br/>聊天列表"]
        P3["💬 /chat?peer=<br/>聊天会话"]
        P4["👥 /contacts<br/>联系人管理"]
        P5["🔍 /discover<br/>频道发现"]
        P6["⚙️ /settings<br/>身份/主题/中继"]

        subgraph UI["UI 组件"]
            BottomNav["BottomNav<br/>底部导航"]
            Toast["Toast<br/>消息提示"]
            Swipeable["SwipeableListItem<br/>滑动操作"]
            Confirm["ConfirmDialog<br/>确认对话框"]
        end
    end

    subgraph Context["🔗 上下文层 (Context)"]
        Providers["Providers<br/>ThemeProvider + i18n"]

        subgraph Core["★ NostrProvider 核心状态管理"]
            Session["session<br/>认证状态"]
            Adapter["adapter<br/>Nostr 适配器"]
            PrivKey["私钥内存引用<br/>永不持久化"]
            Ops["操作方法<br/>login/register/logout<br/>switchIdentity<br/>createIdentity"]
        end

        subgraph Hooks["数据 Hooks"]
            H1["use-chats"]
            H2["use-messages"]
            H3["use-contacts"]
        end
    end

    subgraph Business["⚙️ 业务逻辑层 (Business Logic)"]
        direction TB
        subgraph AdapterPattern["适配器模式"]
            Interface["📐 INostrAdapter<br/>统一接口"]
            Real["✅ RealNostrAdapter<br/>真实 Nostr"]
            Mock["🧪 MockTelegramAdapter<br/>模拟 Telegram"]
            Empty["⬜ EmptyNostrAdapter<br/>占位"]
        end

        subgraph Crypto["密钥与加密"]
            KeyDeriv["key-derivation<br/>SHA256 密钥派生"]
            VaultCrypto["vault-crypto<br/>AES-GCM 加密/解密"]
            VaultSync["vault-sync<br/>Vault 与 relay 同步"]
        end

        subgraph Helpers["辅助模块"]
            Events["events"]
            SeqCounter["seq-counter<br/>序列号管理"]
            GapDetect["gap-detection<br/>消息缺失检测"]
            ContactCache["contact-cache<br/>本地缓存"]
        end
    end

    subgraph Infra["🏗️ 基础设施层 (Infrastructure)"]
        direction TB
        subgraph Welshman["Welshman 引擎封装"]
            Engine["engine<br/>单例: Repository/Pool/Tracker"]
            RelayMgr["relay-manager<br/>多 relay 操作"]
            WelshCrypto["crypto<br/>事件签名/Gift Wrap"]
        end

        subgraph NostrLibs["Nostr 协议库"]
            Nip19["nostr-tools<br/>NIP-19 编解码"]
            NobleCurves["@noble/curves<br/>secp256k1 签名"]
            NobleHashes["@noble/hashes<br/>SHA256"]
        end

        subgraph RelayNet["Nostr Relay 网络"]
            R1["wss://relay.damus.io"]
            R2["wss://relay.nos.lol"]
            R3["... 更多 relay"]
        end
    end

    Browser --> Presentation
    Presentation --> Context
    Context --> Business
    Business --> Infra
    Infra --> RelayNet

    Interface --> Real
    Interface --> Mock
    Interface --> Empty

    Real --> Welshman
    Real --> NostrLibs
    Mock -.->|"API 调用"| RelayNet

    KeyDeriv --> VaultCrypto
    VaultCrypto --> VaultSync
    VaultSync --> Welshman

    Engine --> RelayMgr
    RelayMgr --> WelshCrypto
    WelshCrypto --> Nip19
    WelshCrypto --> NobleCurves
```

---

## 3. 分层详解

### 3.1 表现层 (Presentation)

```mermaid
graph LR
    subgraph Pages["页面路由"]
        Login["/login<br/>登录注册"]
        Messages["/(main)/messages<br/>聊天列表"]
        ChatDetail["/(main)/chat?peer=<br/>聊天会话"]
        Contacts["/(main)/contacts<br/>联系人管理"]
        Discover["/(main)/discover<br/>频道发现"]
        Settings["/(main)/settings<br/>设置"]
    end

    subgraph Layout["布局"]
        Root["app/layout.tsx<br/>根布局 + 字体 + 主题"]
        Main["app/(main)/layout.tsx<br/>认证守卫 + 底部导航"]
    end

    Root --> Login
    Root --> Main
    Main --> Messages
    Main --> ChatDetail
    Main --> Contacts
    Main --> Discover
    Main --> Settings
```

### 3.2 上下文层 (Context)

**NostrProvider** 是整个应用的核心状态管理器：

```mermaid
graph TB
    subgraph NostrProvider["NostrProvider"]
        direction TB
        subgraph State["状态"]
            Session["session<br/>isAuthenticated<br/>username<br/>currentPubkey<br/>vaultData"]
            AdapterState["adapter<br/>INostrAdapter 实例"]
            AdapterMode["adapterMode<br/>real / mock-telegram / empty"]
        end

        subgraph Memory["内存引用 (永不持久化!)"]
            MasterKey["masterPrivkeyRef"]
            IdentityKey["identityPrivkeyRef"]
        end

        subgraph Methods["操作方法"]
            Login["login(username, password)"]
            Register["register(username, password)"]
            Logout["logout()"]
            SwitchId["switchIdentity(pubkey)"]
            CreateId["createIdentity(name)"]
            DeleteId["deleteIdentity(pubkey)"]
            SwitchMode["setAdapterMode(mode)"]
        end
    end

    Login --> MasterKey
    Login --> AdapterState
    Register --> MasterKey
    SwitchId --> IdentityKey
    SwitchId --> AdapterState
    Logout --> MasterKey
    Logout --> IdentityKey
    Logout --> AdapterState
```

### 3.3 适配器模式 (Adapter Pattern)

```mermaid
graph LR
    subgraph Factory["createNostrAdapter(session)"]
        Mode{"adapterMode?"}
    end

    Mode -->|"real"| Real["RealNostrAdapter<br/>通过 Welshman 连接 Nostr relay<br/>Gift Wrap 加密消息"]
    Mode -->|"mock-telegram"| Mock["MockTelegramAdapter<br/>通过 Telegram Bot API 模拟<br/>用于开发/测试"]
    Mode -->|"empty"| Empty["EmptyNostrAdapter<br/>空实现占位"]

    subgraph Interface["统一接口 INostrAdapter"]
        I1["getChats()"]
        I2["getMessages()"]
        I3["sendMessage()"]
        I4["subscribeToMessages()"]
        I5["getContacts()"]
        I6["addContact()"]
        I7["getProfile()"]
        I8["updateProfile()"]
        I9["setRelays()"]
    end

    Real -.-> Interface
    Mock -.-> Interface
    Empty -.-> Interface
```

### 3.4 密钥体系

```mermaid
graph TB
    Input["用户名 + 密码"] -->|"SHA256"| MasterKey["Master Key<br/>主密钥 (确定性派生)"]

    MasterKey -->|"AES-GCM 加密/解密"| Vault["Encrypted Vault<br/>kind 31990 on Nostr relay"]

    Vault -->|"解密后"| VaultData["VaultData<br/>identities: [身份列表]"]

    subgraph Identities["身份列表"]
        Id1["身份1: { pubkey, encryptedSecret }"]
        Id2["身份2: { pubkey, encryptedSecret }"]
        Id3["身份3: { pubkey, encryptedSecret }"]
    end

    VaultData --> Identities

    MasterKey -->|"解密 encryptedSecret"| IdKey["Identity Private Key<br/>身份私钥 (内存中)"]
```

---

## 4. 关键数据流

### 4.1 登录流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant L as Login 页面
    participant NC as NostrProvider
    participant KD as key-derivation
    participant VS as vault-sync
    participant R as Nostr Relay
    participant VC as vault-crypto
    participant A as RealNostrAdapter

    U->>L: 输入用户名/密码
    L->>NC: login(username, password)
    NC->>KD: deriveMasterKey()
    KD-->>NC: MasterKey (publicKey + privateKey)
    NC->>VS: fetchVault(masterPublicKey, masterPrivateKey)
    VS->>R: 查询 kind 31990 事件
    R-->>VS: 返回加密 Vault 事件
    VS->>VC: decryptVault()
    VC-->>VS: VaultData (身份列表)
    VS-->>NC: 返回 VaultData
    NC->>VC: decryptSecret(masterKey, identity.encryptedSecret)
    VC-->>NC: 身份私钥 (存入内存)
    NC->>A: new RealNostrAdapter(session)
    NC-->>L: 登录成功
    L->>U: 跳转到聊天列表
```

### 4.2 消息发送流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant CV as ChatView
    participant A as RealNostrAdapter
    participant SC as seq-counter
    participant WE as welshman/crypto
    participant RM as relay-manager
    participant R as Nostr Relay

    U->>CV: 输入消息并发送
    CV->>A: sendMessage(contactPubkey, text)
    A->>SC: incrementSeqCounter()
    SC-->>A: seq number
    A->>WE: buildDirectMessageEvent()
    WE-->>A: kind 14 事件
    A->>WE: createGiftWrap(接收者)
    WE-->>A: Gift Wrap 事件 (给接收者)
    A->>WE: createGiftWrap(自己)
    WE-->>A: Gift Wrap 事件 (给自己)
    A->>RM: publishEvent(两个 wrap)
    RM->>R: 发布到多个 relay
    R-->>RM: 返回接受状态
    RM-->>A: PublishResults
    A-->>CV: 发送成功
    CV->>U: 消息显示在聊天中
```

### 4.3 消息接收流程

```mermaid
sequenceDiagram
    participant R as Nostr Relay
    participant SM as welshman subscribe
    participant A as RealNostrAdapter
    participant WE as welshman/crypto
    participant CV as ChatView
    participant U as 用户

    R->>SM: WebSocket: kind 1059 Gift Wrap
    SM->>A: 事件回调
    A->>WE: decryptGiftWrap(privkey)
    WE-->>A: 解密后的 inner event
    A->>A: 解析 sender, text, seq
    A->>CV: callback(message)
    CV->>U: UI 更新显示新消息
```

---

## 5. 技术栈总览

| 类别 | 技术 | 版本 |
|------|------|------|
| **框架** | Next.js 15 (App Router) | 15.x |
| **UI** | React 19 + TypeScript 5.9 | 19.x / 5.9 |
| **样式** | Tailwind CSS v4 | 4.x |
| **动画** | Framer Motion (motion) | 12.x |
| **主题** | next-themes | 0.4.x |
| **国际化** | i18next | 25.x |
| **图标** | Lucide React | 0.553 |
| **Nostr 协议** | Welshman 库族 (@welshman/*) | 0.8.x |
| **Nostr 工具** | nostr-tools | 2.x |
| **加密** | @noble/curves + @noble/hashes | 1.x |
| **存储** | localStorage + IndexedDB (idb) | - |
| **移动端** | Capacitor 8 + OTA 更新 | 8.x |
| **AI** | @google/genai (Gemini) | 1.x |
| **表单** | react-hook-form | 5.x |
| **测试** | Vitest + Playwright | 4.x / 1.x |

---

## 6. 安全设计

```mermaid
graph TB
    subgraph Security["安全机制"]
        S1["私钥不持久化<br/>useRef 内存引用<br/>页面刷新自动登出"]
        S2["消息加密<br/>NIP-59 Gift Wrap<br/>+ NIP-44 加密"]
        S3["确定性密钥<br/>SHA256(username:password:SALT)"]
        S4["Vault 加密<br/>AES-GCM 存储身份信息"]
        S5["多身份隔离<br/>每个身份独立密钥对"]
        S6["会话自动过期<br/>刷新后私钥丢失"]
    end

    Security --> E1["中继不可见消息内容"]
    Security --> E2["无需备份私钥"]
    Security --> E3["身份之间无法关联"]
    Security --> E4["设备丢失不泄露密钥"]
```

---

## 7. Nostr 事件类型

```mermaid
graph LR
    subgraph Events["Nostr 事件 (Kind)"]
        K0["Kind 0<br/>用户资料 Profile"]
        K3["Kind 3<br/>关注列表 Follows"]
        K14["Kind 14<br/>明文直接消息 DM"]
        K1059["Kind 1059<br/>Gift Wrap 加密包装"]
        K31990["Kind 31990<br/>Vault 数据"]
    end

    K0 --> P1["显示用户头像/昵称"]
    K3 --> P2["联系人列表"]
    K14 -.->|"被包裹在"| K1059
    K1059 --> P3["加密消息传输"]
    K31990 --> P4["身份 Vault 同步"]
```

---

## 8. 项目目录结构

```mermaid
graph TB
    subgraph App["app/"]
        A1["layout.tsx - 根布局"]
        A2["login/page.tsx - 登录"]
        A3["(main)/ - 认证路由组"]
        A4["api/ - API 路由"]
    end

    subgraph Components["components/"]
        C1["Providers.tsx"]
        C2["ui/ - 公共 UI"]
        C3["settings/ - 设置组件"]
    end

    subgraph Core["核心代码"]
        direction TB
        subgraph Contexts["contexts/"]
            CT1["NostrContext.tsx ★"]
        end
        subgraph Lib["lib/"]
            L1["nostr/ - 适配器+加密"]
            L2["welshman/ - 引擎封装"]
            L3["i18n.ts - 国际化"]
            L4["utils.ts - 工具"]
            L5["updater.ts - OTA"]
        end
        subgraph Hooks["hooks/"]
            H1["nostr/use-chats.ts"]
            H2["nostr/use-messages.ts"]
            H3["nostr/use-contacts.ts"]
            H4["use-mobile.ts"]
            H5["use-updater.ts"]
        end
    end

    subgraph Other["其他"]
        O1["tests/ - 测试"]
        O2["scripts/ - 脚本"]
        O3["android/ - Capacitor"]
        O4["site/ - 落地页"]
        O5["docs/ - 文档"]
        O6["public/locales/ - 翻译"]
    end

    App --> Components
    App --> Core
    App --> Other
```

---

## 9. 自定义协议

| 协议 | 格式 | 用途 |
|------|------|------|
| 分享联系人 | `dodobox://contact/<encoded-pubkey>` | 通过 URL 分享 Nostr 公钥 |
| 分享身份 | `dodobox://identity/<encoded-privkey>` | 通过 URL 分享身份信息（含昵称） |

---

*文档生成时间: 2026-04-28*
