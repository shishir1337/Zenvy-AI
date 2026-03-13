# Zenvy AI

Production-grade multi-tenant SaaS platform for F-Commerce (Facebook-based online business) automation.

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui
- **Backend**: NestJS 11, Prisma 7, PostgreSQL
- **Auth**: Better Auth with Organization plugin (multi-tenancy)
- **Monorepo**: pnpm workspaces, Turborepo

## Prerequisites

- Node.js 20+
- pnpm 10+
- PostgreSQL database

## Quick Start

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Configure environment**

   Copy `.env` and ensure `DATABASE_URL` points to your PostgreSQL instance. The root `.env` is used by the backend.

   ```env
   DATABASE_URL="postgres://user:pass@host:port/dbname"
   BETTER_AUTH_SECRET="your-secret-key"
   BETTER_AUTH_URL="http://localhost:3001"
   FRONTEND_URL="http://localhost:3000"
   ```

   Frontend uses `.env.local`:

   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

3. **Generate Prisma client and push schema**

   ```bash
   pnpm db:generate
   pnpm db:push
   ```

4. **Run development servers**

   ```bash
   pnpm dev
   ```

   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001
   - API docs: http://localhost:3001/docs

## Project Structure

```
├── frontend/          # Next.js 16 App Router
├── backend/           # NestJS 11 REST API
├── packages/shared/   # Shared TypeScript types and constants
├── pnpm-workspace.yaml
└── turbo.json
```

## Scripts

| Command        | Description                    |
|----------------|--------------------------------|
| `pnpm dev`     | Run frontend + backend         |
| `pnpm build`   | Build all packages             |
| `pnpm db:generate` | Generate Prisma client     |
| `pnpm db:push` | Push schema to database        |
| `pnpm db:migrate` | Run Prisma migrations       |
| `pnpm db:studio` | Open Prisma Studio          |

## Multi-Tenancy

Each business is an **organization**. Users can belong to multiple organizations and switch between them. All business data (products, orders, etc.) is scoped by `organizationId`.

1. Sign up to create a user
2. Create an organization from the sidebar switcher
3. All data is isolated per organization

## Inbox & Facebook Messenger

The Inbox supports Facebook Messenger and Instagram DM. To receive real-time messages locally:

1. **Expose backend** (choose one)

   **Option A: Cloudflare Tunnel** (recommended for Meta webhooks – free, no interstitial)

   ```bash
   npx cloudflared tunnel --url http://localhost:3001
   ```

   **Option B: ngrok** (free tier may fail Meta verification – [Meta may block ngrok](https://stackoverflow.com/questions/78601258/ngrok-webhooks-not-getting-verified-in-meta-webhooks-callbackurl); paid plans work)

   ```bash
   ngrok http 3001
   ```

2. **Configure `.env`**

   ```env
   WEBHOOK_BASE_URL="https://YOUR-TUNNEL-URL"
   FACEBOOK_APP_SECRET="your-app-secret"
   FACEBOOK_WEBHOOK_VERIFY_TOKEN="your-custom-token"
   ```

3. **Meta App Dashboard**

   - Go to [developers.facebook.com](https://developers.facebook.com) → Your App → Messenger → Settings
   - Add a webhook: `https://YOUR-TUNNEL-URL/api/webhooks/facebook`
   - **Verify token**: Use the exact same value as `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (e.g. `subscribe` or a custom string)
   - Subscribe to: `messages`, `messaging_postbacks`
   - For Instagram: add Instagram Product and configure webhook similarly

4. **Test verification manually**

   Visit in a browser (replace with your URL and token):

   ```
   https://YOUR-TUNNEL-URL/api/webhooks/facebook?hub.mode=subscribe&hub.verify_token=subscribe&hub.challenge=hello
   ```

   You should see `hello` in the response. If you get 403, the verify token does not match.

5. **Connect a Page**

   - In the Inbox UI, click **Connect Channel**
   - Enter Page ID, Page name, and Page access token from Meta Graph API Explorer

## License

Private / UNLICENSED
