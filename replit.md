# Жалюзи Учет - Business Accounting System

## Overview

This is an internal business accounting system for a blinds/jalousie manufacturing company. The application provides comprehensive management of orders, finances, warehouse inventory, and reference data with full reporting capabilities.

**Core Functionality:**
- Reference data management (CRUD for colors, fabrics, dealers, cashboxes, systems, expense types, components, multipliers, suppliers)
- Order management with status tracking
- Financial operations (income, expense, supplier payments, inter-cashbox transfers)
- Warehouse receipts for fabric and component inventory
- Reports: Cash flow (DDS), gross profit, accounts receivable/payable, cash totals

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework:** React 18 with TypeScript
- **Routing:** Wouter (lightweight React router)
- **State Management:** TanStack React Query for server state
- **Styling:** Tailwind CSS with shadcn/ui component library (New York style)
- **Forms:** React Hook Form with Zod validation
- **Build Tool:** Vite

**Design Pattern:** Enterprise data application following Ant Design-inspired principles - information-dense layouts, rapid navigation, consistent CRUD patterns across all entities.

**Layout Structure:**
- Fixed left sidebar (256px) with grouped navigation
- Top header bar with breadcrumbs
- Content area with max-width container
- Dark/light theme support

### Backend Architecture
- **Runtime:** Node.js with Express.js
- **API Style:** REST API with JSON responses
- **Authentication:** JWT tokens stored in httpOnly session cookies
- **Password Security:** bcrypt with salt rounds
- **Session:** Express session middleware

**API Structure:** All endpoints prefixed with `/api/`
- Auth routes: `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/auth/me`
- Entity CRUD routes: `/api/colors`, `/api/fabrics`, `/api/dealers`, etc.
- Protected routes use JWT verification middleware

### Data Storage
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM with drizzle-zod for schema validation
- **Schema Location:** `shared/schema.ts` (shared between client and server)
- **Migrations:** Drizzle Kit (`npm run db:push`)

**Data Scoping:** All user data is scoped by `userId` field for multi-tenant isolation.

### Project Structure
```
├── client/src/          # React frontend
│   ├── components/      # Reusable UI components
│   ├── pages/           # Route page components
│   ├── lib/             # Utilities (auth, query client, theme)
│   └── hooks/           # Custom React hooks
├── server/              # Express backend
│   ├── routes.ts        # API route definitions
│   ├── storage.ts       # Database access layer
│   └── db.ts            # Database connection
├── shared/              # Shared code (schema, types)
└── migrations/          # Database migrations
```

## External Dependencies

### Database
- **PostgreSQL** - Primary data store, connection via `DATABASE_URL` environment variable

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT authentication
- `express-session` - Session management
- `@tanstack/react-query` - Server state management
- `react-hook-form` + `zod` - Form handling and validation
- `date-fns` - Date formatting (Russian locale supported)

### UI Component Libraries
- Radix UI primitives (dialog, select, tabs, etc.)
- shadcn/ui components (pre-configured in `components.json`)
- Lucide React icons

### Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - JWT signing secret (falls back to default in development)