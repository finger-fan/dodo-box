# 全流程测试

并行执行全套测试（单元/集成 + E2E + 类型检查/Lint），汇总生成中文测试报告。

## 执行策略

使用 3 个 subagent 并行运行，最大化效率：

### Agent 1: 单元/集成测试 + 覆盖率

运行以下命令并收集结果：
```bash
cd $PROJECT_DIR && pnpm test 2>&1
cd $PROJECT_DIR && pnpm test:coverage 2>&1
```

报告内容：
- 测试文件数、用例总数、通过/失败/跳过数
- 失败用例名称和错误信息
- 覆盖率摘要（语句、分支、函数、行百分比）
- 按模块的覆盖率明细

### Agent 2: E2E 测试 (Playwright)

运行以下命令并收集结果：
```bash
cd $PROJECT_DIR && pnpm test:e2e 2>&1
```

报告内容：
- 测试文件和用例状态
- 失败用例的错误信息和截图路径
- 运行时间

### Agent 3: Lint + 类型检查

运行以下命令并收集结果：
```bash
cd $PROJECT_DIR && pnpm check 2>&1
```

报告内容：
- TypeScript 错误（文件、行号、错误信息）
- ESLint 错误或警告
- 整体通过/失败状态

## 输出要求

等待全部 agent 完成后，汇总生成**中文测试报告**，包含以下章节：

1. **总览表格** — 各类测试的通过/失败汇总
2. **单元/集成测试详情** — 覆盖率统计 + 按模块明细
3. **E2E 测试详情** — 按文件列出用例状态 + 失败分析
4. **编译器警告** — 非阻塞但需关注的警告
5. **结论与建议** — 整体状态评估 + 待改进项

将报告写入 `docs/reports/test-report-{YYYY-MM-DD}.md`（使用当天日期）。

## 注意事项

- 所有 3 个 agent 必须使用 `run_in_background: true` 并行启动
- 使用 `subagent_type: "general-purpose"` 类型
- 如果 E2E 有失败用例，分析是功能缺陷还是 flaky（竞态/超时）问题
- 覆盖率目标为 80%，低于此值需在报告中标注
