# dodo-box 部署指南

## 前置条件

- Docker Desktop（或 Docker Engine + Docker Compose）
- Node.js 22+ 和 pnpm（仅本地开发需要）

## 1. Docker Compose 一键部署

```bash
# 构建并启动所有服务
docker compose -f docker/docker-compose.yml up -d --build
```

服务启动后：

- Web 应用：`http://127.0.0.1:18300`
- Nostr relay (strfry)：`ws://127.0.0.1:7777`
- 健康检查：`http://127.0.0.1:18300/api/health` 返回 `ok`

## 2. 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEFAULT_RELAYS` | `wss://relay.damus.io` | 客户端连接的 relay URL（逗号分隔），运行时通过 `/api/config` 传递 |
| `NEXT_PUBLIC_VAULT_SALT` | `dodobox-vault-v1` | Vault 加密盐值 |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | — | Next.js Server Actions 加密密钥 |
| `NEXT_PUBLIC_MOCK_TELEGRAM_TOKEN` | `mock-bot-token-12345` | Mock Telegram bot token |
| `MOCK_BOT_USERNAME` | `dodobox_bot` | Mock bot 用户名 |
| `MOCK_BOT_FIRST_NAME` | `DodoBox Bot` | Mock bot 显示名称 |

在 `docker/docker-compose.yml` 中修改 `environment` 部分即可调整。

## 3. 本地开发

```bash
pnpm install
pnpm dev          # 开发服务器 http://localhost:3000
```

### 测试

```bash
pnpm test             # 单元 + 集成测试（224 tests）
pnpm test:coverage    # 带覆盖率报告
pnpm test:e2e         # Playwright E2E（需要 dev server 运行）
```

### 类型检查与 lint

```bash
pnpm check            # tsc --noEmit + eslint
```

## 4. 架构说明

### 运行时 Relay 配置

客户端通过以下优先级获取 relay URL：

1. **用户手动配置**（localStorage `dodobox_user_relays`）— 在 Settings 页面或登录页设置对话框中编辑
2. **服务器运行时配置**（`/api/config` 端点返回 `DEFAULT_RELAYS` 环境变量）
3. **编译时默认值**（`NEXT_PUBLIC_DEFAULT_RELAYS` 或 `wss://relay.damus.io`）

这意味着 Docker 部署时无需重新构建镜像即可修改 relay 地址。

**APK 构建**：静态导出不包含 `/api/config`,relay 默认值在构建期内联。APK 构建使用 `.env.release`（由 `scripts/cap-build-export.js` 加载，系统环境变量优先级更高）;本地开发使用 `.env.local`。登录前也可在登录页右上角设置对话框中修改 relay（写入 localStorage)。

### Docker Compose 服务

- **relay**: strfry Nostr relay，端口 7777，数据持久化在 `relay-data` volume
- **app**: Next.js standalone 服务器，端口 18300 → 容器内 3000

### 集成测试 relay

`docker/docker-compose.test.yml` 提供 strfry relay 在端口 7778，供 Vitest 集成测试使用。测试的 `global-setup.ts` 会自动启动、`global-teardown.ts` 会自动停止。

### VPS 独立部署 relay

生产环境在 VPS 上单独运行 relay（Nginx 反代 + WSS）使用 `docker/docker-compose.relay.yml`，完整步骤见 [relay-vps-deployment.md](./relay-vps-deployment.md)。

## 5. 验证部署

```bash
# 检查服务状态
docker compose -f docker/docker-compose.yml ps

# 检查健康
curl http://127.0.0.1:18300/api/health

# 检查 relay 配置
curl http://127.0.0.1:18300/api/config

# 查看日志
docker compose -f docker/docker-compose.yml logs app
docker compose -f docker/docker-compose.yml logs relay
```

## 6. 停止与清理

```bash
# 停止服务
docker compose -f docker/docker-compose.yml down

# 停止并删除数据卷
docker compose -f docker/docker-compose.yml down -v
```
