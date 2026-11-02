# kp-hotel-backend

## PostgreSQL setup

This API uses PostgreSQL through Prisma. Install PostgreSQL, create a database, and set `DATABASE_URL` in `.env` (see [.env.example](./.env.example)).

```powershell
npm install
npm run db:generate
npm run db:deploy
npm run start:dev
```

For local schema development, use `npm run db:migrate`; for deployed environments, apply checked-in migrations with `npm run db:deploy`. PostgreSQL must be reachable before starting the API. Demo data is seeded locally when `SEED_DEMO=1`.

The persistence adapter keeps the existing application key and index access patterns in a PostgreSQL `JSONB` table so the storage engine can be changed without rewriting domain behavior. Invoice and inventory writes use PostgreSQL transactions, with unique/conditional writes and optimistic concurrency enforced by the database.

Run tests with `KP_TEST_DATABASE_URL` set to a PostgreSQL database URL. The test helper creates a temporary schema per test process, pushes the Prisma schema there, and drops the schema afterward; the database user must have permission to create and drop schemas.