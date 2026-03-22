---
description: Show all current changes in the codebase, including modified files, diff stats, and untracked files.
---

# Changes Command

Display a comprehensive summary of all modifications made since the last commit. Use this before `/ship` to review what will be committed.

Usage:
- `/changes` — Show complete changes summary
- `/changes --full` — Show full diff content in addition to stats

## Arguments
- `--full` (optional): Show complete diff output instead of just statistics

---

## Step 1 — Get current git state

Run these in parallel:
```bash
git status
git diff --stat HEAD
git diff --cached --stat
git log --oneline -5
```

## Step 2 — Display summary

First show a high-level overview:
- Current branch: `$(git branch --show-current)`
- Last commit: `$(git log --oneline -1 --no-decorate)`
- Working tree status: Clean / Modified / Untracked files present

## Step 3 — List modified files

Categorize and display files:
1. **Staged changes** (already added to commit):
   - `git diff --cached --name-only`

2. **Unstaged changes** (modified but not added):
   - `git diff --name-only`

3. **Untracked files** (not yet tracked by git):
   - `git ls-files --others --exclude-standard`

## Step 4 — Show diff stats

Display detailed change statistics:
```
Changes summary:
$(git diff --stat HEAD)
```

## Step 5 — (Optional) Show full diff

If `$ARGUMENTS` contains `--full`:
```bash
echo "=== Full diff ==="
git diff HEAD
```

## Step 6 — Recommend next steps

Based on the changes, suggest:
- If there are unstaged changes: "Run `git add <files>` to stage changes for commit"
- If there are staged changes: "Run `/ship` to commit and push these changes"
- If working tree is clean: "No changes to commit"

## Rules
- Do NOT make any modifications to the repository, this is a read-only command
- Always show both staged and unstaged changes
- Highlight if there are any sensitive files (`.env`, secrets, etc.) that might be accidentally committed
