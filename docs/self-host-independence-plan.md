# Self-Host Independence Plan

## Goal
Run the app without mandatory third-party platform services, so it can be pushed to GitHub and deployed on generic hosts.

## Current Status
- [x] Local auth mode added (`APP_AUTH_MODE=local`, `VITE_AUTH_MODE=local`)
- [x] Forced OAuth redirect disabled in local mode
- [x] External Google Fonts removed from `client/index.html`
- [x] External analytics script removed from `client/index.html`
- [x] Manus Vite runtime plugin removed from `vite.config.ts`

## Remaining Work (ordered by impact/risk)
1. Database schema source
- Restore/create `drizzle/schema.ts` in repo (currently imported by server files).
- Ensure migrations are committed (`drizzle/` folder).

2. Optional feature isolation (Forge)
- Keep core staffing CRUD independent.
- Mark/guard Forge-powered modules as optional:
  - `server/storage.ts`
  - `server/_core/storageProxy.ts`
  - `server/_core/notification.ts`
  - `server/_core/heartbeat.ts`
  - `server/_core/llm.ts`
  - `server/_core/imageGeneration.ts`
  - `server/_core/voiceTranscription.ts`
  - `server/_core/dataApi.ts`
- Route-level rule: do not expose Forge-only routes unless env vars are set.

3. Frontend optional feature cleanup
- Remove or hide components/pages that assume external APIs (Map/AI demo) unless enabled by env flags.

4. Build and CI sanity
- `pnpm install`
- `pnpm check`
- `pnpm test`
- `pnpm build`

5. Deploy readiness
- Add startup docs for generic Node host and for Azure App Service.
- Confirm secure cookie behavior behind proxy (`x-forwarded-proto`).

## Recommended Deployment Shapes
- Cheapest stable: Node app + managed MySQL.
- Fully controlled: VPS + Docker Compose (app + mysql).
- Azure option: App Service + Azure Database for MySQL Flexible Server.

## Notes
- Core business app (people/projects/assignments/staffing/settings) can run without Forge services.
- OAuth is now optional; local mode enables immediate self-host setup.
