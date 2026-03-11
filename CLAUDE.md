# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PixBingoBR Back Office — an admin dashboard for managing bonuses, players, campaigns, transactions, and game features for the PixBingoBR gaming platform. Built with Lovable.

## Commands

```bash
npm run dev         # Start dev server (port 8080)
npm run build       # Production build
npm run build:dev   # Development build
npm run lint        # ESLint
npm run test        # Run vitest
npm run test:watch  # Vitest in watch mode
```

## Tech Stack

- **React 18** + **TypeScript** with **Vite** (SWC compiler)
- **Supabase** for auth, database, and edge functions
- **shadcn/ui** + **Radix UI** + **Tailwind CSS** (dark theme)
- **TanStack React Query** for server state
- **React Hook Form** + **Zod** for form handling/validation
- **React Router DOM** for routing

## Architecture

### Routing & Auth

All routes are protected via `ProtectedRoute` component which checks Supabase auth session. Auth state lives in `src/contexts/AuthContext.tsx`. Login is the only public route (`/login`).

### Data Layer

- **Supabase client**: `src/integrations/supabase/client.ts`
- **Data hooks**: `src/hooks/use-supabase-data.ts` — exports hooks like `useBatches()`, `useEndpoints()`, `useCredentials()`, `useFlows()`, `useBonusRules()`, `useDashboardStats()`
- **Proxy hook**: `src/hooks/use-proxy.ts` — all external API calls are proxied through Supabase edge functions
- **API credentials** stored in `sessionStorage`, default site: `https://pixbingobr.concurso.club`

### Edge Functions

Located in `supabase/functions/`. Key functions: `pixbingo-proxy` (HTTP proxy), `process-campaign`, `auto-process-campaigns`, `discover-endpoints`, `fetch-players`, `player-profile`, `manage-users`.

### Domain Types

Defined in `src/types/index.ts`. Key enums:
- `UserRole`: ADMIN | OPERADOR | VISUALIZADOR
- `BatchStatus`: PENDENTE | EM_ANDAMENTO | PAUSADO | CONCLUIDO | ERRO
- `ItemStatus`: PENDENTE | PROCESSANDO | SEM_BONUS | BONUS_1X | BONUS_2X+ | ERRO | TIMEOUT

### UI Components

52 shadcn/ui components in `src/components/ui/`. App layout uses a fixed sidebar (`AppSidebar.tsx`) with main content area. Custom theme uses Space Grotesk and JetBrains Mono fonts.

### Path Alias

`@/*` maps to `./src/*` (configured in tsconfig and vite).

## Environment Variables

Required in `.env` (all VITE_ prefixed for client-side access):
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`

## Language

The codebase UI and domain terminology are in **Brazilian Portuguese** (e.g., "Partidas", "Pendente", "Concluído").
