---
name: cli-test-skill
description: CLI 本地 relay 测试 skill 位置和用法
metadata:
  type: reference
---

## CLI 测试 Skill

**位置**: `.claude/skills/cli-test/SKILL.md`

**用途**: 自动化测试 DodoBox CLI 与本地 relay 的消息收发功能

**调用方式**: 用户说 "运行 CLI 测试" 或 "测试 CLI 本地 relay"

**测试用户**:
- bob:bbbb
- david:dddd

**主要验证点**:
1. 注册流程
2. 消息双向收发
3. 登录流程（加密解密）
4. 联系人持久化

**前置条件**: 本地 relay 监听 `ws://localhost:7778`