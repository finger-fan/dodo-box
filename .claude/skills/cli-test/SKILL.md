# CLI Local Relay Testing

自动化测试 DodoBox CLI 与本地 relay 的消息收发功能。使用 tmux 控制两个终端窗口进行双向消息测试。

## 前置条件

1. 本地 relay 已启动，监听 `ws://localhost:7778`
2. 项目已安装依赖 (`pnpm install`)
3. tmux 可用

## 测试用户

| 用户名 | 密码 |
|--------|------|
| bob | bbbb |
| david | dddd |

## 测试流程

### 1. 准备环境

```bash
# 清理旧配置和数据（加密逻辑变更后必须清理）
rm -rf ~/.dodobox

# 确保 relay.ts 使用本地 relay
# 检查 cli/relay.ts 的 DEFAULT_RELAYS 是否为 ['ws://localhost:7778']
```

### 2. 启动 tmux 会话

```bash
# 创建会话
tmux new-session -d -s dodobox_test -x 120 -y 40 -c /Users/david/_projects/2_personal/projects/dodo-box

# 分割窗口
tmux split-window -h -t dodobox_test -c /Users/david/_projects/2_personal/projects/dodo-box
```

### 3. 启动 CLI 并注册用户

```bash
# 左侧窗口 (pane 0) - Bob
tmux send-keys -t dodobox_test:1.0 'pnpm cli' Enter
# 等待 Username: 提示
tmux send-keys -t dodobox_test:1.0 'bob' Enter
tmux send-keys -t dodobox_test:1.0 'bbbb' Enter

# 右侧窗口 (pane 1) - David
tmux send-keys -t dodobox_test:1.1 'pnpm cli' Enter
tmux send-keys -t dodobox_test:1.1 'david' Enter
tmux send-keys -t dodobox_test:1.1 'dddd' Enter
```

### 4. 记录 Pubkey

注册成功后会显示 pubkey，记录下来用于添加联系人：
- Bob: `49e1e9c1b7cefeb7...`
- David: `7019fe90fc64e238...`

### 5. 互加联系人

```bash
# Bob 添加 David
tmux send-keys -t dodobox_test:1.0 '/add <david_pubkey> david' Enter

# David 添加 Bob
tmux send-keys -t dodobox_test:1.1 '/add <bob_pubkey> bob' Enter
```

### 6. 测试消息收发

```bash
# David 发送给 Bob
tmux send-keys -t dodobox_test:1.1 '/select bob' Enter
tmux send-keys -t dodobox_test:1.1 '测试消息内容' Enter

# Bob 回复
tmux send-keys -t dodobox_test:1.0 '/select david' Enter
tmux send-keys -t dodobox_test:1.0 '回复消息内容' Enter
```

### 7. 验证登录流程（加密解密测试）

```bash
# 退出 CLI
tmux send-keys -t dodobox_test:1.0 '/quit' Enter
tmux send-keys -t dodobox_test:1.1 '/quit' Enter

# 重新启动并登录
tmux send-keys -t dodobox_test:1.0 'pnpm cli' Enter
tmux send-keys -t dodobox_test:1.0 'bob' Enter
tmux send-keys -t dodobox_test:1.0 'bbbb' Enter

tmux send-keys -t dodobox_test:1.1 'pnpm cli' Enter
tmux send-keys -t dodobox_test:1.1 'david' Enter
tmux send-keys -t dodobox_test:1.1 'dddd' Enter

# 验证：应显示 "Logging in as @xxx..." 和 "Welcome back!"
# 验证：联系人应自动加载（显示 "N contact(s) loaded"）
# 验证：可直接 /select 对方，无需重新 /add
```

## 检查命令

```bash
# 查看窗口输出
tmux capture-pane -t dodobox_test:1.0 -p   # Bob 窗口
tmux capture-pane -t dodobox_test:1.1 -p   # David 窗口

# 查看联系人列表
tmux send-keys -t dodobox_test:1.0 '/contacts' Enter
```

## 清理

```bash
# 退出 CLI
tmux send-keys -t dodobox_test:1.0 '/quit' Enter
tmux send-keys -t dodobox_test:1.1 '/quit' Enter

# 关闭 tmux 会话
tmux kill-session -t dodobox_test

# 清理用户数据（可选）
rm -rf ~/.dodobox
```

## 验证清单

| 检查项 | 预期结果 |
|--------|----------|
| 注册成功 | 显示 pubkey，连接 relay 成功 |
| 消息发送 | `✅ Sent! (N relays)` |
| 消息接收 | `📨 From xxx: "消息内容"` |
| 登录成功 | `Logging in as @xxx...` → `Welcome back!` |
| 联系人持久化 | 登录后显示 `N contact(s) loaded` |
| 直接 select | 无需重新 /add，可直接 `/select name` |

## 常见问题

### 消息发送失败
- 检查 relay 是否运行：`docker ps` 或 `netstat -an | grep 7778`
- 检查 relay.ts 配置是否正确

### 登录失败 / 解密错误
- 确保清理了旧数据：`rm -rf ~/.dodobox`
- 检查 vault-crypto 加密逻辑是否正确

### npx tsx 安装冲突
- 清理 npm 缓存：`rm -rf ~/.npm/_npx`