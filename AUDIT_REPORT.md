# AI Dev Hub Comprehensive Audit Report

**Date**: February 19, 2026  
**Auditor**: AI Code Review  
**Codebase**: AI Dev Hub - AI-powered development operations platform

---

## Executive Summary

The AI Dev Hub codebase is a functional MVP with a solid foundation using modern technologies (React 18, Express 5, TypeScript). However, it has **critical security vulnerabilities**, **architectural decisions that won't scale**, and several **quality and performance issues** that need attention before production use.

**Most Critical Finding**: The application has **no authentication or authorization** — all API endpoints are publicly accessible. Combined with plaintext storage of GitHub tokens and API keys, this represents an immediate security risk.

### Key Statistics

| Metric | Value |
|--------|-------|
| Total Lines of Code | ~15,000+ |
| Frontend Components | 67+ TSX files |
| API Endpoints | 40+ |
| Critical Issues | 5 |
| High Severity Issues | 8 |
| Medium Severity Issues | 12 |
| Low Severity Issues | 6 |

---

## 1. Architecture & Code Quality

### Current State

- **Monorepo structure** with clear separation: `client/`, `server/`, `shared/`
- **Tech Stack**: React 18.3.1 + Express 5.0.1 + JSON file storage (not PostgreSQL as documented)
- **TypeScript throughout** with Zod schemas for validation
- **Single routes file** at 1,978 lines handling all API logic

### Issues Found

| Issue | Location | Severity | Priority |
|-------|----------|----------|----------|
| Single monolithic routes file | `server/routes.ts` (1,978 lines) | Medium | Should-fix |
| JSON file storage instead of PostgreSQL | `server/storage.ts` | High | Must-fix |
| No separation of business logic | All logic in route handlers | Medium | Should-fix |
| Drizzle ORM configured but unused | `drizzle.config.ts` | Low | Nice-to-have |
| No service layer abstraction | `server/routes.ts` | Medium | Should-fix |

### 1.1 Monolithic Routes File

**Location**: `server/routes.ts` (lines 1-1978)

All 40+ API endpoints are defined in a single file with no separation of concerns. Business logic, data access, and request handling are all mixed together.

```typescript
// server/routes.ts - Everything in one file
import { IStorage, JsonFileStorage } from "./storage";
import Anthropic from "@anthropic-ai/sdk";

const storage: IStorage = new JsonFileStorage();
```

**Recommendation**: 
- Split routes into domain modules: `routes/businesses.ts`, `routes/tasks.ts`, `routes/manager.ts`
- Create a service layer for business logic
- Create repository classes for data access

### 1.2 JSON File Storage Architecture

**Location**: `server/storage.ts` (lines 161-164)

The entire database is a single JSON file read/written on every operation:

```typescript
function writeStore(data: StoreData) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}
```

This has severe implications:
- No concurrent access handling
- O(n) read/write for every operation
- Data corruption risk under load

**Recommendation**: Migrate to PostgreSQL using the already-configured Drizzle ORM.

---

## 2. Performance & Scalability

### Current State

- File-based storage causes I/O bottleneck on every request
- Frontend loads all components upfront (no lazy loading)
- React Query configured with `staleTime: Infinity`
- N+1 query patterns in several endpoints

### Issues Found

| Issue | Location | Severity | Priority |
|-------|----------|----------|----------|
| N+1 queries in Manager endpoint | `server/routes.ts:1366` | High | Must-fix |
| Full JSON file read/write per request | `server/storage.ts:161` | Critical | Must-fix |
| No lazy loading | `client/src/App.tsx:16-22` | Medium | Should-fix |
| `staleTime: Infinity` causing stale data | `client/src/lib/queryClient.ts:50` | High | Must-fix |
| No code splitting | `vite.config.ts` | Medium | Should-fix |
| Large icon imports | Multiple files | Low | Nice-to-have |

### 2.1 N+1 Query Pattern

**Location**: `server/routes.ts` (lines 1360-1370)

In the Manager endpoint, there's a loop that calls storage for each task:

```typescript
// For each task, get reviews and changelog
for (const task of allTasks) {
  const reviews = storage.getCodeReviews(task.id);
  // ... more processing
}
```

This reads the entire JSON store once per task.

**Recommendation**: Implement batch queries or index structures.

### 2.2 Stale Data Issue (Similar to Discussion Bug)

**Location**: `client/src/lib/queryClient.ts` (lines 44-52)

```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,  // <-- PROBLEM
      retry: false,
    },
  },
});
```

`staleTime: Infinity` means data is never considered stale, which can cause the same refresh issues seen in the Discussion feature.

**Recommendation**: Set appropriate `staleTime` values per query type:
- 30 seconds for frequently changing data (tasks, discussions)
- 5 minutes for relatively static data (businesses, projects)

### 2.3 No Lazy Loading

**Location**: `client/src/App.tsx` (lines 16-22)

All views are imported directly, causing the entire bundle to load upfront:

```typescript
import TasksView from "@/pages/tasks-view";
import FilesView from "@/pages/files-view";
import InboxView from "@/pages/inbox-view";
import PromptsView from "@/pages/prompts-view";
import ChangelogView from "@/pages/changelog-view";
import SettingsView from "@/pages/settings-view";
import ManagerView from "@/pages/manager-view";
```

**Recommendation**: Use React.lazy() and Suspense:

```typescript
const TasksView = React.lazy(() => import("@/pages/tasks-view"));
const FilesView = React.lazy(() => import("@/pages/files-view"));
// ... etc
```

---

## 3. Security & Best Practices

### Current State

- **No authentication or authorization** — all endpoints are public
- GitHub tokens and API keys stored in plaintext JSON
- XSS vulnerability in markdown rendering
- No CSRF protection
- No rate limiting

### Issues Found

| Issue | Location | Severity | Priority |
|-------|----------|----------|----------|
| No authentication | All routes in `server/routes.ts` | Critical | Must-fix |
| Plaintext token storage | `server/storage.ts:349` | Critical | Must-fix |
| XSS via dangerouslySetInnerHTML | `client/src/pages/manager-view.tsx:794` | High | Must-fix |
| No CSRF protection | Entire application | High | Must-fix |
| No rate limiting | `server/index.ts` | High | Should-fix |
| Race condition in file storage | `server/storage.ts:161-164` | High | Must-fix |
| 20MB request body limit | `server/index.ts:17` | Medium | Should-fix |
| No input sanitization | Multiple endpoints | Medium | Should-fix |

### 3.1 Critical: No Authentication

**Location**: `server/routes.ts` (lines 176-202)

Every API endpoint is accessible without any authentication:

```typescript
app.get("/api/businesses", async (req, res) => {
  const businesses = storage.getBusinesses();
  res.json(businesses);
});

app.post("/api/businesses", async (req, res) => {
  // No auth check
  const data = insertBusinessSchema.parse(req.body);
  // ...
});
```

**Recommendation**: 
- Implement JWT authentication with `express-session`
- Add authorization middleware to verify user owns business/resource
- Use refresh tokens for long-lived sessions

### 3.2 XSS Vulnerability

**Location**: `client/src/pages/manager-view.tsx` (lines 792-795)

User/AI content is rendered with `dangerouslySetInnerHTML`:

```typescript
<div
  className="text-sm prose-sm prose-invert max-w-none ..."
  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
/>
```

The custom `renderMarkdown` function may not properly sanitize all attack vectors.

**Recommendation**: 
- Use DOMPurify to sanitize HTML before rendering
- Or use a safe markdown renderer like `react-markdown` (already in dependencies)

### 3.3 Race Condition in Storage

**Location**: `server/storage.ts` (lines 161-164)

```typescript
function writeStore(data: StoreData) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}
```

The read-modify-write pattern without locking means concurrent requests can overwrite each other's changes.

**Recommendation**: 
- Short-term: Implement file locking with `proper-lockfile`
- Long-term: Migrate to PostgreSQL with transactions

### 3.4 Plaintext Token Storage

**Location**: `server/storage.ts` (lines 349, 374)

GitHub tokens and API keys are stored in plaintext in `data/store.json`.

**Recommendation**:
- Encrypt sensitive data at rest
- Consider using environment variables or a secrets manager
- At minimum, encrypt tokens before storing in JSON

---

## 4. User Experience Issues

### Current State

- Functional UI with Shadcn/UI components
- PWA support with service worker
- Mobile-responsive sidebar
- Some accessibility gaps

### Issues Found

| Issue | Location | Severity | Priority |
|-------|----------|----------|----------|
| Toast never disappears | `client/src/hooks/use-toast.ts:9` | High | Must-fix |
| Missing ARIA labels | Multiple components | Medium | Should-fix |
| Fixed-width sidebar on mobile | `manager-view.tsx:543` | Medium | Should-fix |
| No loading skeletons | Most views | Low | Nice-to-have |
| Inconsistent error messages | Multiple files | Medium | Should-fix |

### 4.1 Toast Remove Delay Bug

**Location**: `client/src/hooks/use-toast.ts` (lines 8-9)

```typescript
const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000  // 16+ minutes!
```

`TOAST_REMOVE_DELAY` is set to 1,000,000ms (16+ minutes) instead of a reasonable value like 5,000ms. Toasts effectively never disappear.

**Recommendation**: Change to `const TOAST_REMOVE_DELAY = 5000`.

### 4.2 Missing Accessibility

Multiple interactive elements lack proper ARIA attributes:

| Element | Location | Missing |
|---------|----------|---------|
| Tab buttons | `task-detail-panel.tsx:496-503` | `role="tab"`, `aria-selected` |
| Icon buttons | Multiple files | `aria-label` |
| Textarea inputs | `manager-view.tsx:881` | `aria-label` |
| Loading spinners | Multiple files | `aria-busy`, `aria-live` |

**Recommendation**: Audit all interactive elements and add appropriate ARIA attributes.

### 4.3 Mobile Responsiveness Issues

**Location**: `client/src/pages/manager-view.tsx` (line 543)

```typescript
<div className="w-80 border-r ...">  {/* Fixed 320px width */}
```

The Manager view left sidebar uses a fixed width that may overflow on small screens.

**Recommendation**: Use responsive classes: `w-full md:w-80` or hide sidebar on mobile.

---

## 5. Feature Implementation Quality

### Current State

- Discussion feature: Working with auto-analysis
- Manager feature: Functional with chat, scanning, actions
- GitHub integration: Working but with caching concerns
- File handling: Basic implementation

### Issues Found

| Issue | Location | Severity | Priority |
|-------|----------|----------|----------|
| Discussion may show stale data | Due to `staleTime: Infinity` | High | Must-fix |
| Manager actions not persisted across page refresh | `manager-view.tsx` | Medium | Should-fix |
| File path not validated | `server/routes.ts:940` | Medium | Should-fix |
| GitHub rate limit not handled gracefully | Multiple endpoints | Medium | Should-fix |
| Voice input lacks error handling | `manager-view.tsx:486-512` | Low | Nice-to-have |

### 5.1 Discussion Stale Data Risk

**Location**: `client/src/components/task-detail-panel.tsx` (lines 74-77)

The Discussion feature query uses the global `staleTime: Infinity` setting:

```typescript
const { data: discussionData } = useQuery({
  queryKey: [`/api/businesses/${selectedBusinessId}/projects/${selectedProjectId}/tasks/${task.id}/discussion`],
  enabled: activeTab === "discussion",
});
```

This can cause the same refresh issue that was recently fixed.

**Recommendation**: Add explicit `staleTime` to discussion query:

```typescript
const { data: discussionData } = useQuery({
  queryKey: [...],
  enabled: activeTab === "discussion",
  staleTime: 0, // Always refetch when tab opens
});
```

### 5.2 GitHub File Path Validation

**Location**: `server/routes.ts` (lines 940-942)

```typescript
const filePath = req.query.path as string;
const response = await fetch(
  `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${filePath}`,
```

The file path is used directly without validation.

**Recommendation**: Validate file paths don't contain `..` sequences or other traversal patterns:

```typescript
if (filePath.includes('..') || filePath.startsWith('/')) {
  return res.status(400).json({ message: 'Invalid file path' });
}
```

---

## 6. Known Bugs & Issues

### Issues Found

| Issue | Location | Severity | Priority |
|-------|----------|----------|----------|
| Toast delay bug (1M ms) | `use-toast.ts:9` | High | Must-fix |
| Stale data from Infinity staleTime | `queryClient.ts:50` | High | Must-fix |
| Promise.all without individual error handling | `routes.ts:1546-1547` | Medium | Should-fix |
| Silent file read failures | `manager-view.tsx:469` | Low | Nice-to-have |
| Error messages may expose internals | Multiple endpoints | Low | Should-fix |

### 6.1 Promise.all Error Handling

**Location**: `server/routes.ts` (lines 1546-1547)

```typescript
const treeResults = await Promise.all(configuredRepos.map(r => fetchRepoTopLevelTree(r)));
```

If one repository fetch fails, all fail.

**Recommendation**: Use `Promise.allSettled` for better resilience:

```typescript
const treeResults = await Promise.allSettled(
  configuredRepos.map(r => fetchRepoTopLevelTree(r))
);
const successfulResults = treeResults
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value);
```

---

## 7. Missing Features & Improvements

### Recommended Additions

| Feature | Priority | Rationale |
|---------|----------|-----------|
| User authentication system | Must-have | Security fundamental |
| Database migration (PostgreSQL) | Must-have | Scalability, data integrity |
| Request logging & monitoring | Should-have | Observability, debugging |
| API rate limiting | Should-have | Abuse prevention |
| Error tracking (Sentry) | Should-have | Production debugging |
| Bundle size optimization | Nice-to-have | Performance |
| API documentation (OpenAPI) | Nice-to-have | Developer experience |
| Health check endpoint | Should-have | Operations |
| Database backups | Must-have | Data safety |
| Input validation middleware | Should-have | Security |

### 7.1 Monitoring & Observability

Currently, the application has minimal logging and no error tracking.

**Recommendation**:
- Add structured logging (winston or pino)
- Integrate Sentry for error tracking
- Add health check endpoint (`/api/health`)
- Implement request timing metrics

### 7.2 Developer Experience

**Recommendation**:
- Add OpenAPI/Swagger documentation
- Create seed script with sample data
- Add integration tests for critical flows
- Document environment setup in README

---

## Prioritized Action Plan: Top 10 Most Impactful Improvements

### 1. Add Authentication & Authorization
**Severity**: Critical  
**Files**: Create `server/middleware/auth.ts`, modify all routes in `server/routes.ts`  
**Effort**: Medium  
**Impact**: Prevents unauthorized access to all data

**Implementation Steps**:
1. Install dependencies: `jsonwebtoken`, `bcrypt`, `express-session`
2. Create User model in schema
3. Create auth middleware
4. Add login/register endpoints
5. Protect all existing routes

### 2. Migrate to PostgreSQL Database
**Severity**: Critical  
**Files**: `server/storage.ts`, `shared/schema.ts`, `drizzle.config.ts`  
**Effort**: High  
**Impact**: Enables scalability, transactions, proper concurrent access

**Implementation Steps**:
1. Define Drizzle schema from existing Zod schemas
2. Create migration files
3. Implement repository layer using Drizzle
4. Migrate existing data
5. Test all CRUD operations

### 3. Fix `staleTime: Infinity` Caching Issue
**Severity**: High  
**File**: `client/src/lib/queryClient.ts:50`  
**Effort**: Low  
**Impact**: Prevents stale data across the entire application

**Fix**:
```typescript
staleTime: 30000, // 30 seconds instead of Infinity
```

### 4. Fix Toast Remove Delay Bug
**Severity**: High  
**File**: `client/src/hooks/use-toast.ts:9`  
**Effort**: Minimal  
**Impact**: Toasts will actually disappear

**Fix**:
```typescript
const TOAST_REMOVE_DELAY = 5000  // Was 1000000
```

### 5. Fix XSS Vulnerability in Markdown Rendering
**Severity**: High  
**File**: `client/src/pages/manager-view.tsx:794`  
**Effort**: Low  
**Impact**: Prevents cross-site scripting attacks

**Fix**:
```bash
npm install dompurify @types/dompurify
```

```typescript
import DOMPurify from 'dompurify';

// In render:
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(msg.content)) }}
```

### 6. Add API Rate Limiting
**Severity**: High  
**File**: `server/index.ts`  
**Effort**: Low  
**Impact**: Prevents API abuse and DoS attacks

**Fix**:
```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### 7. Implement Lazy Loading for Views
**Severity**: Medium  
**File**: `client/src/App.tsx:16-22`  
**Effort**: Low  
**Impact**: Reduces initial bundle size and load time

**Fix**:
```typescript
import React, { Suspense } from 'react';

const TasksView = React.lazy(() => import("@/pages/tasks-view"));
const FilesView = React.lazy(() => import("@/pages/files-view"));
// ... other views

// In render:
<Suspense fallback={<LoadingSpinner />}>
  {currentView === 'tasks' && <TasksView />}
  {/* ... */}
</Suspense>
```

### 8. Split Routes into Modules
**Severity**: Medium  
**File**: `server/routes.ts` (1,978 lines)  
**Effort**: Medium  
**Impact**: Improved code organization and maintainability

**Implementation**:
```
server/
  routes/
    index.ts       # Route aggregator
    businesses.ts  # Business routes
    projects.ts    # Project routes
    tasks.ts       # Task routes
    manager.ts     # Manager routes
    claude.ts      # AI integration routes
```

### 9. Add CSRF Protection
**Severity**: Medium  
**Files**: `server/index.ts`, all form submissions  
**Effort**: Low  
**Impact**: Prevents cross-site request forgery attacks

**Fix**:
```bash
npm install csurf
```

```typescript
import csrf from 'csurf';
const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);
```

### 10. Fix N+1 Query Patterns
**Severity**: Medium  
**Files**: `server/routes.ts:1366`, `server/routes.ts:1498-1512`  
**Effort**: Medium  
**Impact**: Dramatically improves Manager and changelog performance

**Fix**: Pre-fetch all code reviews and changelogs before the loop:
```typescript
const allReviews = storage.getAllCodeReviews();
const allChangelogs = storage.getAllChangelogs();

for (const task of allTasks) {
  const reviews = allReviews.filter(r => r.taskId === task.id);
  // ...
}
```

---

## Quick Wins (Can Be Fixed Immediately)

These fixes can be implemented in under 30 minutes each:

1. **Toast delay**: Change line 9 in `use-toast.ts` from `1000000` to `5000`
2. **Add basic rate limiting**: `npm install express-rate-limit` and add middleware
3. **Fix staleTime**: Change default to `30000` in `queryClient.ts`
4. **Add DOMPurify**: `npm install dompurify @types/dompurify` and wrap markdown output
5. **Add health check**: Add `/api/health` endpoint returning `{ status: 'ok' }`

---

## Appendix A: File Reference

### Critical Files to Review

| File | Lines | Purpose |
|------|-------|---------|
| `server/routes.ts` | 1,978 | All API endpoints |
| `server/storage.ts` | 843 | Data persistence layer |
| `client/src/lib/queryClient.ts` | 57 | React Query configuration |
| `client/src/hooks/use-toast.ts` | 191 | Toast notification system |
| `client/src/pages/manager-view.tsx` | 915 | Manager feature UI |
| `client/src/components/task-detail-panel.tsx` | 811 | Task details with Discussion |
| `shared/schema.ts` | 250 | Data models and validation |

### Dependency Audit

**Production Dependencies Requiring Review**:
- `express-session` - In dependencies but not used (auth missing)
- `passport` - In dependencies but not used (auth missing)
- `drizzle-orm` - Configured but using JSON instead

**Missing Recommended Dependencies**:
- `express-rate-limit` - Rate limiting
- `helmet` - Security headers
- `dompurify` - XSS prevention
- `winston` or `pino` - Structured logging
- `@sentry/node` - Error tracking

---

## Appendix B: Security Checklist

- [ ] Authentication system implemented
- [ ] Authorization checks on all routes
- [ ] API rate limiting enabled
- [ ] CSRF protection active
- [ ] XSS prevention (DOMPurify)
- [ ] Input validation on all endpoints
- [ ] Secrets encrypted at rest
- [ ] Security headers (Helmet)
- [ ] HTTPS enforced in production
- [ ] SQL injection prevention (parameterized queries)
- [ ] File upload validation
- [ ] Error messages don't expose internals

---

## Summary

The AI Dev Hub has a solid foundation with modern tooling but needs significant work before production deployment:

| Category | Status |
|----------|--------|
| Security | ❌ Critical issues |
| Architecture | ⚠️ Won't scale |
| Performance | ⚠️ Issues present |
| UX | ⚠️ Bugs present |
| Code Quality | ⚠️ Needs refactoring |

**Top Priority**: Add authentication and migrate to PostgreSQL. These two changes will address the most critical security and scalability concerns. The remaining items can be addressed incrementally.

---

*Report generated on February 19, 2026*
