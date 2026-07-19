# EC2 Docker Deployment

This guide deploys MedizinHub HMS from GitHub to one Ubuntu EC2 instance using Docker Compose.

## 1. EC2 Security Group

Open only the ports you need:

| Type | Port | Source | Purpose |
| --- | --- | --- | --- |
| SSH | 22 | Your IP only | Server login |
| HTTP | 80 | `0.0.0.0/0` | Optional reverse proxy |
| HTTPS | 443 | `0.0.0.0/0` | Optional reverse proxy |
| Custom TCP | 3000 | Your IP or `0.0.0.0/0` | Next.js frontend without Nginx |
| Custom TCP | 8080 | Your IP or `0.0.0.0/0` | FastAPI backend without Nginx |

Do not open PostgreSQL `5433` or Redis `6380` to the internet.

## 2. Connect to EC2

Use the username for your AMI:

```bash
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

For Amazon Linux, use:

```bash
ssh -i your-key.pem ec2-user@YOUR_EC2_PUBLIC_IP
```

## 3. Install Docker on Ubuntu

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo ${UBUNTU_CODENAME:-$VERSION_CODENAME}) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and log in again, then check:

```bash
docker --version
docker compose version
```

## 4. Clone the GitHub Repository

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME.git
cd YOUR_REPOSITORY_NAME
```

If the repository is private, use a GitHub personal access token or SSH deploy key.

## 5. Create Production `.env`

```bash
cp .env.example .env
nano .env
```

For direct EC2 access without a domain, set:

```env
NEXT_PUBLIC_MEDIZINHUB_API_URL=http://YOUR_EC2_PUBLIC_IP:8080/api/v1
MEDIZINHUB_ENVIRONMENT=production
MEDIZINHUB_ENABLE_DOCS=false
MEDIZINHUB_DATABASE_URL=postgresql+psycopg://medizinhub:CHANGE_THIS_PASSWORD@postgres:5432/medizinhub_hms
MEDIZINHUB_REDIS_URL=redis://redis:6379/0
MEDIZINHUB_AUTO_CREATE_TABLES=false
MEDIZINHUB_CORS_ORIGINS=http://YOUR_EC2_PUBLIC_IP:3000
POSTGRES_DB=medizinhub_hms
POSTGRES_USER=medizinhub
POSTGRES_PASSWORD=CHANGE_THIS_PASSWORD
```

Also update SMTP values if report email is required:

```env
MEDIZINHUB_SMTP_HOST=smtp.gmail.com
MEDIZINHUB_SMTP_PORT=587
MEDIZINHUB_SMTP_USERNAME=your-mailbox@example.com
MEDIZINHUB_SMTP_PASSWORD=your-app-password
MEDIZINHUB_SMTP_FROM_EMAIL=your-mailbox@example.com
MEDIZINHUB_SMTP_FROM_NAME=MedizinHub HMS Reports
MEDIZINHUB_SMTP_USE_TLS=true
```

Never commit `.env` to GitHub.

## 6. Match PostgreSQL Password

The `POSTGRES_PASSWORD` value must match the password inside `MEDIZINHUB_DATABASE_URL`.

## 7. Build and Start

Because `NEXT_PUBLIC_MEDIZINHUB_API_URL` is baked into the Next.js build, rebuild after changing `.env`:

```bash
docker compose up -d --build
```

Check containers:

```bash
docker compose ps
```

Watch logs:

```bash
docker compose logs -f
```

Backend only:

```bash
docker compose logs -f backend
```

## 8. Test the App

Open:

```text
http://YOUR_EC2_PUBLIC_IP:3000
```

Check backend health:

```text
http://YOUR_EC2_PUBLIC_IP:8080/health
http://YOUR_EC2_PUBLIC_IP:8080/api/v1/health
```

If frontend loads but API calls fail, check:

- `NEXT_PUBLIC_MEDIZINHUB_API_URL`
- `MEDIZINHUB_CORS_ORIGINS`
- EC2 security group ports `3000` and `8080`
- `docker compose logs -f backend`

## 9. Update Deployment After GitHub Push

On EC2:

```bash
git pull
docker compose up -d --build
docker compose ps
```

If only backend Python code changed, a rebuild is still safest:

```bash
docker compose up -d --build backend report-worker
```

If frontend code or `NEXT_PUBLIC_MEDIZINHUB_API_URL` changed:

```bash
docker compose up -d --build frontend
```

## 10. Useful Operations

Stop containers but keep database and uploaded-file data:

```bash
docker compose down
```

Production uploads are stored in the `medizinhub_uploads_data` named volume
and staging uploads in `medizinhub_uploads_data_staging`. Container rebuilds
keep these files. Never use `docker compose down -v` in an environment whose
database or uploads must be retained, and include both named volumes in the
server backup plan.

Restart:

```bash
docker compose up -d
```

Run migrations manually:

```bash
docker compose exec backend alembic -c alembic/alembic.ini upgrade head
```

Open backend shell:

```bash
docker compose exec backend bash
```

Open PostgreSQL shell:

```bash
docker compose exec postgres psql -U medizinhub -d medizinhub_hms
```

## 11. Optional Domain and Nginx

For a real production URL, point a domain to the EC2 public IP and put Nginx or Caddy in front of the containers.

Recommended final URLs:

```env
NEXT_PUBLIC_MEDIZINHUB_API_URL=https://api.yourdomain.com/api/v1
MEDIZINHUB_CORS_ORIGINS=https://yourdomain.com
```

Then expose only ports `80` and `443` publicly. Keep `3000`, `8080`, PostgreSQL, and Redis private.

## 12. CI/CD Pipeline with GitHub Actions

This repository includes two workflows:

| File | Purpose |
| --- | --- |
| `.github/workflows/ci.yml` | Runs frontend tests/build, backend lint/tests, and Docker Compose config validation |
| `.github/workflows/deploy-ec2.yml` | Deploys the `main` branch to EC2 with SSH and Docker Compose |

See `docs/ci-cd-testing-strategy.md` for the full testing and release-gate approach.

### CI Flow

The CI workflow runs on:

- every pull request
- every push to `main` or `master`

It runs:

```bash
npm ci
npm test
npm run build
ruff check backend/app backend/tests
pytest backend/tests -q
docker compose config --quiet
```

### EC2 Deploy Flow

The deploy workflow runs on:

- after the `CI` workflow succeeds on `main`
- manual trigger from GitHub Actions using `workflow_dispatch`

Before enabling deployment, create the app folder on EC2 once:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME.git /home/ubuntu/medizinhub-hms
cd /home/ubuntu/medizinhub-hms
cp .env.example .env
nano .env
docker compose up -d --build
```

Then add these GitHub repository secrets:

| Secret | Example | Purpose |
| --- | --- | --- |
| `EC2_HOST` | `13.201.10.20` | EC2 public IP or domain |
| `EC2_USER` | `ubuntu` | SSH user, usually `ubuntu` for Ubuntu AMI |
| `EC2_SSH_KEY` | private key text | Private SSH key that can access EC2 |
| `EC2_SSH_PORT` | `22` | SSH port |
| `EC2_APP_DIR` | `/home/ubuntu/medizinhub-hms` | Project folder on EC2 |

Add secrets in GitHub:

```text
Repository -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Do not store `.env` content in GitHub unless you move to a more advanced deployment flow. For this simple EC2 deployment, `.env` stays only on the EC2 server.

### Deploy Commands Run by GitHub

The workflow SSHs into EC2 and runs:

```bash
cd "$EC2_APP_DIR"
git fetch origin
git checkout main
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:8080/health
curl -f http://127.0.0.1:8080/api/v1/health
```

### Recommended Branch Rules

In GitHub, protect the `main` branch:

- require pull request before merge
- require the `CI` workflow to pass
- restrict who can push directly to `main`

Then normal development flow is:

```bash
git checkout -b feature/your-change
git add .
git commit -m "Your change"
git push origin feature/your-change
```

Create a pull request to `main`. After merge, CI runs first. If CI passes, GitHub Actions deploys to EC2.
