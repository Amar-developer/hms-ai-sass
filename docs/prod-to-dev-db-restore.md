# MedizinHub HMS — Prod → Dev PostgreSQL Dump & Restore

**DB:** `<db_name>` | **User:** `<db_user>` | **Container:** `<postgres_container>` (same name on both prod and dev)

**Prod:** `<prod-public-ip>` | **Dev:** `<dev-public-ip>`

> Replace the placeholders above with your actual values before running. Keep this file out of version control / shared docs once filled in, since it documents direct DB access paths.

---

## 1. Dump on prod

SSH into prod:
```bash
ssh -i /path/to/prod-key.pem ubuntu@<prod-public-ip>
```

Run the dump (writes inside the container, not the host):
```bash
docker exec -t <postgres_container> pg_dump -U <db_user> -d <db_name> -F c -f /tmp/hms_prod_dump.sql
```

Copy it out of the container onto the prod host filesystem:
```bash
docker cp <postgres_container>:/tmp/hms_prod_dump.sql ~/hms_prod_dump.sql
ls -la ~/hms_prod_dump.sql
```

Exit prod:
```bash
exit
```

## 2. Pull dump to local machine

From your laptop:
```bash
scp -i /path/to/prod-key.pem ubuntu@<prod-public-ip>:~/hms_prod_dump.sql ~/hms_prod_dump.sql
```

## 3. Push dump to dev

```bash
scp -i /path/to/dev-key.pem ~/hms_prod_dump.sql ubuntu@<dev-public-ip>:~/hms_prod_dump.sql
```

## 4. Restore on dev

SSH into dev:
```bash
ssh -i /path/to/dev-key.pem ubuntu@<dev-public-ip>
```

Copy dump into dev's postgres container:
```bash
docker cp ~/hms_prod_dump.sql <postgres_container>:/tmp/hms_prod_dump.sql
```

Stop backend services so nothing holds open connections during the wipe:
```bash
docker stop <backend_container> <worker_container>
```

Drop and recreate the dev DB (connect to the `postgres` maintenance DB, since you can't drop a DB you're connected to):
```bash
docker exec -t <postgres_container> psql -U <db_user> -d postgres -c "DROP DATABASE IF EXISTS <db_name>;"
docker exec -t <postgres_container> psql -U <db_user> -d postgres -c "CREATE DATABASE <db_name>;"
```

Restore:
```bash
docker exec -t <postgres_container> pg_restore -U <db_user> -d <db_name> --no-owner --no-privileges /tmp/hms_prod_dump.sql
```

Restart services:
```bash
docker start <backend_container> <worker_container>
```

Check logs for clean startup:
```bash
docker logs <backend_container> --tail 50
```

---

## Notes / gotchas hit during this run

- `pg_dump -f /tmp/...` inside `docker exec` writes to the **container's** filesystem, not the host's. Always `docker cp` it out afterward.
- Don't `sudo` your `scp`/`ssh` commands — it switches to root's SSH config/known_hosts and can cause spurious `Permission denied (publickey)` errors.
- Confirm you're on the right instance with `curl -s ifconfig.me` (public IP) before trusting the shell prompt — private IPs (`172.31.x.x`) can look similar across unrelated instances in different VPCs.
- Get real DB user/name via `docker exec -t <postgres_container> env | grep POSTGRES` — don't assume prod and dev match even if container names are identical.
- `--no-owner --no-privileges` on `pg_restore` avoids role-mismatch errors if the DB roles differ between environments.

## Outstanding / to consider

- This dump contains real patient and billing data (PHI). If dev access is less locked down than prod, consider scrubbing patient names/phone/email/DOB after restore so dev doesn't hold raw PHI longer than necessary.
- Confirm dev's GitHub Actions / CI doesn't auto-reseed or migrate over this restored data unexpectedly on next deploy.
