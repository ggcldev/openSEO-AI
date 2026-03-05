# Performance Audit — TODO

## Phase 1: Codebase Profiling (Static Analysis)

- [ ] **P1.1** N+1 Query Detection — `job_service.py`, `routes/history.py` (repeated DB queries in loops)
- [ ] **P1.2** Synchronous Blocking in Async Context — sync SQLAlchemy calls inside `async def` handlers
- [ ] **P1.3** Memory Leaks in Playwright — `engine.py` browser instances not closed on failure paths
- [ ] **P1.4** Unbounded Data Loading — `routes/history.py` loading large JSON `audit_result` into memory
- [ ] **P1.5** LLM Call Inefficiencies — sequential LLM calls in `seo_agent.py`, `editor_agent.py`, `intent_detector.py` that could be parallelized
- [ ] **P1.6** Frontend Bundle & Re-renders — 560-line dashboard with 15+ `useState` hooks
- [ ] **P1.7** Polling Overhead — 3-second polling interval on dashboard

## Phase 2: Performance Benchmarking

- [ ] **B2.1** API Endpoint Latency — cProfile + custom timing (p50/p95/p99)
- [ ] **B2.2** DB Query Performance — SQLAlchemy query logging + `EXPLAIN ANALYZE`
- [ ] **B2.3** Job Processing Throughput — jobs/minute, avg time per pipeline stage
- [ ] **B2.4** Concurrent API Load — k6/locust under 10/50/100 concurrent users
- [ ] **B2.5** Frontend Bundle Analysis — `next build` + bundle analyzer
- [ ] **B2.6** Memory Profiling — `tracemalloc` / Docker stats under sustained workloads

## Phase 3: Deep Testing & Edge Cases

- [ ] **T3.1** Race Condition: Job Claiming — two workers claiming same job (SQLite vs Postgres locking)
- [ ] **T3.2** Stale Job Recovery Under Load — worker crash mid-pipeline, verify requeue + no data corruption
- [ ] **T3.3** Bulk Upload Stress — 2000-row XLSX upload, memory + DB insertion time
- [ ] **T3.4** Concurrent Schedule Execution — multiple schedules firing simultaneously
- [ ] **T3.5** LLM Timeout Handling — Groq/Claude API timeout, retry behavior, partial result cleanup
- [ ] **T3.6** Scraping Failure Cascades — target site blocks all requests, graceful degradation
- [ ] **T3.7** Database Connection Exhaustion — max connections under sustained load

## Phase 4: Scalability Analytics

- [ ] **S4.1** DB-Backed Job Queue — row-level locking contention with 5+ workers on Postgres
- [ ] **S4.2** Embedded Worker — runs inside FastAPI process, shares CPU/memory (noisy neighbor)
- [ ] **S4.3** SQLite in Dev/Demo — no concurrent write support, breaks with multiple workers
- [ ] **S4.4** Playwright Browser Pool — each job spawns new browser, no connection pooling
- [ ] **S4.5** Single CORS Origin — hardcoded `localhost:3000`, blocks multi-instance deployments
- [ ] **S4.6** Stateful Workers — heartbeat table creates coupling, no stateless horizontal scaling
- [ ] **S4.7** LLM Rate Limits — Groq free tier throttling under concurrent jobs

---

# TypeScript Codebase Audit — TODO

## Phase 1: Security Fixes (CRITICAL — Fix Immediately)

- [ ] **TS-SEC-1** XSS via contentEditable — Install DOMPurify, sanitize all external HTML before rendering in `HtmlEditorPanel.tsx`
- [ ] **TS-SEC-2** XSS via `decodeEntities` — Replace `textarea.innerHTML` with manual entity decoding in `HtmlEditorPanel.tsx:236-242`
- [ ] **TS-SEC-3** Unsafe `as AuditResult` assertions — Add runtime validation (zod/valibot) for `JSON.parse` results in `TableResults.tsx:422`, `JobDetailPanel.tsx:21`, `HtmlEditorPanel.tsx:84`
- [ ] **TS-SEC-4** `decodeEntities` DOM injection — Replace innerHTML-based decode with regex-based entity replacement
- [ ] **TS-SEC-5** No authentication — Add auth headers/tokens to `apiClient.ts` fetch wrapper
- [ ] **TS-SEC-6** Validate `NEXT_PUBLIC_API_URL` env var — Ensure well-formed URL before use in `apiClient.ts:14`

## Phase 2: Type Safety (HIGH — Fix This Sprint)

- [ ] **TS-TYPE-1** Enable `noUncheckedIndexedAccess` in `tsconfig.json`
- [ ] **TS-TYPE-2** Enable `noImplicitReturns` in `tsconfig.json`
- [ ] **TS-TYPE-3** Enable `noFallthroughCasesInSwitch` in `tsconfig.json`
- [ ] **TS-TYPE-4** Type `goal` fields as discriminated union `"leads" | "awareness" | "product_info"` in `types.ts` and `dashboard/page.tsx`
- [ ] **TS-TYPE-5** Replace `as Node` assertion with `instanceof Node` guard in `dashboard/page.tsx:89` and `TableResults.tsx:65`
- [ ] **TS-TYPE-6** Type `scheduleGoal` state as `"leads" | "awareness" | "product_info"` to remove `as` assertion in `dashboard/page.tsx:159`
- [ ] **TS-TYPE-7** Add `Number.isNaN` guard for `Number(e.target.value)` in `dashboard/page.tsx:357,367`
- [ ] **TS-TYPE-8** Add null guard for `change_summary.keep` and `change_summary.change` access in `TableResults.tsx:358` — backend could omit these properties

## Phase 3: Performance (HIGH — Fix This Sprint)

- [ ] **TS-PERF-1** Decompose `HtmlEditorPanel.tsx` (960 LOC) into sub-components: EditorCanvas, EditorToolbar, SeoSignalsSidebar, MetaFieldsPanel, TermFrequencyPanel
- [ ] **TS-PERF-2** Decompose `dashboard/page.tsx` (560 LOC) into sub-components: ScanForm, AutomationPanel, HistorySection + custom hooks
- [ ] **TS-PERF-3** Debounce `collectEditorStats` — currently parses full HTML via DOMParser on every keystroke
- [ ] **TS-PERF-4** Fix polling cascading re-renders — `history` in dependency array of `useEffect` causes interval reset on every poll. Use ref-based approach
- [ ] **TS-PERF-5** Cache compiled RegExp in `countKeyword` — creates new `RegExp` per call per keyword per keystroke
- [ ] **TS-PERF-6** Replace `setTimeout(() => fetchHistory(), 1500)` (4 occurrences) with optimistic updates or poll-until-found
- [ ] **TS-PERF-7** Add virtualization for history table — renders all 200 rows as DOM nodes simultaneously
- [ ] **TS-PERF-8** Reuse single `DOMParser` instance — currently created multiple times per render in `HtmlEditorPanel.tsx`
- [ ] **TS-PERF-9** Fix `secondaryKeywords` useMemo — `audit?.keywords?.secondary` is a new array ref on every contextItem change, causing unnecessary recomputation in `HtmlEditorPanel.tsx:511-518`

## Phase 4: Error Handling (MEDIUM)

- [ ] **TS-ERR-1** Add React Error Boundary wrapper in `layout.tsx`
- [ ] **TS-ERR-2** Add AbortController to `fetchHistory()` and `fetchSchedules()` for component unmount cleanup
- [ ] **TS-ERR-3** Add cleanup guard for auto-optimize polling loop on unmount in `HtmlEditorPanel.tsx`
- [ ] **TS-ERR-4** Add fallback UI for expanded table rows with null/malformed `audit_result` in `TableResults.tsx:441`
- [ ] **TS-ERR-5** Replace empty `catch {}` with logging in `TableResults.tsx:422`
- [ ] **TS-ERR-6** Replace `message.startsWith("Error")` pattern (6 occurrences) with proper `{ type: "success" | "error"; text: string }` state type

## Phase 5: Code Quality (MEDIUM)

- [ ] **TS-QUAL-1** Extract duplicate `parseAudit` function to shared `lib/utils.ts` — duplicated in `JobDetailPanel.tsx:18` and `HtmlEditorPanel.tsx:81`
- [ ] **TS-QUAL-2** Extract duplicate click-outside pattern to `useClickOutside` hook — duplicated in `dashboard/page.tsx:84` and `TableResults.tsx:60`
- [ ] **TS-QUAL-3** Extract pure business logic from `HtmlEditorPanel.tsx` to `lib/htmlUtils.ts` and `lib/seoAnalysis.ts` (stripPageChrome, collectEditorStats, countKeyword, extractHeadMeta, etc.)
- [ ] **TS-QUAL-4** Replace magic numbers with named constants (3000ms poll, 1500ms delay, 2000ms auto-optimize, 800 default words, etc.)
- [ ] **TS-QUAL-5** Remove duplicate `key` prop on `<tr>` inside `<Fragment>` in `TableResults.tsx:425-426`
- [ ] **TS-QUAL-6** Fix `||` to `?? 0 > 0` for `.length` checks in `TableResults.tsx:338` (falsy when length is 0)
- [ ] **TS-QUAL-7** Replace `<a href>` with Next.js `<Link>` for internal navigation in `layout.tsx:15-19`
- [ ] **TS-QUAL-8** Extract repeated error handling pattern into shared utility function (used 8 times in `dashboard/page.tsx`)
- [ ] **TS-QUAL-9** Group related state into `useReducer` — dashboard has 33 `useState` hooks, schedule form fields should be a single state object
- [ ] **TS-QUAL-10** Add dependency injection for API client — current module-level singleton with hardcoded `fetch` makes testing difficult
- [ ] **TS-QUAL-11** Remove unnecessary `Fragment` import — use JSX shorthand `<>...</>` instead in `TableResults.tsx:3`

## Phase 6: Configuration & Build (MEDIUM)

- [ ] **TS-CFG-1** Configure ESLint via `next lint` — lint pipeline currently not set up
- [ ] **TS-CFG-2** Fix `frontend/Dockerfile` — change `npm run dev` to `npm run build && npm start` for production
- [ ] **TS-CFG-3** Evaluate `skipLibCheck: true` — may be hiding type errors in `.d.ts` files

## Phase 7: Testing (MEDIUM — Establish Baseline)

- [ ] **TS-TEST-1** Install testing framework — `vitest` + `@testing-library/react`
- [ ] **TS-TEST-2** Unit tests for pure functions — `stripPageChrome`, `collectEditorStats`, `countKeyword`, `extractHeadMeta`, `splitHtmlDocument`
- [ ] **TS-TEST-3** Unit tests for `parseAudit` with malformed/null/partial inputs
- [ ] **TS-TEST-4** Integration test for `apiClient.ts` with mocked fetch
- [ ] **TS-TEST-5** Component test for `TableResults` with various job states (pending, running, done, failed)
- [ ] **TS-TEST-6** E2E test for scan submission → history display flow
- [ ] **TS-TEST-7** Test HTML sanitization — verify XSS payloads are stripped after DOMPurify integration

## Phase 8: Dependencies (LOW)

- [ ] **TS-DEP-1** Install `dompurify` — required for XSS prevention
- [ ] **TS-DEP-2** Install `zod` or `valibot` — runtime type validation for API responses
- [ ] **TS-DEP-3** Install `@sentry/nextjs` or similar — production error tracking
- [ ] **TS-DEP-4** Evaluate Tailwind v4 migration — v4 available but has breaking changes

## Phase 9: Documentation & Edge Cases (LOW)

- [ ] **TS-DOC-1** Add JSDoc comments to all exported functions in `apiClient.ts`
- [ ] **TS-DOC-2** Add JSDoc to pure utility functions (`stripPageChrome`, `collectEditorStats`, etc.)
- [ ] **TS-DOC-3** Add timezone indicator to date displays — `toLocaleString()` shows local time without UTC label
- [ ] **TS-DOC-4** Handle empty audit with expanded row — show fallback message instead of nothing
- [ ] **TS-DOC-5** Add upper bound validation for job IDs in `editor/[jobId]/page.tsx`
