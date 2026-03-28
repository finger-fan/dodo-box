---
description: Publish Android APK — switch to release branch, sync Android version from package.json, build signed APK, create PUBLISHLOG.md, then commit/push and merge back to dev.
---

# Publish Command

Android APK publishing pipeline for dodo-box:
1. Switch to `release` branch and pull latest
2. Read current versions from `package.json` and `build.gradle`
3. Update Android `versionName` and increment `versionCode` in `build.gradle`
4. Build release APK using Capacitor
5. Verify APK output and collect file info
6. Summarize changes and write to `PUBLISHLOG.md`
7. Commit and push version changes
8. Merge release back into dev
9. Report APK location and next steps

---

## Prerequisites — Android Build Environment

Before running this command, the machine must have the Android build toolchain installed. If missing, follow these steps to set it up (tested on Ubuntu/Debian):

### 1. Install JDK 21

AGP (Android Gradle Plugin) 8.13 requires JDK 17+. We use JDK 21:

```bash
sudo apt-get update
sudo apt-get install -y openjdk-21-jdk
```

Set `JAVA_HOME` (add to `~/.bashrc` or `~/.profile`):

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH="$JAVA_HOME/bin:$PATH"
```

Verify: `java -version` should show `openjdk version "21.x.x"`.

### 2. Install Android SDK

Download and install the command-line tools:

```bash
sudo mkdir -p /opt/android-sdk/cmdline-tools
cd /tmp
wget https://dl.google.com/android/repository/commandlinetools-linux-latest.zip
unzip commandlinetools-linux-latest.zip
sudo mv cmdline-tools /opt/android-sdk/cmdline-tools/latest
```

Set environment variables (add to `~/.bashrc` or `~/.profile`):

```bash
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

### 3. Install required SDK components

This project requires:
- **compileSdkVersion / targetSdkVersion**: 36
- **minSdkVersion**: 24
- **Build-Tools**: 35.0.0, 36.0.0
- **Platform-Tools**: latest

```bash
sdkmanager --sdk_root=/opt/android-sdk \
  "platforms;android-36" \
  "build-tools;35.0.0" \
  "build-tools;36.0.0" \
  "platform-tools"
```

Accept licenses:

```bash
yes | sdkmanager --sdk_root=/opt/android-sdk --licenses
```

### 4. Gradle (no manual install needed)

The project includes a Gradle wrapper (`android/gradlew`) that auto-downloads **Gradle 8.14.3**. No manual Gradle installation is required. On first build, it will download automatically.

### 5. Verify environment

Run these checks before proceeding:

```bash
java -version                    # Should be 21.x
echo $ANDROID_HOME               # Should be /opt/android-sdk
sdkmanager --list_installed       # Should show platforms;android-36, build-tools;36.0.0
cd android && ./gradlew --version # Should show Gradle 8.14.3
```

If any check fails, fix it before continuing. The APK build will fail without a proper environment.

### Version Reference (as of 2026-03-28)

| Component | Version | Notes |
|-----------|---------|-------|
| JDK | OpenJDK 21 | Required by AGP 8.13 (minimum JDK 17) |
| Android Gradle Plugin | 8.13.0 | Set in `android/build.gradle` |
| Gradle | 8.14.3 | Auto-downloaded by wrapper |
| compileSdkVersion | 36 | Set in `android/variables.gradle` |
| targetSdkVersion | 36 | Set in `android/variables.gradle` |
| minSdkVersion | 24 | Set in `android/variables.gradle` |
| Build-Tools | 35.0.0 + 36.0.0 | Both needed |
| Capacitor Android | 14.0.1 (cordovaAndroidVersion) | Set in `android/variables.gradle` |

---

## Step 1 — Switch to release branch

```bash
git checkout release
git pull origin release
```

If there are uncommitted changes on the current branch, abort and ask the user to commit or stash first.

Announce: "On branch: release | ready to publish Android APK"

## Step 2 — Read current versions

Read version from `package.json`:

```bash
grep '"version"' package.json | awk -F'"' '{print $4}'
```

Read current Android version info from `build.gradle`:

```bash
grep -E 'versionCode|versionName' android/app/build.gradle
```

Calculate next versionCode (increment by 1):

```bash
CURRENT_CODE=$(grep 'versionCode' android/app/build.gradle | grep -o '[0-9]\+')
NEXT_CODE=$((CURRENT_CODE + 1))
echo "versionCode: $CURRENT_CODE → $NEXT_CODE"
```

Announce: "Publishing: Android v<package_version> (versionCode <current> → <next>)"

## Step 3 — Update Android version in build.gradle

Update `versionName` to match package.json version and increment `versionCode`:

Use Edit tool on `android/app/build.gradle`:

Pattern for versionCode:
```
versionCode <current_code>
```
→
```
versionCode <next_code>
```

Pattern for versionName:
```
versionName "<current_name>"
```
→
```
versionName "<package_version>"
```

Verify changes:

```bash
grep -E 'versionCode|versionName' android/app/build.gradle
```

## Step 4 — Build Release APK

Build the release APK BEFORE committing. This ensures we only commit after a successful build.

This step is long-running so MUST use `run_in_background: true` on the Bash tool to avoid blocking, then use `TaskOutput` with `block: true` and `timeout: 600000` to wait for completion.

```bash
pnpm cap:apk:release
```

- CRITICAL: Use `run_in_background: true` for this Bash call — the build often takes 5-10 minutes and will otherwise time out
- After the build completes, read the output to check for errors
- If the build fails:
  1. Revert the version changes: `git checkout -- android/app/build.gradle`
  2. Print the error
  3. STOP — do NOT commit or push

## Step 5 — Verify APK output

Check if the APK was generated:

```bash
ls -lh android/app/build/outputs/apk/release/*.apk
```

Get APK file details (size, name):

```bash
APK_PATH=$(find android/app/build/outputs/apk/release -name "*.apk" -type f | head -1)
APK_SIZE=$(ls -lh "$APK_PATH" | awk '{print $5}')
APK_NAME=$(basename "$APK_PATH")
echo "APK: $APK_NAME"
echo "Size: $APK_SIZE"
echo "Path: $APK_PATH"
```

## Step 6 — Summarize changes and write PUBLISHLOG.md

Gather changes since the last tag (or all commits if no tag exists):

```bash
git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline
```

Use these commits to write a human-readable publish log entry. Group changes by type:
- `feat` / `fix` / `refactor` / `docs` / `test` / `chore`

Format to prepend into `PUBLISHLOG.md`:

```markdown
## v<version> — YYYY-MM-DD

### Features
- <summary of feat commits>

### Bug Fixes
- <summary of fix commits>

### Improvements
- <summary of refactor/chore commits>

### APK Info
- File: android/app/build/outputs/apk/release/app-release-unsigned.apk
- Version: <package_version> (versionCode: <next_code>)
- Size: <apk_size>
```

If `PUBLISHLOG.md` does not exist, create it with a header first:

```markdown
# Android Publish Log

All Android APK releases for dodo-box are documented here.

---

```

Then prepend the new entry after the header. Use the Edit tool (not shell redirection) to update the file.

## Step 7 — Commit and push

Only execute this step if the APK build succeeded.

```bash
git add android/app/build.gradle PUBLISHLOG.md
git commit -m "chore: publish android v<version> (versionCode <next_code>)"
```

Push release branch to remote:

```bash
git push origin release
```

If push fails due to diverged history, stop and report — do NOT force-push.

## Step 8 — Merge release back into dev

Switch to dev and merge release so that dev gets the version changes and publish log:

```bash
git checkout dev
git pull origin dev
git merge release --no-ff -m "merge: android publish v<version> into dev"
git push origin dev
```

If there are merge conflicts:
- List conflicted files
- Ask the user to resolve manually
- Do NOT force-push or discard changes

## Step 9 — Report

Print a summary:
- Version: v<package_version>
- Android versionCode: <next_code>
- APK file: <apk_name>
- APK size: <apk_size>
- APK path: android/app/build/outputs/apk/release/<apk_name>
- Branch pushed: release
- Merged to dev: yes/no

### Signing Reminder

The generated APK is **unsigned** and cannot be installed on devices without signing.

To sign the APK for release:

1. Generate a keystore (one-time setup):
   ```bash
   keytool -genkey -v -keystore my-release-key.keystore -alias my-alias -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Sign the APK:
   ```bash
   jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore my-release-key.keystore android/app/build/outputs/apk/release/app-release-unsigned.apk my-alias
   ```

3. Align the APK (optional but recommended):
   ```bash
   zipalign -v 4 android/app/build/outputs/apk/release/app-release-unsigned.apk android/app/build/outputs/apk/release/dodobox-v<version>.apk
   ```

Or configure automatic signing in `android/app/build.gradle` by adding signing config.

## Rules

- ALWAYS publish from the `release` branch — never from `dev` or `main`
- NEVER skip the PUBLISHLOG.md step
- NEVER force-push to `release`
- NEVER commit or push if `pnpm cap:apk:release` fails — revert local changes instead
- Return to `dev` branch after publishing completes
- NEVER skip merging release back to dev (Step 8) — this is critical
- If build fails, check logs FIRST before proposing fixes
- Use `pnpm` (not `npm`) for all package operations
- The APK is unsigned by default — remind user about signing for distribution
- VersionCode must always increment — never reuse or decrement
