# Developer Setup Guide

This guide helps developers run **MedizinHub HMS** locally on macOS, Windows, and Linux.

The project currently has two parts:

- Frontend: Next.js, React, TypeScript, Tailwind.
- Backend: FastAPI, SQLModel, SQLite quick-start, PostgreSQL for team development, Redis for background jobs, Alembic migrations.

## Prerequisites

Install these tools first:

| Tool | Recommended Version | Used For |
| --- | --- | --- |
| Node.js | 24 (see `.nvmrc`; required) | Frontend |
| npm | 10 or newer | Frontend dependencies |
| Python | 3.10 or newer | Backend |
| Git | Latest stable | Source control |

Optional for later production-like development:

- Docker Desktop

Docker Desktop is recommended for team development because it starts PostgreSQL, Redis, the API, frontend, and the monthly report worker with the same local configuration for everyone.

## macOS Setup

### 1. Install Tools

Using Homebrew:

```bash
brew install node python git
```

Check versions:

```bash
node --version
npm --version
python3 --version
git --version
```

### 2. Install Frontend Dependencies

From the project root:

```bash
nvm use  # if nvm is installed; selects Node 24 from .nvmrc
cd frontend
npm ci
npm run test:e2e:install  # once, when browser E2E tests are needed
cd ..
```

### 3. Install Backend Dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cd ..
```

### 4. Choose Database Mode

#### Option A: SQLite Quick Start

No setup is needed. If `MEDIZINHUB_DATABASE_URL` is not set, the backend uses:

```text
sqlite:///./medizinhub_hms.db
```

When the backend is started from the `backend` directory, the file is:

```text
backend/medizinhub_hms.db
```

#### Option B: PostgreSQL Team Setup

From the project root:

```bash
docker compose up -d postgres redis
```

Use this backend environment variable:

```bash
export MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms"
export MEDIZINHUB_REDIS_URL="redis://localhost:6380/0"
```

Run migrations:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
cd ..
```

### 5. Run Frontend

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

If Next.js starts on port `3001`, the backend allows that local origin also. For another frontend port, start the backend with:

```bash
MEDIZINHUB_CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002" .venv/bin/uvicorn app.main:app --reload --port 8000
```

The frontend calls `http://localhost:8000/api/v1` by default. To override it:

```bash
NEXT_PUBLIC_MEDIZINHUB_API_URL="http://localhost:8000/api/v1" npm run dev -- --hostname 127.0.0.1 --port 3000
```

For Docker dev, the checked-in `.env.example` uses the compose network URLs:

```env
MEDIZINHUB_DATABASE_URL=postgresql+psycopg://medizinhub:medizinhub_dev@postgres:5432/medizinhub_hms
MEDIZINHUB_REDIS_URL=redis://redis:6379/0
NEXT_PUBLIC_MEDIZINHUB_API_URL=http://localhost:8080/api/v1
```

Copy it to `.env` and fill only local secrets there. `.env` is ignored by Git; `.env.example` stays tracked as the safe template.

### 6. Run Backend

In a second terminal:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Open:

```text
http://localhost:8000/api/v1/health
http://localhost:8000/docs
```

### 7. Run Monthly Report Worker

Monthly email reports use Redis plus SMTP. In Docker dev the worker service is:

```bash
docker compose -f docker-compose.local.yml up -d redis report-worker
docker compose -f docker-compose.local.yml logs -f report-worker
```

Required `.env` values:

```env
MEDIZINHUB_REDIS_URL=redis://redis:6379/0
MEDIZINHUB_REPORT_QUEUE_NAME=medizinhub:reports:monthly
MEDIZINHUB_REPORT_WORKER_HEARTBEAT_KEY=medizinhub:workers:reports:heartbeat
MEDIZINHUB_REPORT_JOB_STALE_AFTER_SECONDS=900
MEDIZINHUB_SMTP_HOST=smtp.gmail.com
MEDIZINHUB_SMTP_PORT=587
MEDIZINHUB_SMTP_USERNAME=your-mailbox@example.com
MEDIZINHUB_SMTP_PASSWORD=your-app-password
MEDIZINHUB_SMTP_FROM_EMAIL=your-mailbox@example.com
MEDIZINHUB_SMTP_FROM_NAME=MedizinHub HMS Reports
MEDIZINHUB_SMTP_USE_TLS=true
```

After editing `.env`, recreate backend and worker so Docker reloads env values:

```bash
docker compose -f docker-compose.local.yml up -d --force-recreate backend report-worker
```

`ReportJob` rows in PostgreSQL are the durable queue. Redis only wakes the
worker quickly, so queued reports are still recovered after a Redis restart or
temporary outage. A worker that exits while a report is `running` is reclaimed
after `MEDIZINHUB_REPORT_JOB_STALE_AFTER_SECONDS`. Super admins can check the
worker heartbeat and queue ages at `GET /api/v1/platform/observability/metrics`.

## Windows Setup

### 1. Install Tools

Recommended:

- Install Node.js LTS from `https://nodejs.org`
- Install Python from `https://www.python.org/downloads/windows/`
- Install Git from `https://git-scm.com/download/win`

During Python installation, enable:

```text
Add python.exe to PATH
```

Check versions in PowerShell:

```powershell
node --version
npm --version
python --version
git --version
```

### 2. Install Frontend Dependencies

From the project root:

```powershell
cd frontend
npm ci
npm run test:e2e:install  # once, when browser E2E tests are needed
cd ..
```

### 3. Install Backend Dependencies

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
cd ..
```

If PowerShell blocks virtualenv activation, run PowerShell as your user and execute:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then activate again:

```powershell
.\backend\.venv\Scripts\Activate.ps1
```

### 4. Choose Database Mode

#### Option A: SQLite Quick Start

No setup is needed. If `MEDIZINHUB_DATABASE_URL` is not set, the backend uses:

```text
sqlite:///./medizinhub_hms.db
```

#### Option B: PostgreSQL Team Setup

From the project root:

```powershell
docker compose up -d postgres redis
```

Set backend environment variables in the PowerShell terminal used to run the backend:

```powershell
$env:MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms"
$env:MEDIZINHUB_REDIS_URL="redis://localhost:6379/0"
```

Run migrations:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
alembic upgrade head
cd ..
```

### 5. Run Frontend

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

### 6. Run Backend

In a second PowerShell terminal:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Open:

```text
http://localhost:8000/api/v1/health
http://localhost:8000/docs
```

## Linux Setup

### 1. Install Tools

Ubuntu/Debian example:

```bash
sudo apt update
sudo apt install -y nodejs npm python3 python3-venv python3-pip git
```

For newer Node.js versions, prefer NodeSource or nvm.

Check versions:

```bash
node --version
npm --version
python3 --version
git --version
```

### 2. Install Frontend Dependencies

From the project root:

```bash
nvm use  # if nvm is installed; selects Node 24 from .nvmrc
cd frontend
npm ci
npm run test:e2e:install  # once, when browser E2E tests are needed
cd ..
```

### 3. Install Backend Dependencies

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cd ..
```

### 4. Choose Database Mode

#### Option A: SQLite Quick Start

No setup is needed. If `MEDIZINHUB_DATABASE_URL` is not set, the backend uses:

```text
sqlite:///./medizinhub_hms.db
```

#### Option B: PostgreSQL Team Setup

From the project root:

```bash
docker compose up -d postgres redis
```

Use this backend environment variable:

```bash
export MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms"
export MEDIZINHUB_REDIS_URL="redis://localhost:6379/0"
```

Run migrations:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
cd ..
```

### 5. Run Frontend

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### 6. Run Backend

In a second terminal:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Open:

```text
http://localhost:8000/api/v1/health
http://localhost:8000/docs
```

## Run Tests

### Frontend Tests

From the project root:

```bash
npm test
```

### Backend Tests

macOS/Linux:

```bash
backend/.venv/bin/python -m pytest
backend/.venv/bin/ruff check backend/app backend/tests
```

Windows PowerShell:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest
.\backend\.venv\Scripts\ruff.exe check backend/app backend/tests
```

## Backend API Quick Check

Health:

```bash
curl http://localhost:8000/api/v1/health
```

Create a tenant:

```bash
curl -X POST http://localhost:8000/api/v1/tenants \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Clinic"}'
```

List modules:

```bash
curl http://localhost:8000/api/v1/modules
```

Windows PowerShell equivalent:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:8000/api/v1/tenants `
  -ContentType "application/json" `
  -Body '{"name":"Demo Clinic"}'
```

## Local URLs

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend health | `http://localhost:8000/api/v1/health` |
| Backend docs | `http://localhost:8000/docs` |
| Backend OpenAPI JSON | `http://localhost:8000/openapi.json` |

## Environment Variables

Current backend environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MEDIZINHUB_APP_NAME` | `MedizinHub HMS API` | API display name |
| `MEDIZINHUB_APP_VERSION` | root `VERSION` | Optional runtime override; official deployments inject the tracked product release version |
| `MEDIZINHUB_BUILD_COMMIT` | `unknown` | Git commit identifying the deployed build |
| `MEDIZINHUB_BUILD_TIME` | empty | UTC timestamp assigned by the deployment workflow |
| `MEDIZINHUB_ENVIRONMENT` | `local` | Runtime environment |
| `MEDIZINHUB_API_PREFIX` | `/api/v1` | API route prefix |
| `MEDIZINHUB_ENABLE_DOCS` | `true` | Enable Swagger/ReDoc |
| `MEDIZINHUB_FILE_STORAGE_BACKEND` | `local` | File storage adapter: `local` or `s3` |
| `MEDIZINHUB_AWS_S3_BUCKET` | empty | Private S3 bucket required by the `s3` adapter |
| `MEDIZINHUB_AWS_S3_REGION` | `ap-south-1` | S3 bucket region |
| `MEDIZINHUB_AWS_S3_PREFIX` | empty | Optional server-controlled object-key prefix |
| `MEDIZINHUB_AWS_S3_ENDPOINT_URL` | empty | Optional MinIO/LocalStack endpoint; leave empty for AWS |
| `MEDIZINHUB_AWS_S3_KMS_KEY_ID` | empty | Optional KMS key ID; otherwise uploads use SSE-S3 |
| `MEDIZINHUB_AWS_S3_PRESIGNED_URL_TTL_SECONDS` | `900` | Short-lived external download URL duration |
| `MEDIZINHUB_PERMANENT_INVOICE_DELIVERY_ENABLED` | `true` | Rollout switch for invoice finalization, regeneration, and delivery |
| `MEDIZINHUB_DATABASE_URL` | `sqlite:///./medizinhub_hms.db` | Database URL |
| `MEDIZINHUB_REDIS_URL` | empty | Future Redis URL |
| `MEDIZINHUB_AUTO_CREATE_TABLES` | `true` | Auto-create SQLModel tables on app startup. Keep `true` for SQLite quick-start; set `false` when relying strictly on Alembic migrations. |

### Permanent invoice delivery flow

Paid invoices use one immutable finalized PDF for normal WhatsApp resends:

1. Read `GET /api/v1/billing/invoices/{invoice_id}/document`.
2. When `exists` is false, generate the PDF once and upload it to
   `POST /api/v1/billing/invoices/{invoice_id}/document/finalize`.
3. Send or resend with JSON to `POST /api/v1/billing/invoices/{invoice_id}/send`.
   This request never accepts or creates another PDF.
4. Use `document/regenerate` only for a corrected invoice. Supply the current
   `expected_version`, a replacement PDF, and an audit reason.

Each notification row pins the exact artifact file ID and version. The worker
creates a fresh short-lived S3 URL only when processing or retrying the message,
so URL expiry never deletes or invalidates the permanent stored invoice.

Example:

```bash
MEDIZINHUB_DATABASE_URL="sqlite:///./local_hms.db" uvicorn app.main:app --reload --port 8000
```

PostgreSQL example:

```bash
MEDIZINHUB_DATABASE_URL="postgresql+psycopg://medizinhub:medizinhub_dev@localhost:5433/medizinhub_hms" uvicorn app.main:app --reload --port 8000
```

## Alembic Migrations

Run migrations from the `backend` directory:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

Create a new migration after changing SQLModel models:

```bash
alembic revision --autogenerate -m "describe change"
```

Review the generated migration before committing it.

For strict migration testing, run the backend with:

```bash
export MEDIZINHUB_AUTO_CREATE_TABLES=false
```

## Common Issues

### Port Already In Use

Frontend:

```bash
npm run dev -- --port 3001
```

Backend:

```bash
uvicorn app.main:app --reload --port 8001
```

### Python Virtualenv Not Activated

If `pytest`, `ruff`, or `uvicorn` is not found, activate the backend virtualenv again.

macOS/Linux:

```bash
source backend/.venv/bin/activate
```

Windows:

```powershell
.\backend\.venv\Scripts\Activate.ps1
```

### Delete and Recreate Backend Virtualenv

macOS/Linux:

```bash
rm -rf backend/.venv
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force backend\.venv
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
```

### Clear Frontend Dependencies

macOS/Linux:

```bash
cd frontend
rm -rf node_modules
npm ci
```

Windows PowerShell:

```powershell
cd frontend
Remove-Item -Recurse -Force node_modules
npm ci
```

## Recommended Daily Developer Workflow

1. Pull latest code.
2. Run `cd frontend && npm ci` if `frontend/package-lock.json` changed.
3. Run backend dependency install if `backend/requirements*.txt` changed.
4. Start backend on port `8000`.
5. Start frontend on port `3000`.
6. Run tests before pushing changes.

Commands:

```bash
npm --prefix frontend test
backend/.venv/bin/python -m pytest
backend/.venv/bin/ruff check backend/app backend/tests
```
