# @gigaway/shared

Dependency-free TypeScript shared between the Expo app and the Supabase Edge Functions.

## Rules

These exist because the same files are resolved by **two different runtimes** — Metro
(Node-style) and Deno.

1. **Relative imports must carry an explicit `.ts` extension.** Deno requires it; Metro
   and TypeScript accept it.
2. **`zod` is the only permitted dependency.** It is mapped for Deno in
   `supabase/functions/deno.json` (`"zod": "npm:zod@^3.24"`). Adding any other dependency
   breaks the Deno side.
3. **No React, no `supabase-js`, no platform APIs.** Pure logic only.
4. Run `pnpm sync:shared` after changing anything here, before deploying functions. CI
   enforces freshness via `pnpm sync:shared:check`.
