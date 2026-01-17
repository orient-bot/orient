# Database Migration Checklist

Use this checklist before merging any PR that includes database changes.

## Pre-Development

- [ ] Identified need for new table/columns
- [ ] Reviewed existing schema in `src/db/schema.ts`
- [ ] Checked for similar patterns in existing migrations

## Migration File

- [ ] Created file: `data/migrations/XXX_descriptive_name.sql`
- [ ] Used correct sequence number (next after existing)
- [ ] Wrapped SQL in `BEGIN;` ... `COMMIT;`
- [ ] Used `IF NOT EXISTS` for tables and indexes
- [ ] Added `COMMENT ON TABLE/COLUMN` for documentation
- [ ] Foreign keys reference correct tables with appropriate ON DELETE

## Drizzle Schema

- [ ] Updated `src/db/schema.ts` with new table/columns
- [ ] Table name in schema matches SQL exactly
- [ ] Column names use snake_case in SQL, camelCase in TypeScript
- [ ] Added proper indexes for query patterns
- [ ] Types match between SQL and Drizzle

## Testing

- [ ] Migration applies cleanly: `npm run db:migrate`
- [ ] Tables visible: `npm run db:migrate:status`
- [ ] Updated `REQUIRED_TABLES` in schema-validation test
- [ ] Schema validation passes: `npm run test:e2e -- schema-validation`
- [ ] Integration tests pass: `npm run test:integration`

## Seed Data (if applicable)

- [ ] Created seed script in `data/seeds/`
- [ ] Added npm script to `package.json`
- [ ] Seed runs without errors: `npm run your-seed-script`

## Documentation

- [ ] Updated any affected skills/documentation
- [ ] Added migration comments explaining "why"
- [ ] PR description mentions database changes

## Final Verification

- [ ] All files committed to git
- [ ] CI passes all checks
- [ ] Migration is idempotent (can run multiple times safely)

---

## Post-Deployment (Production)

After deployment to production:

- [ ] SSH to production server
- [ ] Apply migration: `npm run db:migrate`
- [ ] Verify tables: `npm run db:migrate:status`
- [ ] Run seed if needed: `npm run agents:seed`
- [ ] Check dashboard/API health
- [ ] Monitor logs for errors

```bash
# Quick production verification
ssh opc@$OCI_HOST "docker exec orienter-postgres psql -U aibot -d whatsapp_bot -c 'SELECT table_name FROM information_schema.tables WHERE table_schema = '\''public'\'' ORDER BY table_name'"
```
