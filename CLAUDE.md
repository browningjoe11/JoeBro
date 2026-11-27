# Joebros business app

Modular operations app for Joebros Contracting Services (general contracting, Kent and Sussex County, Delaware), built to grow into an ERP.

## How work is planned
- The build is split into one-session chunks (F1, F2, ... S1, O1, ...). The roadmap with each chunk's scope, "done when" line and dependencies lives in the project file `/mnt/project-files/erp-plan/joebros-build-roadmap.html` (the `PHASES` array).
- Build only the chunk asked for, on its own branch (`<chunk-id>-<short-name>`), and stop when its "done when" line holds.

## Stack
- React 19 + TypeScript + Vite, React Router. No UI framework; plain CSS. All colors, type sizes and spacing are tokens in `src/styles/tokens.css` (light, dark, and follow-device themes). Never hardcode a color.
- Planned: Supabase (Postgres, Auth, Storage) from F3/F4, Resend email, Leaflet + OpenRouteService maps, hosting on Cloudflare Pages. Keep everything on free tiers unless the owner approves a cost.

## Conventions
- Each module lives in `src/modules/<id>/index.tsx` and exports a `ModuleDefinition` (see `src/core/modules.ts`). Register it in `src/modules/registry.ts`; menu and routes are generated from the registry.
- Build screens from the shared components in `src/ui` (Button, TextField/SelectField/TextAreaField with bubble notes, Section, Sheet, DataTable, Badge, InfoTip). The admin-only Style guide page (`/styleguide`) shows them all; add new shared components there too.
- Use `Section` with a `storageKey` for collapsible areas so open/closed is remembered.
- Pages use `ModulePage` from `src/core/ModulePage.tsx` for a consistent header.
- Must read well on a PC first (full sidebar, 16px base text) and work on phones (sidebar becomes a drawer below 900px).
- Never hardcode secrets. Supabase keys come from environment variables.

## Commands
- `npm run dev`: local dev server
- `npm test`: unit and component tests (Vitest)
- `npm run typecheck`, `npm run build`
