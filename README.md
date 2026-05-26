# MedizinHub HMS Complete v6 - Doctor Revenue & Consultation Billing

Runnable NextJS + Tailwind frontend prototype.

## Product documentation

This project now includes a practical documentation backbone for evolving the prototype into a plug-and-play smart healthcare SaaS platform:

- [Documentation index](./docs/README.md)
- [Developer setup guide](./docs/developer-setup.md)
- [Product blueprint](./docs/product-blueprint.md)
- [Development master prompt](./docs/development-master-prompt.md)
- [Backend architecture spec](./docs/backend-architecture-spec.md)
- [Plug-and-play architecture](./docs/plug-and-play-architecture.md)
- [Source control and quality guide](./docs/source-control-and-quality-guide.md)
- [Module catalog](./docs/module-catalog.md)
- [Data, security, and India compliance](./docs/data-security-compliance.md)
- [Technology strategy](./docs/technology-strategy.md)
- [SaaS plans and roadmap](./docs/saas-plans-roadmap.md)

## Run
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Before pushing to GitHub

Run these checks from the project root before pushing backend changes:

```bash
backend/.venv/bin/ruff check backend/app backend/tests
backend/.venv/bin/pytest backend/tests -q
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
docker compose -f docker-compose.dev.yml up --build

# Normal start (after first build)
docker compose -f docker-compose.dev.yml up

# Stop everything
docker compose -f docker-compose.dev.yml down

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
docker compose -f docker-compose.dev.yml exec backend alembic -c alembic/alembic.ini upgrade head



# Docker setup system requirements
1. Install docker from browsers in windows

2. wsl --install ---> install wsl in windows

3. clone our woriking github repository

4. check postgreSQL db and seed data

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




