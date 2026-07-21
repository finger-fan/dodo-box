# TODO

## 设置存储重构：加密 JSON 对象

### 现状
当前所有设置项分散存储在 localStorage 中，使用多个独立的 key：

| 设置项 | localStorage Key |
|--------|------------------|
| 屏显时间 | `dodobox_mask_seconds` |
| 字符集 | `dodobox_mask_charset` |
| 消息 TTL | `dodobox_message_ttl` |
| 联系人缓存开关 | `dodobox_contact_cache` |
| 联系人缓存数据 | `dodobox_contacts_cache_{pubkey}` |
| 聊天缓存数据 | `dodobox_chats_cache_{pubkey}` |
| 用户 relays | `dodobox_user_relays` |
| 适配器模式 | `dodobox_adapter_mode` |
| 语言 | `dodobox_language` |
| 截屏设置 | `dodobox_allow_screenshot` |
| 登录状态 | `dodobox_account_active` |
| 用户名 | `dodobox_current_user` |
| 会话数据 | `dodobox_session` |

### 目标
将所有设置项整合成**一个加密的 JSON 对象**，存储为 Base64 字符串。

### 存储格式
```
JSON 对象 → 加密 → 二进制 → Base64 字符串
```

解密后得到包含所有设置项的 JSON：

```json
{
  "mask_seconds": 5,
  "mask_charset": "blocks",
  "message_ttl": 2592000,
  "contact_cache": false,
  "allow_screenshot": false,
  "language": "zh",
  "theme": "system",
  "relays": ["wss://relay.damus.io"],
  // ...
}
```

### 实现要点
1. **加密算法选择**：AES-GCM（Web Crypto API）
2. **密钥管理**：用户密码派生 或 设备级密钥
3. **迁移策略**：首次读取旧 key 后合并到新格式，删除旧 key
4. **向后兼容**：检测旧格式并自动迁移

### 优势
- 减少 localStorage key 数量
- 统一管理所有设置
- 加密保护敏感数据
- 便于导出/导入用户配置

### 相关 Issue
待创建