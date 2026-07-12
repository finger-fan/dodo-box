# CLI 联系人系统测试计划

## 测试目标

验证联系人系统重构后的功能：
1. 联系人存储从本地文件迁移到 relay（kind:3 NIP-02）
2. `/select` 命令：选择联系人后直接发送消息
3. `/add` 和 `/remove` 后自动同步到 relay

## 测试环境

- Node.js 环境
- 项目根目录：`/Users/david/_projects/2_personal/projects/dodo-box`
- 分支：`feat/cli-first`
- 测试命令：`npx tsx cli/main.ts`

## 前置条件

1. 确保 relay 可访问（默认：wss://relay.damus.io, wss://nos.lol, wss://relay.nostr.band）
2. 清理旧的测试数据（如有）：
   ```bash
   rm -rf ~/.dodobox
   ```

## 测试用例

### 测试 1：启动并注册两个账户

**步骤**：
1. 终端 A：`npx tsx cli/main.ts`
2. 输入用户名 `alice`，密码 `test123`
3. 记录显示的 pubkey（前 16 位）
4. 终端 B：新开一个终端，同样运行 `npx tsx cli/main.ts`
5. 输入用户名 `bob`，密码 `test456`
6. 记录显示的 pubkey（前 16 位）

**预期结果**：
- 两个终端都显示 `Connected to X/3 relays`
- 两个终端都显示 `Fetching contacts from relay...`
- 两个终端都显示 `0 contact(s) loaded`（新用户）
- 两个终端都进入交互模式，显示 `> ` 提示符

**验证点**：
- [ ] alice 注册成功，显示 pubkey
- [ ] bob 注册成功，显示 pubkey
- [ ] 两个账户初始联系人都为空

---

### 测试 2：添加联系人并验证 relay 同步

**在终端 A（alice）执行**：

1. 输入 `/add <bob的完整pubkey> bob`
   - 注意：使用 bob 的完整 64 位 hex pubkey
2. 观察输出

**预期结果**：
```
  ✅ Added contact: bob (2672014b...)
  📤 Contacts synced to relay.
```

3. 输入 `/contacts`
4. 观察输出

**预期结果**：
```
  Contacts (1):
  ──────────────────────────────────────
  bob                  2672014b875f9b9a...
  ──────────────────────────────────────
```

**验证点**：
- [ ] `/add` 命令成功添加联系人
- [ ] 显示 `📤 Contacts synced to relay` 表示已同步到 relay
- [ ] `/contacts` 显示刚添加的联系人

---

### 测试 3：选择联系人并发送消息

**在终端 A（alice）执行**：

1. 输入 `/select bob`
2. 观察输出

**预期结果**：
```
  ✅ Now chatting with bob (2672014b...)
```

3. 输入 `你好，这是第一条消息`
4. 观察输出

**预期结果**：
```
  Sending to bob...
  ✅ Sent! (X relays)
```

5. 继续输入 `这是第二条消息`
6. 观察输出

**预期结果**：
```
  Sending to bob...
  ✅ Sent! (X relays)
```

**在终端 B（bob）观察**：

等待几秒后，观察是否收到消息。

**预期结果**：
```
📨 From alice: "你好，这是第一条消息"

> 
📨 From alice: "这是第二条消息"
```

**验证点**：
- [ ] `/select` 成功选择联系人
- [ ] 选择后直接输入文字即可发送，无需再输入 pubkey
- [ ] bob 收到两条消息
- [ ] 消息显示发送者名称（alice）而非 pubkey

---

### 测试 4：切换联系人

**在终端 A（alice）执行**：

1. 输入 `/select`（不带参数）
2. 观察输出

**预期结果**：
```
  Currently chatting with: bob (2672014b...)
```

3. 输入 `/unselect`
4. 观察输出

**预期结果**：
```
  Cleared contact: bob
```

5. 输入 `这条消息发不出去`
6. 观察输出

**预期结果**：
```
  Unknown command or no contact selected. Type /help for options.
```

**验证点**：
- [ ] `/select`（无参数）显示当前选中的联系人
- [ ] `/unselect` 清除选择
- [ ] 未选择联系人时，直接输入文字提示错误

---

### 测试 5：验证联系人持久化（重启后恢复）

**在终端 A（alice）执行**：

1. 输入 `/quit` 退出

**在新终端执行**：

1. `npx tsx cli/main.ts`
2. 输入用户名 `alice`，密码 `test123`（重新登录）
3. 观察启动输出

**预期结果**：
```
Fetching contacts from relay...
  1 contact(s) loaded.
```

4. 输入 `/contacts`
5. 观察输出

**预期结果**：
```
  Contacts (1):
  ──────────────────────────────────────
  bob                  2672014b875f9b9a...
  ──────────────────────────────────────
```

**验证点**：
- [ ] 重启后联系人从 relay 恢复
- [ ] `/contacts` 显示之前添加的联系人

---

### 测试 6：删除联系人

**在终端 A（alice）执行**：

1. 输入 `/remove <bob的完整pubkey>`
2. 观察输出

**预期结果**：
```
  🗑️  Removed contact: 2672014b...
  📤 Contacts synced to relay.
```

3. 输入 `/contacts`
4. 观察输出

**预期结果**：
```
  No contacts yet. Use /add <pubkey> [name] to add one.
```

**验证点**：
- [ ] `/remove` 成功删除联系人
- [ ] 显示 `📤 Contacts synced to relay` 表示已同步到 relay
- [ ] `/contacts` 显示联系人为空

---

### 测试 7：历史消息查询

**前置条件**：测试 3 中 alice 和 bob 已经互相发送过消息

**在终端 B（bob）执行**：

1. 输入 `/history <alice的完整pubkey>`
2. 观察输出

**预期结果**：
```
  Fetching history with 786ee6d1...

  Recent messages (2):
  ──────────────────────────────────────
  [时间] alice...: "你好，这是第一条消息"
  [时间] alice...: "这是第二条消息"
  ──────────────────────────────────────
```

**验证点**：
- [ ] `/history` 从 relay 获取历史消息
- [ ] 显示消息时间、发送者、内容

---

## 测试报告模板

测试完成后，填写以下报告：

```
测试日期：YYYY-MM-DD
测试人员：[AI/人工]

测试用例执行结果：
1. 启动并注册两个账户：[ ] 通过 [ ] 失败
2. 添加联系人并验证 relay 同步：[ ] 通过 [ ] 失败
3. 选择联系人并发送消息：[ ] 通过 [ ] 失败
4. 切换联系人：[ ] 通过 [ ] 失败
5. 验证联系人持久化（重启后恢复）：[ ] 通过 [ ] 失败
6. 删除联系人：[ ] 通过 [ ] 失败
7. 历史消息查询：[ ] 通过 [ ] 失败

总计：X/7 通过

问题记录：
- [列出发现的问题，如果没有则写"无"]

测试结论：
- [ ] 所有功能正常，可以合并
- [ ] 存在问题，需要修复
```

## 注意事项

1. **relay 连接**：如果某个 relay 连接失败，消息仍可能通过其他 relay 发送成功
2. **pubkey 格式**：必须是 64 位 hex 字符串，可以从启动时显示的前 16 位推断完整 pubkey
3. **消息延迟**：消息通过 relay 转发，可能有几秒延迟
4. **重复消息**：如果同一个消息从多个 relay 到达，可能会显示多次（已知问题，未修复）

## 故障排查

### 问题：联系人添加后显示但没有同步
**可能原因**：relay 连接失败
**排查**：运行 `/status` 检查 relay 连接状态

### 问题：消息发送失败
**可能原因**：所有 relay 都不可达
**排查**：
1. 运行 `/status` 检查 relay 连接
2. 检查网络环境

### 问题：重启后联系人丢失
**可能原因**：kind:3 事件发布失败
**排查**：
1. 添加联系人时是否看到 `📤 Contacts synced to relay`
2. 检查 relay 是否正常

---

*文档版本：1.0*
*创建日期：2026-07-12*
*关联计划：docs/contacts-relay-plan.md*
