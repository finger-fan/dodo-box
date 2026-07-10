# Relay 部署验证流程

> 本文档描述从零开始部署并验证 dodo-box（含 strfry relay + Next.js 应用）的完整测试流程。
> 当前分支：feat/deployable-mvp | 测试状态：224 单元测试/集成测试通过，覆盖率 82%

---

## 一、前置条件

| 项目 | 要求 | 验证命令 |
|---|---|---|
| Docker Desktop | 已安装且运行 | docker info |
| Docker Compose | v2+（docker compose plugin） | docker compose version |
| 端口 7777 | 未被占用（relay） | lsof -nP -iTCP:7777 -sTCP:LISTEN |
| 端口 18300 | 未被占用（app） | lsof -nP -iTCP:18300 -sTCP:LISTEN |
| Node.js 22+ | 本地开发/测试需要 | node -v |
| pnpm | 包管理器 | pnpm -v |

---

## 二、Phase 1 -- Docker 构建验证

### 2.1 构建镜像

```bash
docker compose build
```

**预期结果**：
- Stage 1 (deps): pnpm install --frozen-lockfile 成功，无 ERR_PNPM_IGNORED_BUILDS 错误
- Stage 2 (builder): pnpm run build 成功，生成 .next/standalone
- Stage 3 (runner): 镜像 dodo-box:latest 构建完成

**关键检查点**：
- pnpm-workspace.yaml 中 onlyBuiltDependencies 已正确配置（@tailwindcss/oxide, sharp, cbor-extract 等）
- package-lock.json 已删除，只剩 pnpm-lock.yaml
- Dockerfile 三层结构（deps -> builder -> runner）复用正确，未使用 --mount=type=cache

### 2.2 验证镜像内容

```bash
# 确认 standalone 输出包含 server.js
docker run --rm dodo-box:latest ls -la /app/server.js

# 确认 .next/static 存在
docker run --rm dodo-box:latest ls /app/.next/static/ | head -5
```

---

## 三、Phase 2 -- Relay 部署验证

### 3.1 启动服务

```bash
docker compose up -d
```

### 3.2 检查服务状态

```bash
docker compose ps
```

**预期结果**：

| 服务 | 状态 | 端口 |
|---|---|---|
| dodo-box-relay | running (healthy) | 127.0.0.1:7777 -> 7777 |
| dodo-box-app | running (healthy) | 127.0.0.1:18300 -> 3000 |

### 3.3 验证 Relay (strfry)

```bash
# 1. HTTP 健康检查（strfry 对根路径返回 200）
curl -sv http://127.0.0.1:7777/

# 2. WebSocket 连接测试
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:7777/');
ws.on('open', () => {
  console.log('WebSocket connected to relay');
  ws.send(JSON.stringify({type:'REQ',subscription_id:'test',filters:[{kinds:[0]}]}));
});
ws.on('message', (data) => {
  console.log('Relay message:', data.toString());
  ws.close();
});
ws.on('close', () => process.exit(0));
ws.on('error', (e) => { console.error('Error:', e.message); process.exit(1); });
"

# 3. 发布一个测试 event 并接收
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:7777/');
ws.on('open', () => {
  const testEvent = {
    id: '0'.repeat(64),
    pubkey: '0'.repeat(64),
    created_at: Math.floor(Date.now()/1000),
    kind: 1,
    tags: [],
    content: 'hello from relay test',
    sig: '0'.repeat(128)
  };
  ws.send(JSON.stringify({type:'EVENT',event:testEvent}));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg[0] === 'OK') {
    console.log(msg[2] ? 'Event accepted by relay' : 'Event rejected: ' + msg[3]);
  } else if (msg[0] === 'NOTICE') {
    console.log('Relay notice:', msg[1]);
  }
  ws.close();
});
ws.on('error', (e) => { console.error('Error:', e.message); process.exit(1); });
ws.on('close', () => process.exit(0));
"
```

### 3.4 验证 Relay 配置

```bash
# 查看 strfry NIP-11 info
curl -H 'Accept: application/nostr+json' http://127.0.0.1:7777/ | python3 -m json.tool
```

**预期输出**：
```json
{
  "name": "strfry dodo-box relay",
  "description": "A local Nostr relay for dodo-box",
  "pubkey": "",
  "contact": ""
}
```

### 3.5 查看 Relay 日志

```bash
docker compose logs relay | tail -30
```

**正常启动日志特征**：
- LMDB map size 初始化信息
- listening on 0.0.0.0:7777
- 无 rejecting event 或 database error 等错误

---

## 四、Phase 3 -- 应用部署验证

### 4.1 验证应用健康检查

```bash
curl -s http://127.0.0.1:18300/api/health
# 预期: {"status":"ok"}
```

### 4.2 验证运行时 Relay 配置

```bash
curl -s http://127.0.0.1:18300/api/config | python3 -m json.tool
# 预期: {"relays":["ws://localhost:7777"]}
```

**关键点**：客户端通过 /api/config 获取 relay URL，而非依赖编译时 NEXT_PUBLIC_*。
这意味着 Docker 部署时无需重新构建镜像即可修改 relay 地址。

配置优先级（contexts/NostrContext.tsx -> ensureRelays）：
1. 用户手动配置（localStorage dodobox_user_relays）-> Settings 页面编辑
2. 服务器运行时配置（/api/config -> DEFAULT_RELAYS 环境变量）
3. 编译时默认值（NEXT_PUBLIC_DEFAULT_RELAYS 或 wss://relay.damus.io）

### 4.3 验证前端页面

浏览器访问 http://127.0.0.1:18300/login

**预期**：
- 登录页面正常渲染
- 无 console 错误（F12 开发者工具）
- 页面语言检测正常（浏览器语言为中文时显示中文界面）

### 4.4 验证应用日志

```bash
docker compose logs app | tail -30
```

**正常启动日志特征**：
- Ready in xxxms（Next.js standalone server 启动）
- 无 TypeScript 编译错误
- 无模块加载失败

---

## 五、Phase 4 -- 端到端功能验证

### 5.1 本地 dev 模式 E2E（无需 Docker）

```bash
# 终端 1: 启动集成测试 relay
docker compose -f docker-compose.test.yml up -d

# 等待 relay 健康
sleep 10

# 终端 2: 启动 dev server
pnpm dev

# 终端 3: 运行 E2E 测试
pnpm test:e2e
```

### 5.2 Docker 模式 E2E

```bash
# 确保 docker compose up -d 已运行
# E2E 测试指向 18300 端口
BASE_URL=http://127.0.0.1:18300 pnpm test:e2e
```

### 5.3 手动端到端测试流程：双账户通信

| 步骤 | 操作 | 预期 |
|---|---|---|
| 1 | 浏览器 A 打开 http://127.0.0.1:18300/login | 登录页渲染 |
| 2 | 创建账户 alice，密码 test123 | 注册成功，进入 messages 页 |
| 3 | 复制 alice 的 pubkey（Settings -> Identity） | pubkey 为 npub1... 格式 |
| 4 | 浏览器 B（隐身窗口）打开 /login | 登录页渲染 |
| 5 | 创建账户 bob，密码 test123 | 注册成功 |
| 6 | bob 添加 alice 为联系人（输入 npub） | 联系人列表显示 alice |
| 7 | bob 打开与 alice 的聊天，发送 hello | 消息发送成功，显示在聊天中 |
| 8 | 浏览器 A 刷新页面 | 自动登录（session 保持），看到 bob 的消息 |
| 9 | alice 回复 hi back | 消息发送成功 |
| 10 | 浏览器 B 刷新 | bob 看到 alice 的回复 |

### 5.4 Relay 连接状态验证

在 Settings 页面中：
- 应显示 relay 连接状态（每个 relay URL 旁有在线/离线/重连中指示）
- ws://localhost:7777 应显示为在线
- 状态通过 lib/welshman/relay-manager.ts 的 getRelayStatusMap 获取，每 3 秒轮询

### 5.5 Relay 配置持久化验证

在 Settings 页面中：
1. 编辑 relay 配置，添加一个额外的 relay（如 wss://relay.damus.io）
2. 保存
3. 刷新页面
4. 检查 relay 配置是否保留
5. 底层通过 runtime-config.ts 的 setUserRelays/getUserRelays 持久化到 localStorage

---

## 六、Phase 5 -- 自动化测试全量验证

### 6.1 类型检查 + Lint

```bash
pnpm check
# 预期: 0 TypeScript errors, 0 lint errors
```

### 6.2 单元测试 + 集成测试

```bash
pnpm test
# 预期: 224+ tests passing
```

### 6.3 覆盖率报告

```bash
pnpm test:coverage
# 预期: 全局行覆盖 >= 80%，nostr 核心模块 >= 85%
```

### 6.4 集成测试 Relay 生命周期

```bash
# 集成测试使用 docker-compose.test.yml，会自动启停
pnpm test -- tests/integration/nostr-adapter.test.ts
```

**预期**：
- 测试启动时通过 global-setup.ts 自动拉起 dodo-box-relay-test 容器（端口 7778）
- 测试完成后通过 global-teardown.ts 自动停止并清理
- 如果 relay 不可达，测试自动 skip（skipIfNoRelay）

---

## 七、Phase 6 -- 部署清理验证

### 7.1 停止服务

```bash
docker compose down
docker compose ps
# 预期: 无容器运行
```

### 7.2 清理数据卷

```bash
docker compose down -v
docker volume ls | grep dodo
# 预期: 无 dodo-box 相关 volume
```

### 7.3 重建验证

```bash
# 从零重建（模拟全新部署）
docker compose down -v
docker compose up -d --build
```

重复 Phase 3-5 的验证步骤

---

## 八、故障排查

### Relay 连接失败

```bash
# 1. 检查 relay 是否健康
docker compose exec relay wget -q --spider http://127.0.0.1:7777 && echo OK || echo FAIL

# 2. 检查 relay 日志
docker compose logs relay --tail=50

# 3. 检查端口监听
lsof -nP -iTCP:7777 -sTCP:LISTEN

# 4. 检查容器网络
docker compose exec app wget -q --spider http://relay:7777 && echo OK || echo FAIL
# 注意：容器内使用服务名 relay，而非 localhost
```

### 应用启动失败

```bash
# 1. 查看启动日志
docker compose logs app --tail=100

# 2. 进入容器调试
docker compose exec app sh
ls -la /app/server.js

# 3. 检查环境变量
docker compose exec app env | grep -E 'RELAY|VAULT|NEXT'
```

### 客户端连接错误 Relay

```bash
# 确认 /api/config 返回正确的 relay URL
curl http://127.0.0.1:18300/api/config

# 如果返回 wss://relay.damus.io 而非 ws://localhost:7777
# 检查 docker-compose.yml 中 DEFAULT_RELAYS 环境变量
```

### 构建失败

```bash
# pnpm install 失败：检查 pnpm-workspace.yaml 中 onlyBuiltDependencies
cat pnpm-workspace.yaml

# 原生编译失败：确认使用 node:22-alpine3.21 基础镜像
# 检查 Dockerfile FROM 语句
```

---

## 九、部署架构速查

```
+-----------------------------------------+
|           Docker Compose                |
|                                         |
|  +--------------+   +----------------+  |
|  |    relay     |   |      app       |  |
|  |  (strfry)    |<--|  (Next.js 15)  |  |
|  |  port 7777   |   |  port 3000     |  |
|  |              |   |                |  |
|  |  relay-data  |   |  standalone    |  |
|  |   volume     |   |   output       |  |
|  +------+-------+   +-------+--------+  |
|         |                   |           |
+---------+-------------------+-----------+
          |                   |
    host:7777           host:18300
          |                   |
    +-----+-----+     +-------+-------+
    |  WebSocket|     |  HTTP/HTTPS   |
    |  Nostr    |     |  Next.js      |
    |  Protocol |     |  App Router   |
    +-----------+     +---------------+
```

---

## 十、关键代码路径参考

| 功能 | 文件 | 说明 |
|---|---|---|
| Relay 连接管理 | lib/welshman/relay-manager.ts | connectToRelays, waitForRelayConnection, getRelayStatusMap |
| Relay 连接池 | lib/welshman/engine.ts | getPool, getTracker, getRepository |
| 运行时配置 | lib/runtime-config.ts | getRuntimeConfig, getUserRelays, setUserRelays |
| API 配置端点 | app/api/config/route.ts | 返回 DEFAULT_RELAYS 环境变量 |
| 健康检查 | app/api/health/route.ts | 返回 {status: ok} |
| 会话与 Relay 初始化 | contexts/NostrContext.tsx | ensureRelays, login, register |
| Docker Compose | docker-compose.yml | relay + app 服务定义 |
| Dockerfile | Dockerfile | 三阶段构建 (deps, builder, runner) |
| strfry 配置 | docker/strfry.conf | relay 端口, 事件限制, NIP-11 info |
| 测试 Relay | docker-compose.test.yml | 端口 7778 的独立 relay |

---

## 十一、测试检查清单

完成部署验证后，逐项确认：

- [ ] Docker 构建成功，无 ERR_PNPM_IGNORED_BUILDS
- [ ] Relay 容器 healthy，WebSocket 可连接
- [ ] Relay NIP-11 info 正确返回
- [ ] App 容器 healthy，/api/health 返回 ok
- [ ] /api/config 返回 ws://localhost:7777
- [ ] 登录页面正常渲染
- [ ] 注册新用户成功
- [ ] Settings 页面显示 relay 在线状态
- [ ] 双账户端到端消息互通（手动或 E2E）
- [ ] 刷新页面后 session 保持
- [ ] pnpm check 通过
- [ ] pnpm test 全绿（224+ tests）
- [ ] docker compose down 正常清理