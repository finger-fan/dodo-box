---
description: Commit all changes and push to a branch. If a different branch name is provided, merges current branch into target branch first.
---

# Ship Command

Commit staged/unstaged changes and push to a branch. Accepts an optional target branch as argument.

Usage:
- `/ship` — commit and push to the current branch
- `/ship main` — commit on current branch, then merge into `main` and push `main`
- `/ship release/1.0` — commit on current branch, then merge into `release/1.0` and push it

## Arguments

Target branch (optional): `$ARGUMENTS`

---

## Step 1 — Gather current state

Run these in parallel:
```bash
git status
git diff --stat HEAD
git branch --show-current
git log --oneline -5
```

## Step 2 — Determine target branch

- If `$ARGUMENTS` is empty → target branch = current branch
- If `$ARGUMENTS` is set → target branch = `$ARGUMENTS`
- Announce: "Current branch: X | Target branch: Y"

## Step 3 — Stage all changes

```bash
git add -A
```

Warn the user if any of these are staged (and abort if confirmed sensitive):
- `.env*` files
- `*secret*`, `*credential*`, `*key*` files

## Step 4 — Write commit message

Analyze the diff with `git diff --cached` and compose a conventional commit message:
- Type: feat / fix / refactor / docs / test / chore / perf
- Subject: ≤72 chars, imperative mood, no period
- Body: optional, only if the change needs explanation

Commit:
```bash
git commit -m "$(cat <<'EOF'
<type>: <subject>

<optional body>
EOF
)"
```

If nothing to commit, print "Nothing to commit — working tree clean." and stop.

## Step 5 — Push or merge-then-push

### Case A: target branch == current branch
```bash
git push origin <current-branch>
```
If the remote branch doesn't exist yet, add `-u`:
```bash
git push -u origin <current-branch>
```

### Case B: target branch != current branch

1. Push current branch first (safe backup):
```bash
git push -u origin <current-branch>
```

2. Switch to target branch (create if it doesn't exist):
```bash
git checkout <target-branch> 2>/dev/null || git checkout -b <target-branch>
git pull origin <target-branch> --rebase 2>/dev/null || true
```

3. Merge current branch into target:
```bash
git merge <current-branch> --no-ff -m "merge: <current-branch> into <target-branch>"
```

If there are merge conflicts:
- List conflicted files
- Ask the user to resolve manually, then re-run `/ship`
- Do NOT force-push or discard changes

4. Push target branch:
```bash
git push -u origin <target-branch>
```

5. Switch back to original branch:
```bash
git checkout <current-branch>
```

## Step 6 — Report

Print a summary:
- Commit hash and message
- Branch pushed
- Remote URL (from `git remote get-url origin`)

## Rules

- NEVER use `--force` or `--no-verify`
- NEVER push to `main` directly if the target is `main` and there are unreviewed changes — warn the user
- NEVER skip pre-commit hooks
- NEVER commit `.env` files or secrets
