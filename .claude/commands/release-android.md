---
description: 发布安卓版本 — 构建 APK，复制到下载站点目录，更新 versions.json
---

# 发布安卓版本

构建 APK 并更新本地下载站点，使新版本出现在下载页面上。

## 步骤

### 1. 构建 Release APK

使用 `run_in_background: true` 执行，然后用 `TaskOutput` 等待完成（timeout: 600000）：

```bash
pnpm cap:apk:release
```

构建完成后检查输出：

```bash
ls -lh android/app/build/outputs/apk/release/*.apk
```

如果构建失败，停止并报告错误，不执行后续步骤。

### 2. 获取版本信息

从 `android/app/build.gradle` 读取 versionName：

```bash
grep 'versionName' android/app/build.gradle | grep -oP '"\K[^"]+'
```

获取今天的日期（YYYYMMDD 格式）：

```bash
date +%Y%m%d
```

### 3. 复制 APK 到下载站点

APK 文件名格式：`dodo-box-{version}-{date}.apk`

```bash
APK_SRC=$(ls -1 android/app/build/outputs/apk/release/*.apk | head -1)
APK_DST="docker/download-site/apk/dodo-box-${VERSION}-${DATE}.apk"
mkdir -p docker/download-site/apk
cp "$APK_SRC" "$APK_DST"
```

### 4. 更新 versions.json

读取 `docker/download-site/versions.json`，在数组头部插入新条目：

```json
{
  "version": "<versionName>",
  "date": "<YYYY-MM-DD>",
  "file": "dodo-box-<version>-<date>.apk"
}
```

用 Read 工具读取当前 versions.json，解析 JSON，prepend 新条目，用 Write 工具写回。

日期格式为 `YYYY-MM-DD`（带连字符），用于页面显示。

### 5. 报告结果

输出：
- 版本号
- APK 文件名和大小
- 下载页面本地路径：`docker/download-site/`
- 提示：需要将 `docker/download-site/` 目录同步到 VPS 服务器

## 规则

- 使用 `pnpm`，不用 npm
- 构建失败时必须停止，不更新 versions.json
- APK 文件名必须遵循 `dodo-box-{version}-{date}.apk` 格式
- versions.json 中最新的版本在最前面
