# 本地 Relay 双用户测试流程

## 测试目标
验证本地 strfry relay 的消息收发功能，使用两个测试用户互发消息。

## 测试用户
- **david** 密码: `dddd`
- **bob** 密码: `bbbb`

---

## 步骤 1: 启动本地 Relay

```bash
cd /Users/david/_projects/2_personal/projects/dodo-box
docker compose up -d relay
```

等待 relay 就绪后检查状态：
```bash
docker compose ps
curl -s http://localhost:7777
```

---

## 步骤 2: 清除旧配置并设置本地 Relay

```bash
# 清除旧的 CLI 配置（因为加密方式修改了）
rm -rf ~/.dodobox

# 创建配置目录
mkdir -p ~/.dodobox

# 写入本地 relay 配置
cat > ~/.dodobox/config.json << 'EOF'
{
  "relays": ["ws://localhost:7777"],
  "defaultRelays": ["ws://localhost:7777"],
  "autoReconnect": true,
  "maxRetries": 3
}
EOF
```

---

## 步骤 3: 打开两个终端窗口

### 终端 1 - Bob（接收方）

```bash
cd /Users/david/_projects/2_personal/projects/dodo-box
pnpm cli
```

输入：
- Username: `bob`
- Password: `bbbb`

登录成功后，复制显示的 **pubkey**（类似 `abc123...` 的 64 位十六进制字符串）。

### 终端 2 - David（发送方）

```bash
cd /Users/david/_projects/2_personal/projects/dodo-box
pnpm cli
```

输入：
- Username: `david`
- Password: `dddd`

---

## 步骤 4: 添加联系人并发送消息

在 **David 终端** 中执行：

```bash
# 添加 Bob 为联系人（用实际的 pubkey 替换）
/add <bob的pubkey> bob

# 选择 Bob 作为消息接收者
/select bob

# 发送消息
Hello Bob! This is a test message from local relay.
```

---

## 步骤 5: 验证消息接收

在 **Bob 终端** 中，应该看到类似以下的输出：

```
📨 From david: "Hello Bob! This is a test message from local relay."
```

---

## 步骤 6: 双向消息测试（可选）

在 **Bob 终端** 中：

```bash
# 添加 David 为联系人（用实际的 pubkey 替换）
/add <david的pubkey> david

# 选择 David
/select david

# 回复消息
Hi David! Message received loud and clear!
```

---

## 清理

测试完成后，停止 relay：

```bash
docker compose down
```

---

## 常用 CLI 命令

| 命令 | 说明 |
|------|------|
| `/me` | 显示当前用户信息 |
| `/contacts` | 列出所有联系人 |
| `/select <name>` | 选择联系人进行聊天 |
| `/unselect` | 取消选择联系人 |
| `/status` | 查看 relay 连接状态 |
| `/list` | 显示最近收到的消息 |
| `/quit` | 退出 CLI |

---

## 故障排查

### Relay 无法连接
```bash
# 查看 relay 日志
docker compose logs relay

# 重启 relay
docker compose restart relay
```

### CLI 启动失败
```bash
# 确保依赖已安装
pnpm install

# 运行类型检查
pnpm check
```

### 消息未收到
1. 检查 relay 连接状态（`/status`）
2. 确认双方都添加了对方为联系人
3. 确认使用的是相同的本地 relay