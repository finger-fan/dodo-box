# E2E Testing Protocol

End-to-end testing workflow for dodo-box application using Chrome DevTools MCP.

## Pre-requisites

1. Dev server must be running (`npm run dev`)
2. Chrome browser with DevTools MCP available

## Testing Protocol

1. **Start dev server** if not running
2. **Open browser** via chrome-devtools MCP
3. **Follow testing guide** in `docs/testing/` (if exists)
4. **NEVER click delete** unless explicitly instructed
5. **Report all bugs** found with screenshots

## Safety Rules

- **CRITICAL**: Always dismiss confirmation dialogs unless explicitly confirming deletion
- **CRITICAL**: Never click delete buttons accidentally
- Take snapshots before/after critical actions
- Document any unexpected UI states

## Test Scenarios

### Single-Account Testing
- Login flow
- Identity creation
- Contacts management
- Chat/messaging features

### Multi-Account Testing
- Identity switching
- Cross-identity data isolation
- Vault-based authentication

## Bug Reporting Format

When bugs are found, document:
1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Screenshot (if applicable)
5. Browser console errors (if any)

## Quick Commands

```
# Start dev server
npm run dev

# Open test page
navigate to http://localhost:3000
```
