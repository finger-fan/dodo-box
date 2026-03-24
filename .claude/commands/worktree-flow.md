---
name: worktree-flow
description: Create a git worktree, enter plan mode, and guide through TDD development workflow
allowed_tools:
  - Bash
  - Glob
  - Grep
  - Read
  - Write
  - AskUserQuestion
  - ExitPlanMode
---

# Worktree Flow Command

Create a git worktree for feature development, enter plan mode to discuss the implementation plan, then guide through TDD workflow.

## Arguments

Work description (required): `$ARGUMENTS`

---

## Step 1 — Extract branch name

Parse `$ARGUMENTS` to extract the branch name:

1. Look for existing branch prefixes: `feat-`, `fix-`, `refactor-`, `docs-`, `test-`, `chore-`
2. If found a prefix, use the name after it (e.g., "add login feature" → `feat-add-login`)
3. If no prefix found, ask the user to confirm a sanitized version of the prompt or specify a branch name

Announce: "Extracted branch name: `X`"

## Step 2 — Verify git status

```bash
git status
git branch --show-current
```

Confirm we're on `dev` or `main` branch.

## Step 3 — Create worktree

```bash
git worktree add ../wt-{branch_name} -b {branch_name}
```

If worktree already exists, ask to remove it or use existing one.

## Step 4 — Confirm with user

Tell the user:
- "Worktree created at `../wt-{branch_name}`"
- "This will start a new session in the worktree directory"
- "You'll need to run me again from the worktree to continue"

Ask: "Should I switch to the worktree now? (yes/no)"

If yes, provide instructions:
```bash
cd ../wt-{branch_name}
```

Then tell the user to re-invoke `/worktree-flow` or use `/plan` directly in the new session.

---

## Plan Mode Workflow (for new session)

Once in the worktree, when user invokes this command again or uses `/plan`:

## Step 5 — Enter plan mode

Use **ExitPlanMode** tool or tell the user to use `/plan` to discuss the implementation.

## Step 6 — Create plan document

After plan is confirmed, create:

1. **`docs/{branch_name}-plan.md`** - Full implementation plan with:
   - Overview
   - Requirements from prompt
   - Implementation steps
   - Technical decisions

2. **`docs/{branch_name}-todo.md`** - TODOLIST with checkboxes:
   ```markdown
   ## TODOLIST
   - [ ] Step 1 description
   - [x] Completed step
   - [ ] Step 3 description
   ```

## Step 7 — Guide development

Tell the user to use `/tdd` to start TDD workflow:
- Write tests first
- Implement code
- Run tests until passing
- Target 90%+ coverage

## Step 8 — Code review

After tests pass, tell the user to use `/code-review` for code review.

## Step 9 — Generate review report

After code review, create **`docs/{branch_name}-review.md`** with:
- Summary
- Issues found (CRITICAL/HIGH/MEDIUM)
- Recommendations

---

## Rules

- NEVER create worktree from a non-main branch
- NEVER force push to shared branches
- Always confirm branch name before creating worktree
- Save all documentation to `docs/` directory
- Update TODOLIST as progress is made
