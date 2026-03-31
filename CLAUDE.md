# AI Dev Hub — Developer Guide

## Commit Message Convention

Every commit that resolves or progresses a tracked task **must** reference the task ID in square brackets at the end of the subject line.

### Format

```
<type>: <short description> [<TASK-ID>]
```

### Task ID Format

| Type | Prefix | Example |
|------|--------|---------|
| Bug | `BUG` | `BUG-001` |
| Feature | `FEAT` | `FEAT-012` |
| Architecture / Task | `ARCH` | `ARCH-003` |

### Examples

```
fix: prevent duplicate inbox items on rapid submit [BUG-007]
feat: add voice input to business manager chat [FEAT-015]
chore: extract triage agent into standalone service [ARCH-002]
refactor: simplify task status state machine [ARCH-009]
docs: update webhook setup instructions [ARCH-011]
```

### Why This Matters

The GitHub webhook at `POST /api/webhooks/github` handles two event types, both of which automatically advance task status to **Quality Review**:

**Primary — PR merge (pull_request event):** When a pull request is merged to the default branch, the server extracts the task ID from the branch name. Branch names follow the format created by the "Start Work" button: `{taskId}/{description}` (e.g. `feat-015/add-voice-input`). The part before the first `/` is uppercased to form the task ID (`FEAT-015`).

**Fallback — push event:** When commits are pushed directly to main, commit messages containing a task ID in `[TASK-ID]` format (e.g. `[FEAT-015]`) trigger the status update. A single commit may reference multiple task IDs:

```
fix: resolve rate-limit edge cases affecting triage and inbox [BUG-004] [BUG-005]
```

Tasks already in **Done** are left untouched in both paths.

## GitHub Webhook Setup

To activate automatic task advancement in a repository:

1. Go to your repo on GitHub → **Settings → Webhooks → Add webhook**
2. Set **Payload URL** to:
   ```
   https://<your-replit-domain>/api/webhooks/github
   ```
3. Set **Content type** to `application/json`
4. Set **Secret** to the value of your `GITHUB_WEBHOOK_SECRET` environment variable
5. Choose **Let me select individual events**, then check:
   - **Pull requests** (for PR merge detection — primary flow)
   - **Pushes** (for direct commit fallback)
6. Click **Add webhook**

The repository must also be registered in AI Dev Hub (Settings → Repositories) with the correct **Owner** and **Repo** fields matching the GitHub repository.

## Task Status Flow

```
Open → In Progress → Quality Review → Done
```

- **In Progress** — triggered when a developer copies the auto-generated Cursor/Claude prompt from the task panel
- **Quality Review** — triggered automatically by a GitHub push containing the task ID in a commit message
- **Done** — set manually after review passes
