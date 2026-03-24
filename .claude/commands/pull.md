---
description: Pull latest changes from remote repository. If a branch name is provided, pulls from that specific branch.
---

# Pull Command

Pull latest changes from the remote repository. Accepts an optional target branch as argument.

Usage:
- `/pull` — pull latest changes to the current branch
- `/pull main` — pull latest changes from `main` branch into current branch
- `/pull dev` — pull latest changes from `dev` branch into current branch

## Arguments

Source branch (optional): `$ARGUMENTS`

---

## Step 1 — Gather current state

Run these in parallel:
```bash
git status
git branch --show-current
git remote -v
```

## Step 2 — Determine source branch

- If `$ARGUMENTS` is empty → source branch = current branch
- If `$ARGUMENTS` is set → source branch = `$ARGUMENTS`
- Announce: "Current branch: X | Pulling from: origin/Y"

## Step 3 — Check for uncommitted changes

If there are uncommitted changes:
- Warn the user: "You have uncommitted changes. These will be stashed temporarily before pulling."
- Stash changes:
```bash
git stash push -m "autostash before pull"
```

## Step 4 — Pull latest changes

### Case A: source branch == current branch
```bash
git pull origin <current-branch> --rebase
```

### Case B: source branch != current branch
```bash
git pull origin <source-branch> --rebase
```

If there are merge conflicts:
- List conflicted files
- Ask the user to resolve conflicts manually
- After resolving, user can run `git rebase --continue` to complete the pull

## Step 5 — Restore stashed changes (if any)

If changes were stashed in Step 3:
```bash
git stash pop
```
If there are conflicts when applying stash:
- List conflicted files
- Ask the user to resolve manually

## Step 6 — Report

Print a summary:
- Pull status (success / conflicts)
- Number of files changed
- Current HEAD commit hash
- If changes were stashed and restored, mention that

## Rules

- NEVER use `--force` unless explicitly instructed by the user
- Always use `--rebase` by default to keep commit history clean
- Never discard uncommitted changes without user confirmation
- If merge conflicts occur, do not attempt to resolve automatically — always ask the user for manual resolution
