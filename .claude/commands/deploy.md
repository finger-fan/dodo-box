---
description: Deploy the app — bump patch version, build Docker image, and restart containers via docker compose.
---

# Deploy Command

Full deployment pipeline for dodo-box:
1. Bump `patch` version in `package.json`
2. Build Docker image (`docker compose build app`)
3. Restart container (`docker compose up -d`)

---

## Step 1 — Read current version

```bash
node -e "console.log(require('./package.json').version)"
```

Calculate next patch version (e.g. `0.8.0` → `0.8.1`).

Announce: "Deploying: v<current> → v<next>"

## Step 2 — Bump patch version in package.json

Use the Edit tool to update only the `"version"` field in `package.json`.
Do NOT run `npm version` or any git tagging — just edit the file directly.

Pattern to update:
```
"version": "<current>",
```
→
```
"version": "<next>",
```

Verify the change:
```bash
node -e "console.log(require('./package.json').version)"
```

## Step 3 — Build Docker image

```bash
docker compose build app
```

- Watch for build errors. If the build fails, print the error and stop — do NOT proceed to step 4.
- The build includes `pnpm run build` (Next.js) internally via the Dockerfile.

## Step 4 — Restart container

```bash
docker compose up -d app
```

This recreates only the `app` service without touching the `relay` service.

## Step 5 — Verify deployment

```bash
docker compose ps
```

Confirm `dodo-box-app` shows `Up` status.

Optionally tail the last 20 lines of logs to catch startup errors:
```bash
docker compose logs --tail=20 app
```

## Step 6 — Report

Print a summary:
- Version bumped: vX.X.X → vX.X.X
- Image built: success / failed
- Container status: Up / Error
- Access: http://127.0.0.1:18300 (internal) — if behind a reverse proxy, remind user to check the public URL

## Rules

- NEVER skip the build step and go directly to `up`
- NEVER touch the `relay` service unless explicitly asked
- NEVER bump minor or major versions — only patch
- If `docker compose build` fails, stop and report the error without running `up`
