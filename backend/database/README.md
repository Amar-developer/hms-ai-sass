# Database Toolkit

This folder contains stable database commands for the current main-line schema.

Current `main` Alembic head:

```text
20260806_0106
```

Use this folder for database lifecycle work:

- create or repair the primary SaaS super admin
- reset local/dev data safely
- seed demo data after migrations
- inspect the schema generated from the current app models

## First pull project

Plain command flow for a team member using the stable `main` branch:

```text
git clone https://github.com/teanso-tech/medizinhub-hms.git
cd medizinhub-hms
git checkout main
git pull origin main
sudo docker compose -f docker-compose.local.yml up --build
```

If the project is already cloned:

```text
cd medizinhub-hms
git checkout main
git pull origin main
sudo docker compose -f docker-compose.local.yml up --build
```

PostgreSQL is started by Docker Compose. No manual PostgreSQL install is required for this setup.

## Commands

Run commands from the backend container or from the `backend/` directory with the backend virtualenv active.

### Reset/create super admin

Interactive:

```bash
python -m database.reset_super_admin
```

Non-interactive:

```bash
MEDIZINHUB_SUPER_ADMIN_EMAIL="YOUR_EMAIL" \
MEDIZINHUB_SUPER_ADMIN_PASSWORD="YOUR_PASSWORD" \
python -m database.reset_super_admin
```

The reset flow does not hardcode a super admin email or password. It prompts during interactive runs and requires env values for non-interactive runs.

### Reset all local/dev data

Interactive:

```bash
MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV python -m database.reset_demo_data
```

Non-interactive:

```bash
MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV \
MEDIZINHUB_SUPER_ADMIN_EMAIL="YOUR_EMAIL" \
MEDIZINHUB_SUPER_ADMIN_PASSWORD="YOUR_PASSWORD" \
python -m database.reset_demo_data
```

This deletes all rows from the configured database and recreates only:

- default subscription plans
- primary platform tenant
- super admin user
- super admin role and permissions
- tenant admin template role

Do not run this against production or shared real data.

### Seed demo data

```bash
python -m database.seed_demo_data
```

This populates demo tenant, users, patients, appointments, queue, consultation, billing, lab, pharmacy, notifications, and subscription demo data based on the current app tables.

### Print schema summary

```bash
python -m database.schema_summary --pretty
```

The schema summary is generated from `SQLModel.metadata` after importing `app.models`, so it follows the current branch's model definitions.

For a compact table-name list:

```bash
python -m database.schema_summary --table-names --pretty
```

## Docker examples

Start the local stack first:

```bash
sudo docker compose -f docker-compose.local.yml up --build
```

Expected startup summary looks similar to:

```text
[+] up 5/5
✔ Container medizinhub-postgres       Healthy
✔ Container medizinhub-redis          Healthy
✔ Container medizinhub-backend        Healthy
✔ Container medizinhub-frontend       Running
✔ Container medizinhub-report-worker  Running
```

### Reset/create super admin from Docker

```bash
sudo docker compose exec backend python -m database.reset_super_admin
```

Sample interactive prompts:

```text
Super admin email: admin@example.com
Super admin password:
Confirm super admin password:
Super admin login repaired.
Email: admin@example.com
Password: <provided at runtime>
Tenant: MedizinHub HMS (tenant_xxxxxxxxxxxx)
```

Non-interactive Docker command:

```bash
sudo docker compose exec \
  -e MEDIZINHUB_SUPER_ADMIN_EMAIL="admin@example.com" \
  -e MEDIZINHUB_SUPER_ADMIN_PASSWORD="StrongPassword@123" \
  backend python -m database.reset_super_admin
```

Sample output:

```text
Super admin login repaired.
Email: admin@example.com
Password: <provided at runtime>
Tenant: MedizinHub HMS (tenant_xxxxxxxxxxxx)
```

### Reset all local/dev data from Docker

```bash
sudo docker compose exec \
  -e MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV \
  backend python -m database.reset_demo_data
```

Sample interactive prompts:

```text
Super admin email: admin@example.com
Super admin password:
Confirm super admin password:
{
  "fresh_setup": {
    "demo_data_seeded": false,
    "primary_tenant_id": "tenant_xxxxxxxxxxxx",
    "primary_tenant_name": "MedizinHub HMS",
    "super_admin_email": "admin@example.com"
  },
  "reset": true
}
```

Non-interactive Docker command:

```bash
sudo docker compose exec \
  -e MEDIZINHUB_RESET_CONFIRM=RESET_MEDIZINHUB_DEV \
  -e MEDIZINHUB_SUPER_ADMIN_EMAIL="admin@example.com" \
  -e MEDIZINHUB_SUPER_ADMIN_PASSWORD="StrongPassword@123" \
  backend python -m database.reset_demo_data
```

Sample output:

```text
{
  "fresh_setup": {
    "demo_data_seeded": false,
    "primary_tenant_id": "tenant_xxxxxxxxxxxx",
    "primary_tenant_name": "MedizinHub HMS",
    "super_admin_email": "admin@example.com"
  },
  "reset": true
}
```

### Seed demo data from Docker

```bash
sudo docker compose exec backend python -m database.seed_demo_data
```

Sample output:

```text
{
  "appointment_id": "appointment_xxxxxxxxxxxx",
  "branch_id": "branch_xxxxxxxxxxxx",
  "doctor_email": "doctor@demo.medizinhub.local",
  "invoice_number": "MHD-...",
  "patient_number": "DEMO-0001",
  "tenant_admin_email": "linuxuser206@gmail.com",
  "tenant_id": "tenant_xxxxxxxxxxxx",
  "token_number": "N-001"
}
```

The real output contains more IDs and demo login values. Use only local/demo environments for this command.

### Print full schema summary from Docker

```bash
sudo docker compose exec backend python -m database.schema_summary --pretty
```

Sample output shape:

```text
{
  "alembic_head": "20260806_0106",
  "table_count": 98,
  "tables": [
    {
      "name": "tenant",
      "columns": [
        {
          "name": "id",
          "type": "VARCHAR",
          "nullable": false,
          "primary_key": true
        }
      ],
      "indexes": [],
      "foreign_keys": []
    }
  ]
}
```

### Print compact table list from Docker

```bash
sudo docker compose exec backend python -m database.schema_summary --table-names --pretty
```

Sample output:

```text
{
  "alembic_head": "20260806_0106",
  "table_count": 98,
  "tables": [
    "tenant",
    "branch",
    "department",
    "user",
    "patient",
    "appointment",
    "invoice",
    "notificationevent"
  ]
}
```
