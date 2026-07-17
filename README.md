# MedizinHub HMS Complete v6 - Doctor Revenue & Consultation Billing

Runnable NextJS + Tailwind frontend prototype.

## Product documentation

This project now includes a practical documentation backbone for evolving the prototype into a plug-and-play smart healthcare SaaS platform:

- [Documentation index](./docs/README.md)
- [Developer setup guide](./docs/developer-setup.md)
- [EC2 Docker deployment guide](./docs/ec2-docker-deployment.md)
- [CI/CD testing strategy](./docs/ci-cd-testing-strategy.md)
- [Product blueprint](./docs/product-blueprint.md)
- [Development master prompt](./docs/development-master-prompt.md)
- [Backend architecture spec](./docs/backend-architecture-spec.md)
- [Source control and quality guide](./docs/source-control-and-quality-guide.md)
- [Module catalog](./docs/module-catalog.md)
- [Data, security, and India compliance](./docs/data-security-compliance.md)
- [SaaS plans and roadmap](./docs/saas-plans-roadmap.md)

## Run

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## Before pushing to GitHub

Install the local Git hooks once after cloning the repo:

```bash
cd frontend
npm run hooks:install
```

The pre-push hook only runs backend lint, backend unit tests, frontend unit
tests, typecheck, and build. It does **not** run backend E2E or frontend
Playwright E2E — those only run in GitHub Actions unless you run them
yourself, which is why an E2E-only bug can pass every local check and still
fail in CI. To catch that locally before pushing, run everything CI runs
with one command, from the repo root:

```bash
bash scripts/verify_all.sh          # everything, same order as CI
bash scripts/verify_all.sh --fast   # skip both E2E suites, for quick iteration
```

One-time setup this needs (see [backend/README.md](./backend/README.md)):

```bash
docker compose up -d postgres redis
PGPASSWORD=medizinhub_dev createdb -h 127.0.0.1 -p 5433 -U medizinhub medizinhub_e2e
PGPASSWORD=medizinhub_dev createdb -h 127.0.0.1 -p 5433 -U medizinhub medizinhub_frontend_e2e
cd frontend && npx playwright install --with-deps chromium firefox webkit
```

Run the full local quality gate from the frontend package before every push:

```bash
cd frontend
npm run quality
```

That command runs:

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

`npm run quality` does **not** run E2E — use `bash scripts/verify_all.sh`
above for that. The individual E2E commands it wraps, if you want to run
one on its own:

```bash
npm run test:e2e               # frontend, chromium only, @critical
npm run test:e2e:extended      # frontend, chromium only, full suite
npm run test:e2e:cross-browser # frontend, chromium + firefox + webkit, @critical
bash ../backend/scripts/run_backend_e2e.sh   # backend, live API suite
```

GitHub Actions runs the same main checks on pull requests and pushes to
`main`, `master`, and `develop`. It also runs the PostgreSQL-backed live
backend and frontend E2E suites. Pull requests run the critical Chromium
browser suite; main/develop runs the extended Chromium suite.

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

1. Start the backend and frontend.
2. Create the first platform super admin once:

```bash
curl -X POST http://localhost:8000/api/v1/auth/bootstrap-super-admin \
  -H "Content-Type: application/json" \
  -d '{"name":"Platform Super Admin","email":"admin@medizinhub.local","password":"ChangeMe@123"}'
```

If a super admin already exists, this endpoint returns `409`. Use the existing super admin login, or run `backend/scripts/reset_super_admin.py` only in a controlled development/support environment.

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

```bash
sudo docker compose exec \
  -e MEDIZINHUB_SUPER_ADMIN_EMAIL="YOUR_EMAIL" \
  -e MEDIZINHUB_SUPER_ADMIN_PASSWORD="YOUR_PASSWORD" \
  backend python scripts/reset_super_admin.py
```

---

## 8. Reset All Data & Recreate Super Admin

```bash
# Deletes all rows, keeps only super admin + default plans
sudo docker compose exec \
  -e MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV \
  -e MEDIZINHUB_SUPER_ADMIN_EMAIL="YOUR_EMAIL" \
  -e MEDIZINHUB_SUPER_ADMIN_PASSWORD="YOUR_PASSWORD" \
  backend python scripts/reset_demo_data.py
```

---

## 9. Seed Demo Data

```bash
# Insert demo/test data
sudo docker compose exec backend python scripts/seed_demo.py

# Delete demo data later
sudo docker compose exec \
  -e MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV \
  backend python scripts/reset_demo_data.py
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

---

## Dev Live Demo Credentials

Show the login shortcut panel only on development/demo deployments:

```bash
cd ~/medizinhub-hms

# Dev/demo server only
printf '\nNEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=true\n' >> .env

sudo docker compose build frontend
sudo docker compose up -d frontend
```

For production, keep this unset or false:

```bash
NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=false
```

---

## ⚠️ Commands to NEVER Run on Production

```bash
# NEVER - deletes all Docker volumes including database!
docker compose down -v

# NEVER - deletes database volume!
docker volume rm medizinhub-hms_medizinhub_postgres_data

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
