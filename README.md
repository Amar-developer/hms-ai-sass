# MedizinHub HMS

Multi-tenant healthcare management system with Next.js frontend, FastAPI backend, PostgreSQL, Docker deployment, clinical workflows, billing, files, notifications, and SaaS administration.

## Product documentation

The canonical project documentation lives in `docs/`:

- [Documentation index](./docs/README.md)
- [Complete project documentation](./docs/complete-project-documentation.md)
- [Architecture and data reference](./docs/architecture-and-data.md)
- [Frontend architecture](./docs/frontend-architecture.md)
- [Backend architecture](./docs/backend-architecture.md)
- [API design and request lifecycle](./docs/api-design-and-request-lifecycle.md)
- [API performance hotspots](./docs/api-performance-hotspots.md)
- [Database connection and data](./docs/database-connection-and-data.md)
- [External integrations](./docs/external-integrations.md)
- [Authentication and authorization](./docs/authentication-and-authorization.md)
- [Design patterns and SOLID principles](./docs/design-patterns-and-solid.md)
- [Logging, tracing, and observability](./docs/logging-tracing-observability.md)
- [Development workflow](./docs/development-workflow.md)
- [Operations runbook](./docs/operations-runbook.md)
- [Security and compliance](./docs/security-compliance.md)
- [Product and roadmap](./docs/product-and-roadmap.md)
- [API permission matrix](./docs/api-permission-matrix.md)

## Run

```bash
nvm use  # if nvm is installed; selects Node 24 from .nvmrc
cd frontend
npm ci
npm run dev
```

Open http://localhost:3000

## Before pushing to GitHub

Install the local Git hooks once after cloning the repo:

```bash
cd frontend
npm run hooks:install
```

The pre-push hook only runs backend lint, backend pytest checks, frontend unit
tests, typecheck, and build. It does **not** run backend E2E or frontend
Playwright E2E. Frontend Playwright E2E is manual-only; backend E2E runs on
protected branch pushes. To catch the automatic CI gates locally before pushing,
run this from the repo root:

```bash
bash scripts/verify_all.sh --fast          # PR-style gate, for quick iteration
bash scripts/verify_all.sh                 # full develop/main-style gate
bash scripts/verify_all.sh --frontend-e2e  # also run manual Playwright E2E
```

One-time setup this needs (see [backend/README.md](./backend/README.md)):

```bash
docker compose up -d postgres redis
PGPASSWORD=medizinhub_dev createdb -h 127.0.0.1 -p 5433 -U medizinhub medizinhub_e2e
cd frontend && npm run test:e2e:install
```

The frontend E2E runner creates `medizinhub_frontend_e2e` on its first run
when the local PostgreSQL user has database-creation permission. It refuses
non-local database hosts and database names that do not end in `_e2e`.

Run the local quality gate from the frontend package:

```bash
cd frontend
npm run quality:fast  # PR-style fast gate
npm run quality       # full backend suite + frontend gate
```

The full command runs:

```bash
# Backend linting
../backend/.venv/bin/ruff check ../backend/app ../backend/tests ../backend/e2e ../backend/scripts

# Backend tests
../backend/.venv/bin/pytest ../backend/tests -q

# Frontend tests
npm test

# Frontend TypeScript check
npm run typecheck

# Frontend production build
npm run build
```

`npm run quality:fast` runs backend tests with `-m "unit and not e2e"`.
`npm run quality` does **not** run E2E — use `bash scripts/verify_all.sh`
above for the protected branch gates. The individual E2E commands, if you want
to run one on its own:

```bash
npm run test:e2e               # frontend, chromium only, @critical
npm run test:e2e:extended      # frontend, chromium only, 21 @extended tests
npm run test:e2e:cross-browser # frontend, chromium + firefox + webkit, @critical
bash ../backend/scripts/run_backend_e2e.sh   # backend, live API suite
```

GitHub Actions runs a fast backend gate on pull requests and the full backend
suite plus PostgreSQL-backed backend E2E on pushes to `main` and `develop`.
Frontend Playwright E2E is not automatic; run the manual `Frontend E2E Cross
Browser` workflow when browser coverage is needed.

```bash
bash backend/scripts/run_backend_e2e.sh
```

## Backend scaffold

The FastAPI backend foundation is in [backend](./backend). It currently includes health/readiness APIs, tenant context middleware, a plug-and-play module manifest, and starter tests.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

## Fresh SaaS setup and super admin tenant flow

MedizinHub HMS is a tenant-based SaaS application. A fresh installation must have exactly one primary platform tenant and one super admin. The super admin logs in without selecting a customer tenant, then creates and manages customer tenants.

Plain first-pull setup for team members using Docker:

```text
git clone https://github.com/teanso-tech/medizinhub-hms.git
cd medizinhub-hms
git checkout main
git pull origin main
sudo docker compose -f docker-compose.local.yml up --build
```

For an existing clone:

```text
cd medizinhub-hms
git checkout main
git pull origin main
sudo docker compose -f docker-compose.local.yml up --build
```

PostgreSQL runs through Docker Compose in this setup. Team members do not need to manually install PostgreSQL.

1. Start the backend and frontend.
2. Create the first platform super admin once:

```bash
curl -X POST http://localhost:8000/api/v1/auth/bootstrap-super-admin \
  -H "Content-Type: application/json" \
  -d '{"name":"Platform Super Admin","email":"admin@medizinhub.local","password":"ChangeMe@123"}'
```

If a super admin already exists, this endpoint returns `409`. Use the existing super admin login, or run `backend/database/reset_super_admin.py` only in a controlled development/support environment.

3. Log in as the super admin. Do not pass `tenant_id` for this login:

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@medizinhub.local","password":"ChangeMe@123"}'
```

4. Create customer tenants from the Super Admin dashboard, or call the backend onboarding API. The onboarding API creates tenant metadata, branches, subscription assignment, tenant admin role, and tenant admin login in one server-side flow:

```bash
curl -X POST http://localhost:8000/api/v1/tenants/onboard \
  -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": {"name":"Fresh Clinic","tenant_type":"clinic","status":"active","email":"owner@freshclinic.test"},
    "branches": [{"name":"Main Branch","code":"MAIN"}],
    "subscription_plan_id":"<PLAN_ID>",
    "admin_user": {"name":"Tenant Admin","email":"admin@freshclinic.test","password":"TenantPass123"}
  }'
```

Tenant admins and staff must log in with their customer `tenant_id`. The primary tenant stays reserved for platform-only work such as tenant creation, templates, plans, and global settings.

## Added in v6
- Doctor consultation workspace with prescription, patient remarks and notes
- Lab test referral and scan referral capture
- Recommend/referral to another doctor
- Doctor fee setting by clinic + department + doctor
- OP, IP fixed, IP percentage, online and home visit consultation fees
- Extra fee capture during consultation
- Doctor-wise revenue analytics
- Lab tests written by doctor
- Scans referred by doctor
- Medicine value referred to pharmacy
- Overall monthly revenue report

## Core modules retained
- Multi clinic / polyclinic / multi-speciality hospital
- Single and multiple branch support
- Appointment booking
- New patient creation
- OP and IP flows
- Token queue normal/emergency
- Doctor dashboard
- Lab, pharmacy/prescription, billing, subscriptions and reports



# FOR DEVELOPMENT
# First time or after requirements.txt / package.json changes
docker compose -f docker-compose.local.yml up --build

# Normal start (after first build)
docker compose -f docker-compose.local.yml up

# Stop everything
docker compose -f docker-compose.local.yml down

# FOR PRODUCTION
# 1. Build all images fresh
docker compose build

# 2. Start everything in background (-d = detached)
docker compose up -d

# 3. Check all containers are running
docker compose ps

# 4. Watch logs (all services)
docker compose logs -f

# 5. Watch logs for one service only
docker compose logs -f backend

# 6. Stop everything (keeps data volumes)
docker compose down

# 7. Stop and DELETE all data volumes (careful!)
docker compose down -v

# 8. Migration cmd
docker compose -f docker-compose.local.yml exec backend alembic -c alembic/alembic.ini upgrade head

# Live Docker disk cleanup when deployment fails with "no space left on device"
# Safe for production data: this removes stopped containers, unused images, and build cache, not named volumes.
docker system df
docker builder prune -af
docker image prune -af
docker container prune -f
docker compose build --pull
docker compose up -d --remove-orphans



# Docker setup system requirements
1. Install docker from browsers in windows

2. wsl --install ---> install wsl in windows

3. clone our woriking github repository

4. check PostgreSQL db and fresh super admin setup

5. wsl --install -d Ubuntu ---> install ubuntu in windows

6. Open Ubuntu
wsl -d Ubuntu ---> use this command
First time setup:
create Linux username
create password

Open working repository in vs code via Ubuntu

7. wsl --version ---> to check wsl installed or not and its version

8. wsl -l -v   ---> List installed distros

9. wsl --shutdown ---> Shutdown WSL

10. wsl --terminate Ubuntu ---> Stop One Distro


# verified

# Server Operations Command Reference
> Clean command reference based on today's operations.
> Replace placeholders like `YOUR_EMAIL`, `YOUR_PASSWORD`, `YOUR_EC2_IP` with actual values.

---

## 1. Fix Backend CORS Error

```bash
# Edit .env - CORS must be JSON array format
nano ~/medizinhub-hms/.env

# Correct format
MEDIZINHUB_CORS_ORIGINS=["http://YOUR_EC2_IP:3000","http://YOUR_EC2_IP:8080"]
# OR with domain
MEDIZINHUB_CORS_ORIGINS=["https://YOUR_DOMAIN.com","http://YOUR_DOMAIN.com"]

# Restart backend after .env change
sudo docker compose up -d backend report-worker
sleep 10
sudo docker compose ps
```

---

## 2. Fix Containerd Disk Full (Move to /mnt)

```bash
# Stop everything
cd ~/medizinhub-hms
sudo docker compose down
sudo systemctl stop docker
sudo systemctl stop docker.socket
sudo systemctl stop containerd

# Move containerd to /mnt
sudo mv /var/lib/containerd /mnt/additional-storage/containerd
sudo ln -s /mnt/additional-storage/containerd /var/lib/containerd

# Verify symlink
ls -la /var/lib/containerd

# Start services
sudo systemctl start containerd
sudo systemctl start docker
sudo docker compose up -d

# Verify disk freed
df -h /
df -h /mnt/additional-storage
```

---

## 3. Check Database Tables & Row Counts

```bash
sudo docker compose exec postgres psql -U medizinhub -d medizinhub_hms -c "
SELECT
    relname as table_name,
    n_live_tup as row_count
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;"
```

---

## 4. Check Tenant Details

```bash
sudo docker compose exec postgres psql -U medizinhub -d medizinhub_hms -c "
SELECT
    id,
    name,
    email,
    status,
    tenant_type,
    is_primary,
    created_at
FROM tenant
ORDER BY created_at;"
```

---

## 5. Quick Database Summary

```bash
sudo docker compose exec postgres psql -U medizinhub -d medizinhub_hms -c "
SELECT
  (SELECT COUNT(*) FROM tenant) as tenants,
  (SELECT COUNT(*) FROM \"user\") as users,
  (SELECT COUNT(*) FROM patient) as patients,
  (SELECT COUNT(*) FROM appointment) as appointments,
  (SELECT COUNT(*) FROM practitioner) as practitioners;"
```

---

## 6. Clear All Data (Truncate with FK Bypass)

```bash
# WARNING: Deletes ALL data except alembic_version
sudo docker compose exec postgres psql -U medizinhub -d medizinhub_hms -c "
DO \$\$
DECLARE r RECORD;
BEGIN
    SET session_replication_role = replica;
    FOR r IN (SELECT tablename FROM pg_tables
              WHERE schemaname = 'public'
              AND tablename != 'alembic_version') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    SET session_replication_role = DEFAULT;
END \$\$;"
```

---

## 7. Create / Reset Super Admin

Interactive local run:

```bash
sudo docker compose exec backend python -m database.reset_super_admin
```

Non-interactive run:

```bash
sudo docker compose exec \
  -e MEDIZINHUB_SUPER_ADMIN_EMAIL="YOUR_EMAIL" \
  -e MEDIZINHUB_SUPER_ADMIN_PASSWORD="YOUR_PASSWORD" \
  backend python -m database.reset_super_admin
```

---

## 8. Reset All Data & Recreate Super Admin

Interactive local run:

```bash
# Deletes all rows, keeps only super admin + default plans
sudo docker compose exec \
  -e MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV \
  backend python -m database.reset_demo_data
```

Non-interactive run:

```bash
# Deletes all rows, keeps only super admin + default plans
sudo docker compose exec \
  -e MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV \
  -e MEDIZINHUB_SUPER_ADMIN_EMAIL="YOUR_EMAIL" \
  -e MEDIZINHUB_SUPER_ADMIN_PASSWORD="YOUR_PASSWORD" \
  backend python -m database.reset_demo_data
```

---

## 9. Seed Demo Data

```bash
# Insert demo/test data
sudo docker compose exec backend python -m database.seed_demo_data
```

```bash
# Delete demo data later
sudo docker compose exec \
  -e MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV \
  backend python -m database.reset_demo_data
```

---

## 10. Health Checks

```bash
# All containers status
sudo docker compose ps

# Backend API health
curl http://localhost:8080/api/v1/health

# Through domain
curl https://YOUR_DOMAIN.com/api/v1/health

# Frappe site
curl -I https://YOUR_FRAPPE_DOMAIN.com/login

# Frappe services
sudo supervisorctl status
```

---

## 11. Disk Usage Checks

```bash
# Overall disk
df -h

# What's using root disk
sudo du -xh / --max-depth=1 2>/dev/null | sort -hr

# What's using /var
sudo du -xh /var --max-depth=2 2>/dev/null | sort -hr | head -20

# What's using /mnt
sudo du -sh /mnt/additional-storage/* 2>/dev/null | sort -rh

# Containerd specifically
sudo du -xh /var/lib/containerd --max-depth=2 | sort -hr | head -10
```

---

## 12. Free Up Disk Space

```bash
# Clean Docker unused images/containers/cache
sudo docker system prune -a -f

# Clean system journals
sudo journalctl --vacuum-size=50M

# Clean apt cache
sudo apt-get clean
sudo apt-get autoremove -y

# Clean old logs
sudo find /var/log -name "*.gz" -delete
sudo find /var/log -name "*.old" -delete

# Clean snap cache
sudo rm -rf /var/lib/snapd/cache/*
```

---

## 13. Docker Storage Location Check

```bash
# Verify Docker is using /mnt
docker info | grep "Docker Root Dir"
# Expected: /mnt/additional-storage/docker

# Verify containerd is using /mnt
ls -la /var/lib/containerd
# Expected: /var/lib/containerd -> /mnt/additional-storage/containerd

# Verify MariaDB is using /mnt
ls -la /var/lib/mysql
# Expected: /var/lib/mysql -> /mnt/additional-storage/mysql
```

---

## 14. Restart All Services

```bash
# Restart MedizinHub containers
cd ~/medizinhub-hms
sudo docker compose restart

# Restart only specific service
sudo docker compose restart backend
sudo docker compose restart frontend

# Rebuild and restart
sudo docker compose up -d --build

# Restart Frappe
sudo supervisorctl restart all

# Restart MariaDB
sudo systemctl restart mariadb

# Restart Nginx
sudo systemctl reload nginx
```

---

## 15. Nginx Config Check

```bash
# Test nginx config syntax
sudo nginx -t

# Reload nginx (no downtime)
sudo systemctl reload nginx

# Check which domains are configured
cat /etc/nginx/conf.d/*.conf | grep server_name

# View full nginx config
cat /etc/nginx/conf.d/frappe-bench.conf
```

## ⚠️ Commands to NEVER Run on Production

```bash
# NEVER - deletes all Docker volumes including database!
docker compose down -v

# NEVER - deletes database volume!
docker volume rm medizinhub-hms_medizinhub_postgres_data

# NEVER - deletes persistent patient/document uploads!
docker volume rm medizinhub-hms_medizinhub_uploads_data

# NEVER without backup - removes MariaDB data!
sudo apt-get remove --purge mysql*
# If this prompt appears: "Remove all MariaDB databases?" → ALWAYS SELECT NO!
```

---

## Safe Commands (Data is Always Preserved)

```bash
# Safe - keeps volumes/data
sudo docker compose down
sudo docker compose up -d
sudo docker compose up -d --build
sudo docker compose restart
```

---

*Reference guide — replace all YOUR_* placeholders with actual values before running*
# hms-ai-sass
# hms-ai-sass
