# Relay 状态管理优化计划

## 问题分析

### 当前架构
- `lib/welshman/relay-manager.ts` - 核心 relay 管理单例
- `components/settings/GeneralSettings.tsx` - UI 组件（登录页和设置页共用）
- 状态类型：`'connecting' | 'connected' | 'failed' | 'closed'`

### 发现的问题

1. **🔴 BUG：登录前未初始化 relay 连接**
   - 登录页面打开设置时，`connectToRelays()` 没被调用
   - 导致 `relayStatusMap` 是空的，UI 显示不准确

2. **状态粒度不够**
   - `failed` 只表示某次连接失败
   - 无法区分"临时失败"和"彻底不可用"
   - 用户不知道重连进度

3. **用户控制能力缺失**
   - 没有手动重连按钮
   - 看到红色状态后无法干预

---

## 实施方案

### Phase 1: 修复登录前初始化 🔴

**目标**：应用启动时就初始化 relay 连接

**修改点**：
- 在 `GeneralSettings` 首次挂载时，获取默认 relay 列表并调用 `connectToRelays()`
- 确保登录前就能看到准确的 relay 状态

---

### Phase 2: 状态管理增强

#### 2.1 扩展状态类型
```typescript
type RelayStatus =
  | 'connecting'      // 首次连接或重连中
  | 'connected'       // 已连接
  | 'failed'          // 单次连接失败
  | 'unavailable'     // 彻底不可用（重连次数超过阈值）
  | 'closed'          // 手动关闭

interface RelayState {
  status: RelayStatus
  retryCount: number    // 重连次数（Error→Opening 时 +1）
  firstFailedAt?: number // 首次失败时间戳
}
```

#### 2.2 统计重连次数（监听 welshman 回调）

**状态转换逻辑**：
```
Error → Opening  : 重连开始，retryCount++
Opening → Open   : 连接成功，retryCount = 0，清除 firstFailedAt
Opening → Error  : 重连失败，继续等待下一次
Error → Closed   : 连接关闭
```

**unavailable 判定**：
- 当 `retryCount >= 3` 时，标记为 `unavailable`
- 用户可手动点击重连按钮重置 `retryCount` 并调用 `socket.open()`

#### 2.3 新增函数
```typescript
// 手动重连单个 relay
function reconnectRelay(url: string): void

// 重连所有失败/不可用的 relay
function reconnectFailedRelays(): void
```

---

### Phase 3: UI 增强

#### 3.1 状态显示优化
| 状态 | 圆点 | 文案 |
|------|------|------|
| `connecting` | 黄色 | "连接中..." 或 "重连中（第 N/3 次）" |
| `connected` | 绿色 | "已连接" |
| `failed` | 红色 | "连接失败" + 重连按钮 |
| `unavailable` | 红色 | "不可用（重连 N 次失败）" + 重连按钮 |
| `closed` | 灰色 | "已关闭" |

#### 3.2 增加控制按钮
- **单个 relay 行**：重连按钮（failed/unavailable 时显示）
- **底部**：`重连失败项` 按钮（有失败的 relay 时显示）

---

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `lib/welshman/relay-manager.ts` | 扩展状态类型、统计重连次数、新增手动重连函数 |
| `components/settings/GeneralSettings.tsx` | UI 增强、初始化逻辑、重连按钮 |
| `public/locales/en.json` | 新增翻译：`connecting`, `reconnecting`, `unavailable`, `reconnect` |
| `public/locales/zh.json` | 新增翻译：`连接中`, `重连中`, `不可用`, `重连` |

---

## 详细实现

### relay-manager.ts 修改

```typescript
// 新增状态存储
interface RelayState {
  status: RelayStatus
  retryCount: number
  firstFailedAt?: number
}

const relayStateMap = new Map<string, RelayState>()

// 状态映射（增加重连次数判断）
function mapSocketStatus(url: string, s: SocketStatus): RelayStatus {
  const state = relayStateMap.get(url)
  if (state?.retryCount >= 3) return 'unavailable'
  
  switch (s) {
    case SocketStatus.Opening: return 'connecting'
    case SocketStatus.Open:    return 'connected'
    case SocketStatus.Error:   return 'failed'
    default:                   return 'closed'
  }
}

// 状态变化处理
socket.on(SocketEvent.Status, (status: SocketStatus) => {
  const prev = relayStateMap.get(url)
  
  // 统计重连次数：Error → Opening
  if (prev?.status === 'failed' && status === SocketStatus.Opening) {
    relayStateMap.set(url, {
      ...prev,
      retryCount: prev.retryCount + 1,
    })
  }
  
  // 连接成功：重置计数
  if (status === SocketStatus.Open) {
    relayStateMap.set(url, { status: 'connected', retryCount: 0 })
  }
  
  // 首次失败：记录时间
  if (status === SocketStatus.Error && !prev?.firstFailedAt) {
    relayStateMap.set(url, {
      ...prev,
      status: 'failed',
      firstFailedAt: Date.now(),
    })
  }
  
  onStatusChange?.(url, mapSocketStatus(url, status))
})

// 手动重连
export function reconnectRelay(url: string): void {
  const pool = getPool()
  if (!pool) return
  const socket = pool.get(url)
  
  // 重置状态
  relayStateMap.set(url, { status: 'connecting', retryCount: 0 })
  socket.open()
}

// 批量重连失败项
export function reconnectFailedRelays(): void {
  for (const [url, state] of relayStateMap.entries()) {
    if (state.status === 'failed' || state.status === 'unavailable') {
      reconnectRelay(url)
    }
  }
}
```

### GeneralSettings.tsx 修改

```typescript
// 初始化时连接 relay
useEffect(() => {
  const relays = getUserRelays().length > 0 
    ? getUserRelays() 
    : getDefaultRelays()
  connectToRelays(relays)
}, [])

// 渲染 relay 列表时显示重连次数
{relays.map((relay) => {
  const state = relayStateMap.get(relay)
  const isReconnecting = state?.status === 'connecting' && state.retryCount > 0
  
  return (
    <div key={relay}>
      <span>{relay}</span>
      <span>
        {isReconnecting 
          ? `重连中（第 ${state.retryCount}/3 次）`
          : t(`relay.status.${state?.status || 'closed'}`)
        }
      </span>
      {(state?.status === 'failed' || state?.status === 'unavailable') && (
        <button onClick={() => reconnectRelay(relay)}>
          {t('relay.reconnect')}
        </button>
      )}
    </div>
  )
})}
```

---

## 预估工时

| Phase | 工时 |
|-------|------|
| Phase 1: 登录前初始化修复 | 0.5 小时 |
| Phase 2: 状态管理增强（重连统计） | 1.5 小时 |
| Phase 3: UI 增强 | 1.5 小时 |
| 测试验证 | 1 小时 |

**总计：约 5 小时**

---

## 风险评估

- **低风险**：状态类型扩展是增量变更
- **低风险**：重连统计是纯监听逻辑，不影响 welshman 行为
- **低风险**：UI 增强是纯展示层变更

---

## 测试计划

1. **登录前状态显示**：打开设置，确认 relay 状态正确显示
2. **重连次数统计**：模拟 relay 失败，观察重连次数是否正确累加
3. **unavailable 判定**：确认重连 3 次后标记为 unavailable
4. **手动重连**：点击重连按钮，确认状态重置并重新连接