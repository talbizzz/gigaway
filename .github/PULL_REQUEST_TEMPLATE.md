## What and why

<!-- One or two sentences. Link an issue if there is one. -->

## Checks

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass locally

<!-- Delete any section below that does not apply. -->

### Touches `supabase/migrations/`

- [ ] The change is **additive** — no dropped or renamed columns, no tightened
      policies that an installed app relies on
- [ ] **Which app versions stay compatible:**
- [ ] `pnpm db:types` re-run and the result committed

### Touches RLS

- [ ] A pgTAP test covering the new policy is in this PR
- [ ] The total assertion count went up, not down

### Touches `packages/shared/src/schemas/`

- [ ] This is a contract change. Deployed apps that use the old shape still work,
      or the plan for them is described above
