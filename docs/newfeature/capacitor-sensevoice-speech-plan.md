# Capacitor App 接入离线语音识别（SenseVoice ONNX）方案

## 0. 结论先行

- **不要自己手撸 ONNX Runtime + fbank 特征提取 + CTC 解码**。SenseVoice 的官方社区运行时是 [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)（k2-fsa / Next-gen Kaldi 团队维护），已经原生支持 SenseVoice 模型，并且提供：
  - Android：Kotlin/Java API + 预编译 `.aar`（内含 jniLibs）
  - iOS：Swift/Obj-C API + `.xcframework`
  - 内置音频重采样、fbank 特征提取、VAD、ITN（逆文本正则化，即"一二三"转"123"）等能力
- 你要做的事情主要是：**写一个 Capacitor 自定义插件**，在 Android/iOS 原生侧调用 sherpa-onnx 完成录音 + 识别，再把结果通过事件/Promise 回传给 H5。
- 同时把"离线 SenseVoice"和"系统内置 STT"（Android `SpeechRecognizer` / iOS `SFSpeechRecognizer`）抽象成同一套 JS 接口的两种 `engine` 实现，方便切换和降级。

---

## 1. 整体架构

```
┌─────────────────────────── H5 (Vue/React/...) ───────────────────────────┐
│  import { SpeechPlugin } from './plugins/speech'                          │
│  await SpeechPlugin.startListening({ engine: 'offline' | 'system' })      │
│  SpeechPlugin.addListener('partialResult', ...)                           │
│  SpeechPlugin.addListener('finalResult', ...)                             │
└───────────────────────────────┬───────────────────────────────────────────┘
                                 │ Capacitor Bridge (JS <-> Native)
                 ┌───────────────┴────────────────┐
                 ▼                                 ▼
   ┌─────────────────────────┐        ┌─────────────────────────┐
   │   Android (Kotlin)      │        │   iOS (Swift)            │
   │  SpeechPlugin.kt        │        │  SpeechPlugin.swift      │
   │  ┌────────────────────┐ │        │  ┌────────────────────┐ │
   │  │ Engine 抽象接口     │ │        │  │ Engine 抽象接口     │ │
   │  ├────────────────────┤ │        │  ├────────────────────┤ │
   │  │OfflineEngine        │ │        │  │OfflineEngine        │ │
   │  │(sherpa-onnx +       │ │        │  │(sherpa-onnx +       │ │
   │  │ SenseVoice int8)    │ │        │  │ SenseVoice int8)    │ │
   │  ├────────────────────┤ │        │  ├────────────────────┤ │
   │  │SystemEngine         │ │        │  │SystemEngine         │ │
   │  │(SpeechRecognizer)   │ │        │  │(SFSpeechRecognizer) │ │
   │  └────────────────────┘ │        │  └────────────────────┘ │
   │  AudioRecord 采集 16k   │        │  AVAudioEngine 采集 16k │
   └─────────────────────────┘        └─────────────────────────┘
```

设计要点：JS 层不关心具体引擎，只关心统一的事件和方法；原生层通过策略模式在 `OfflineEngine` 和 `SystemEngine` 之间切换，方便：

- 用户手动选择"离线模式 / 系统内置模式"
- 或者做自动降级（比如系统语言不支持、无网络时自动落到离线模型）

---

## 2. JS/TS 接口设计（插件契约）

新建一个自定义 Capacitor 插件，例如叫 `SpeechRecognitionPlugin`。

```ts
// definitions.ts
export type SpeechEngine = 'offline' | 'system';

export interface StartListeningOptions {
  engine: SpeechEngine;      // 'offline' 用 SenseVoice，'system' 用系统 STT
  language?: string;         // 'zh-CN' / 'en-US' / 'auto' (SenseVoice 支持多语种自动识别)
  partialResults?: boolean;  // 是否需要中间结果（离线非流式模型只能在分段后给结果）
  maxSilenceMs?: number;     // VAD 静音判停时长，用于自动断句
  itn?: boolean;             // 是否做逆文本正则化（数字/日期规整）
}

export interface SpeechResult {
  text: string;
  isFinal: boolean;
  engine: SpeechEngine;
  lang?: string;             // SenseVoice 会返回识别出的语种
  emotion?: string;          // SenseVoice 特有：情绪标签（可选使用）
  event?: string;            // SenseVoice 特有：音频事件标签（笑声/掌声等，可选）
}

export interface SpeechRecognitionPlugin {
  isEngineAvailable(options: { engine: SpeechEngine }): Promise<{ available: boolean; reason?: string }>;
  requestPermissions(): Promise<{ granted: boolean }>;
  startListening(options: StartListeningOptions): Promise<void>;
  stopListening(): Promise<{ text: string }>;   // 主动停止并拿最终结果
  cancelListening(): Promise<void>;
  addListener(eventName: 'partialResult' | 'finalResult' | 'error' | 'volumeLevel',
              listenerFunc: (data: any) => void): Promise<PluginListenerHandle>;
}
```

H5 侧调用示例：

```ts
import { SpeechRecognition } from './plugins/speech';

// 启动前先探测离线引擎是否就绪（模型是否已下载/解压完成）
const { available } = await SpeechRecognition.isEngineAvailable({ engine: 'offline' });
const engine = available ? 'offline' : 'system';

await SpeechRecognition.requestPermissions();

SpeechRecognition.addListener('partialResult', (r) => updateUI(r.text));
SpeechRecognition.addListener('finalResult', (r) => commitText(r.text));

await SpeechRecognition.startListening({ engine, language: 'auto', itn: true });
// ... 用户点击停止
const { text } = await SpeechRecognition.stopListening();
```

---

## 3. Android 端实现

### 3.1 依赖

`android/app/build.gradle`：

```gradle
dependencies {
    // sherpa-onnx 官方发布的 Android AAR（含 onnxruntime so + JNI 封装）
    implementation("com.k2fsa.sherpa.onnx:sherpa-onnx:<version>")
    // 或者手动把 sherpa-onnx 编译产物 (sherpa-onnx.aar) 放到 libs/ 下 implementation files('libs/sherpa-onnx.aar')
}
```

> sherpa-onnx 官方仓库里的 `android` 目录已经有完整的 Kotlin Demo（`SherpaOnnxSimulateStreamingAsr`、`SherpaOnnxAsrWithVad` 等），可以直接把其中的 `OfflineRecognizer` 封装代码搬过来复用，不需要从零实现。

### 3.2 模型资源

- 推荐模型：`sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-*`（中英日韩粤语，int8 量化，体积约 200~300MB 原始，量化后小很多）
- 存放方式二选一：
  1. **随包内置**：放到 `android/app/src/main/assets/models/sensevoice/`，首次启动时解压到 `filesDir`。优点是离线开箱即用；缺点是安装包变大（几十到几百 MB），需要评估应用商店包体限制。
  2. **首次启动动态下载**：APK 内不带模型，首次进入语音功能时从你自己的 CDN 下载 zip 并校验 md5，解压后使用。优点是包体小；缺点是首次仍需联网（"离线"只体现在识别阶段不联网）。
- 建议：**做成可配置**，默认走方案 2（下载），并在下载后做本地缓存，之后就是完全离线可用。

### 3.3 核心识别代码骨架

```kotlin
class SenseVoiceOfflineEngine(private val context: Context) {
    private lateinit var recognizer: OfflineRecognizer
    private var audioRecord: AudioRecord? = null
    private val sampleRate = 16000

    fun init(modelDir: String) {
        val config = OfflineRecognizerConfig(
            modelConfig = OfflineModelConfig(
                senseVoice = OfflineSenseVoiceModelConfig(
                    model = "$modelDir/model.int8.onnx",
                    language = "auto",   // auto/zh/en/ja/ko/yue
                    useItn = true,
                ),
                tokens = "$modelDir/tokens.txt",
                numThreads = 2,
                provider = "cpu",
            )
        )
        recognizer = OfflineRecognizer(assetManager = null, config = config)
    }

    fun startRecording(onPartial: (String) -> Unit, onFinal: (String) -> Unit) {
        val bufferSize = AudioRecord.getMinBufferSize(
            sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize
        )
        audioRecord?.startRecording()
        // 建议接入 sherpa-onnx 自带的 VAD (silero-vad) 做端点检测，
        // 静音超过阈值就把这一段 buffer 送去 recognizer.decode()，
        // 而不是等用户手动点停止才识别，体验更接近"边说边出字"
        Thread { readLoopWithVad(onPartial, onFinal) }.start()
    }

    fun stopAndGetFinal(): String { /* flush 剩余音频，返回最终文本 */ }
}
```

> **关于"流式"体验**：SenseVoice 本身是非流式（整段过一次编码器）模型，不能像 Zipformer-transducer 那样天然流式输出。要做到"边说边看到文字"的效果，通常做法是：结合 **silero-vad**（sherpa-onnx 自带）做语音端点检测，把用户的话按停顿切成若干小段，每段结束立刻丢给 SenseVoice 识别并追加显示，从而模拟流式效果。如果你需要真正逐字流式，需要换 Zipformer/Paraformer streaming 模型，但准确率和你已验证过的 SenseVoice 效果可能不一致，需要重新评估。

### 3.4 系统内置引擎（Android）

```kotlin
class SystemSpeechEngine(private val context: Context) {
    private var recognizer: SpeechRecognizer? = null

    fun start(language: String, onPartial: (String) -> Unit, onFinal: (String) -> Unit) {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            // 抛出 UNAVAILABLE，交给上层决定是否 fallback 到离线引擎
            return
        }
        recognizer = SpeechRecognizer.createSpeechRecognizer(context)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
        recognizer?.setRecognitionListener(/* onPartialResults / onResults 回调 */)
        recognizer?.startListening(intent)
    }
}
```

注意：不同厂商 ROM（小米/华为/oppo/vivo）对系统 `SpeechRecognizer` 的实现差异很大，有的必须联网（走厂商云端），有的完全不可用，这也是你想引入离线方案的核心原因，建议保留它仅作为"可选/兜底"路径，而不是主路径。

---

## 4. iOS 端实现

### 4.1 依赖

用 CocoaPods 或 SPM 引入 sherpa-onnx 官方 iOS 产物（xcframework），或者按官方文档自行用 `build-ios.sh` 编译一份。

```ruby
# Podfile（如果 sherpa-onnx 提供了 pod，否则手动拖 xcframework 进工程）
pod 'SherpaOnnx', :path => '../native/sherpa-onnx-ios'
```

### 4.2 核心代码骨架

```swift
class SenseVoiceOfflineEngine {
    private var recognizer: SherpaOnnxOfflineRecognizer!

    func setup(modelDir: String) {
        var config = sherpaOnnxOfflineRecognizerConfig(
            featConfig: sherpaOnnxFeatureConfig(sampleRate: 16000, featureDim: 80),
            modelConfig: sherpaOnnxOfflineModelConfig(
                senseVoice: sherpaOnnxOfflineSenseVoiceModelConfig(
                    model: "\(modelDir)/model.int8.onnx",
                    language: "auto",
                    useInverseTextNormalization: true
                ),
                tokens: "\(modelDir)/tokens.txt",
                numThreads: 2
            )
        )
        recognizer = SherpaOnnxOfflineRecognizer(config: &config)
    }

    func recognize(samples: [Float]) -> String {
        let stream = recognizer.createStream()
        stream.acceptWaveform(samples: samples, sampleRate: 16000)
        recognizer.decode(stream: stream)
        return recognizer.getResult(stream: stream).text
    }
}
```

音频采集用 `AVAudioEngine`，`installTap` 拿到 PCM buffer，转换成 16k mono Float 数组喂给上面的 `recognize`。同样建议接 VAD 做分段。

### 4.3 系统内置引擎（iOS）

用 `SFSpeechRecognizer` + `SFSpeechAudioBufferRecognitionRequest`，注意：

- 需要 `NSSpeechRecognitionUsageDescription` 和 `NSMicrophoneUsageDescription`
- iOS 13+ 支持 `requiresOnDeviceRecognition = true`，可以强制走设备端识别（不联网），但**语种和准确率取决于系统语言包**，建议同样只作为可选项。

---

## 5. Capacitor 插件工程结构

```
your-capacitor-app/
├── android/
│   └── app/src/main/java/.../SpeechRecognitionPlugin.kt
├── ios/
│   └── App/App/SpeechRecognitionPlugin.swift
├── src/plugins/speech/
│   ├── definitions.ts     # 上面第 2 节的接口
│   ├── index.ts           # registerPlugin('SpeechRecognition')
│   └── web.ts             # 可选：H5 端用 Web Speech API 兜底（浏览器预览时用）
```

```ts
// index.ts
import { registerPlugin } from '@capacitor/core';
import type { SpeechRecognitionPlugin } from './definitions';

const SpeechRecognition = registerPlugin<SpeechRecognitionPlugin>('SpeechRecognition', {
  web: () => import('./web').then(m => new m.SpeechRecognitionWeb()),
});

export { SpeechRecognition };
```

原生插件（Android 侧）用标准 `@CapacitorPlugin` 注解声明方法和权限，`@PluginMethod` 暴露给 JS，`notifyListeners()` 把中间/最终结果和音量回调推给 H5。iOS 侧对应用 `CAPPlugin` + `CAPPluginMethod`。

---

## 6. 权限配置

**AndroidManifest.xml**
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" /> <!-- 仅用于首次下载模型 -->
```

**Info.plist**
```xml
<key>NSMicrophoneUsageDescription</key>
<string>需要使用麦克风进行语音输入</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>需要使用语音识别功能（如启用系统内置识别）</string>
```

---

## 7. 模式切换与降级策略建议

| 场景 | 建议 |
|---|---|
| 追求识别效果/多方言/隐私（音频不出设备） | 默认 `engine: 'offline'`（SenseVoice） |
| 离线模型尚未下载完成 | 临时 fallback 到 `system`，下载完成后自动切回 `offline`，并提示用户 |
| 低端机/内存紧张（int8 模型 + onnxruntime 常驻内存有一定开销） | 提供设置项让用户手动选择，或按机型白名单/黑名单 |
| 需要极致省包体 | 走"首次动态下载模型"而不是随 APK 内置 |
| 需要真流式逐字上屏 | 需评估更换为 streaming 模型（Zipformer/Paraformer-streaming），或接受"VAD 分段 + 段末出字"的伪流式体验 |

---

## 8. 工作量拆解（供排期参考）

1. **原生引擎封装**（Android + iOS 各自集成 sherpa-onnx，跑通 Demo 级识别）：约 3-5 人日
2. **音频采集 + VAD 分段 + 结果拼接逻辑**：约 2-3 人日
3. **Capacitor 插件桥接层（JS API + 双端 Native Plugin）**：约 2 人日
4. **模型资源管理（内置 or 下载、校验、版本升级）**：约 1-2 人日
5. **系统内置引擎接入 + 自动降级策略**：约 1-2 人日
6. **联调、机型兼容测试（重点测国产 ROM 权限/后台限制）**：约 3-5 人日

---

## 9. 参考资料

- sherpa-onnx 项目主页：https://github.com/k2-fsa/sherpa-onnx
- SenseVoice 在 sherpa-onnx 中的使用文档：https://k2-fsa.github.io/sherpa/onnx/sense-voice/index.html
- Android/iOS Demo 代码位于 sherpa-onnx 仓库的 `android/` 和 `swift-api-examples/` 目录，建议直接参考其 `OfflineRecognizer` 封装方式而非从零实现。
