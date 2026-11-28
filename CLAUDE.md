# Joebros business app

Modular operations app for Joebros Contracting Services (general contracting, Kent and Sussex County, Delaware), built to grow into an ERP.

## How work is planned
- The build is split into one-session chunks (F1, F2, ... S1, O1, ...). The roadmap with each chunk's scope, "done when" line and dependencies lives in the project file `/mnt/project-files/erp-plan/joebros-build-roadmap.html` (the `PHASES` array).
- Build only the chunk asked for, on its own branch (`<chunk-id>-<short-name>`), and stop when its "done when" line holds.

## Stack
- React 19 + TypeScript + Vite, React Router. No UI framework; plain CSS. All colors, type sizes and spacing are tokens in `src/styles/tokens.css` (light, dark, and follow-device themes). Never hardcode a color.
- Database: Supabase Postgres. Schema is SQL in `supabase/migrations/` (new file per change, never edit an applied one), sample rows in `supabase/seed.sql` (`is_example = true`). This project does not expose new tables to the API automatically: every new table needs explicit `grant ... to authenticated` in its migration (see `20261128000000_api_grants.sql`), then RLS policies. Merging to main applies them via `.github/workflows/database.yml`. Tests run migrations in PGlite (`supabase/tests`). See `supabase/README.md`.
- Sign-in: Supabase Auth (F4). `src/core/auth` holds the provider, sign-in screens and an `AuthClient` interface (tests use `fakeAuth`). The role comes from `profiles.role`; RLS in the database is the real gate, the menu just mirrors it. Without `VITE_SUPABASE_PUBLISHABLE_KEY` the app runs in preview mode with a "Preview as" role picker and no data. See `.env.example`.
- Settings (F5): `src/core/settings` holds `SettingsProvider`/`useSettings()` (company profile, switched-off modules, dropdown lists via `choices("trade")`) behind a `SettingsBackend` interface; tests and preview mode use `memorySettings()`. Use `choices(...)` for lead source and trade dropdowns instead of hardcoding lists. Invites go through the `invite-user` edge function in `supabase/functions`.
- Tickets (F6): `src/core/tickets` holds the stage rules (`stages.ts`, mirroring `ticket_stage_transitions` and `role_can_edit_stage`), a `TicketsBackend` interface (`supabaseTickets`, `memoryTickets` for preview and tests) and `useTickets()`. `useCurrentUser()` (`src/core/currentUser.tsx`) gives screens the signed-in role and id. The Tickets module (`/tickets`, `/tickets/new`, `/tickets/:number`) is the shared ticket screen other modules link to. The timeline comes from `ticket_events`, written by database triggers.
- Price book (S1): `src/core/pricebook` holds `price_items` types (kinds labor, material, adder, multiplier), `checkItem`/`normalizeItem` (mirroring the table checks), a `PriceBookBackend` (`supabasePriceBook`, `memoryPriceBook`), `usePriceBook()` and `PriceItemPicker` (search and pick active items, by kind and trade) for the estimate builder. Items are retired, never deleted; estimates should copy name, unit and numbers onto their lines. The Price book module (`/price-book`) is admin-editable and read-only for sales.
- Planned: Supabase Storage, Resend email, Leaflet + OpenRouteService maps, hosting on Cloudflare Pages. Keep everything on free tiers unless the owner approves a cost.

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
