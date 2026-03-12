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

## License

Private / UNLICENSED
