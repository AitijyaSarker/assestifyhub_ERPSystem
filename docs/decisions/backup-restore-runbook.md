# Backup and restore runbook

Backup for this system is a `pg_dump` of PostgreSQL plus a `backup_records` row (status, size, checksum). Super Admin may list records via `GET /api/v1/backup/records`.

## Create a backup (dev)

```bash
docker compose exec postgres pg_dump -U erp erp_pos > backup-$(date +%Y%m%d).sql
```

Store the file in object storage (MinIO/S3) and insert a `backup_records` row with checksum.

## Restore (gated — not one-click in UI)

Restore is **not** exposed as a UI button until it has been tested on a copy of production. To restore:

1. Stop the API.
2. Recreate the database.
3. `psql` the dump into PostgreSQL.
4. Run `prisma migrate deploy` if the dump predates later migrations.
5. Restart the API.

Do this only from a documented maintenance window.
