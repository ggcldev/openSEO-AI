# Tailwind v4 Evaluation (TS-DEP-4)

Date: 2026-03-06

## Scope
- Evaluate whether `openSEO-AI/frontend` should migrate from Tailwind CSS v3 to v4 now.

## Current State
- Frontend currently builds and ships on Tailwind v3 (`tailwind.config.ts` + `postcss.config.js`).
- Current pipeline is stable (`npm run lint`, `npm test`, `npm run build` all pass).
- UI implementation is heavily class-driven across dashboard/editor/table surfaces.

## Migration Cost (Now)
- Requires a config/tooling migration pass (Tailwind + PostCSS integration changes).
- Requires visual regression verification across all existing pages/components.
- Requires coordination with ongoing performance and reliability TODOs.

## Benefit (Now)
- No current blocker in the project that requires v4 immediately.
- Existing v3 setup is healthy and not causing active delivery friction.

## Decision
- Defer migration for now.
- Re-evaluate during a dedicated frontend platform hardening window after current high-priority TODOs are closed.

## Revisit Criteria
- Planned design-system or theming overhaul.
- Build/pipeline pressure that specifically benefits from Tailwind v4.
- Time budget for full visual regression testing.
