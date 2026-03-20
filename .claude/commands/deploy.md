---
description: Deploy the app — switch to release branch, bump patch version, update CHANGELOG, tag the release, push to remote, build Docker image, and restart containers.
---

# Deploy Command

Full deployment pipeline for dodo-box:
1. Switch to `release` branch and pull latest
2. Bump `patch` version in `package.json`
3. Summarize changes since last tag and write to `CHANGELOG.md`
4. Commit version bump + changelog
5. Create annotated git tag `v<next>`
6. Push `release` branch and tag to remote
7. Build Docker image (`docker compose build app`)
8. Restart container (`docker compose up -d app`)

---

## Step 1 — Switch to release branch

```bash
git checkout release
git pull origin release
```

If there are uncommitted changes on the current branch, abort and ask the user to commit or stash first.

Announce: "On branch: release | ready to deploy"

## Step 2 — Read current version

```bash
node -e "console.log(require('./package.json').version)"
```

Calculate next patch version (e.g. `0.8.0` → `0.8.1`).

Announce: "Deploying: v<current> → v<next>"

## Step 3 — Summarize changes and write CHANGELOG.md

Gather changes since the last tag (or all commits if no tag exists):

```bash
git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline
```

Also collect the full diff summary:

```bash
git diff $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --stat
```

Use these commits and diff stats to write a human-readable changelog entry. Group changes by type:
- `feat` / `fix` / `refactor` / `docs` / `test` / `chore`

Format to prepend into `CHANGELOG.md`:

```markdown
## v<next> — YYYY-MM-DD

### Bug Fixes
- <summary of fix commits>

### Features
- <summary of feat commits>

### Improvements
- <summary of refactor/chore commits>

### Changed Files
- <list key files changed with one-line description>
```

If `CHANGELOG.md` does not exist, create it with a header first:

```markdown
# Changelog

All notable changes to dodo-box are documented here.

---

```

Then prepend the new entry after the header. Use the Edit tool (not shell redirection) to update the file.

## Step 4 — Bump patch version in package.json

Use the Edit tool to update only the `"version"` field in `package.json`.

Pattern to update:
```
"version": "<current>",
```
→
```
"version": "<next>",
```

Verify:
```bash
node -e "console.log(require('./package.json').version)"
```

## Step 5 — Commit version bump + changelog

```bash
git add package.json CHANGELOG.md
git commit -m "chore: release v<next>"
```

## Step 6 — Create annotated git tag

```bash
git tag -a v<next> -m "release v<next>"
```

Verify:
```bash
git tag --sort=-version:refname | head -3
```

## Step 7 — Push release branch and tag to remote

```bash
git push origin release
git push origin v<next>
```

If push fails due to diverged history, stop and report — do NOT force-push.

## Step 8 — Build Docker image

Build the Docker image with the version tag. This step is long-running so MUST use `run_in_background: true` on the Bash tool to avoid blocking, then use `TaskOutput` with `block: true` and `timeout: 600000` to wait for completion.

```bash
APP_VERSION=<next> docker compose build app
```

- CRITICAL: Use `run_in_background: true` for this Bash call — the build often takes 5-10 minutes and will otherwise time out
- After the build completes, read the output to check for errors
- If the build fails, print the error and stop — do NOT proceed to step 9

## Step 9 — Restart container

Pass `APP_VERSION` so the container runs the correctly tagged image:

```bash
APP_VERSION=<next> docker compose up -d app
```

This recreates only the `app` service without touching the `relay` service.

## Step 10 — Verify deployment

```bash
APP_VERSION=<next> docker compose ps
```

Confirm `dodo-box-app` shows `Up` status.

Verify the image tag is correct:
```bash
docker inspect dodo-box-app --format '{{.Config.Image}}'
```

Optionally tail the last 20 lines of logs to catch startup errors:
```bash
docker compose logs --tail=20 app
```

## Step 11 — Merge release back into dev

Switch to dev and merge release so that dev gets the version bump, changelog, and any release-only fixes:

```bash
git checkout dev
git pull origin dev
git merge release --no-ff -m "merge: release v<next> into dev"
git push origin dev
```

If there are merge conflicts:
- List conflicted files
- Ask the user to resolve manually
- Do NOT force-push or discard changes

## Step 12 — Report

Print a summary:
- Version bumped: vX.X.X → vX.X.X
- Tag created: vX.X.X
- Branch pushed: release
- Tag pushed: vX.X.X
- Image built: dodo-box:X.X.X (success / failed)
- Container status: Up / Error
- Access: http://127.0.0.1:18300 (internal)

## Rules

- ALWAYS deploy from the `release` branch — never from `dev` or `main`
- NEVER skip the changelog step
- NEVER skip the tagging step
- NEVER force-push to `release`
- NEVER touch the `relay` service unless explicitly asked
- NEVER bump minor or major versions — only patch
- If `docker compose build` fails, stop and report the error without running `up`
- Return to `dev` branch after deployment completes
