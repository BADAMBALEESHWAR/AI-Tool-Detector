# Docker & AWS Deployment

Three images are built from this repo and run together with Postgres behind a
Caddy reverse proxy that handles HTTPS:

| Image | Source | Serves |
|---|---|---|
| `ai-monitor-backend` | `backend/Dockerfile` | Express API + Socket.IO on :3001; runs `prisma migrate deploy` on start |
| `ai-monitor-student` | `student-dashboard/Dockerfile` | Student portal (nginx) |
| `ai-monitor-admin` | `admin-dashboard/Dockerfile` | Admin console (nginx) |

```
GitHub push to main
   └─ .github/workflows/deploy.yml
        ├─ build 3 images ─► Amazon ECR
        └─ SSH to EC2 ─► docker compose -f docker-compose.prod.yml pull && up -d

EC2 instance
   Caddy :80/:443 ─┬─ STUDENT_URL ─► student
                   ├─ ADMIN_URL   ─► admin
                   └─ API_URL     ─► backend ─► Postgres (volume)
```

`.github/workflows/ci.yml` builds every app and Dockerfile on each pull request and push.

---

## Run locally with Docker

```bash
cd Aitooldetector
cp .env.example .env        # set POSTGRES_PASSWORD and the three JWT secrets
                            # (openssl rand -hex 32), RUN_SEED=true for the first start
docker compose up --build
```

- Student portal: http://localhost:5173
- Admin console: http://localhost:5174
- API: http://localhost:3001/health

After the first successful start, set `RUN_SEED=false`. The seed resets admin
settings every time it runs.

Installers served by `/downloads` are not in git. Put the `.exe` and `.zip`
files in `backend/downloads/`, which is mounted read-only.

---

## Deploy to AWS (one-time setup)

### 1. ECR repositories

Create three private repositories in your region:

```bash
for r in ai-monitor-backend ai-monitor-admin ai-monitor-student; do
  aws ecr create-repository --repository-name $r --region ap-south-1
done
```

### 2. EC2 instance

- Ubuntu 22.04/24.04. A `t3.small` or larger is recommended, since Postgres runs on the same box.
- **IAM role (instance profile)** with `AmazonEC2ContainerRegistryReadOnly`, so the
  server can pull images without stored keys.
- **Security group:** inbound 22 (your IP only), 80 and 443 (anywhere).
- Allocate an **Elastic IP** so the address survives restarts.
- Run the bootstrap script:

```bash
scp deploy/ec2-setup.sh ubuntu@<elastic-ip>:~
ssh ubuntu@<elastic-ip> 'sh ec2-setup.sh'
```

### 3. DNS

Point three hostnames at the Elastic IP, for example `portal.`, `admin.` and
`api.` under your domain. Caddy gets the HTTPS certificates automatically
once DNS resolves.

No domain yet? `sslip.io` hostnames work with Let's Encrypt. For an Elastic IP
of 13.233.10.20, use `https://portal.13-233-10-20.sslip.io` (and likewise for
`admin.` and `api.`).

### 4. Server `.env`

Create `/opt/ai-monitor/.env` from `.env.example`:

```ini
POSTGRES_PASSWORD=<strong password>
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
ADMIN_JWT_SECRET=<openssl rand -hex 32>
STUDENT_URL=https://portal.example.edu
ADMIN_URL=https://admin.example.edu
API_URL=https://api.example.edu
ECR_REGISTRY=<account-id>.dkr.ecr.<region>.amazonaws.com
RUN_SEED=true      # first deploy only, then set to false
```

To use **Amazon RDS** instead of the bundled Postgres, also set `DATABASE_URL`
to the RDS connection string. The `db` container will still start but stay unused.

### 5. GitHub → AWS credentials

Recommended: **OIDC** (no long-lived keys).

1. IAM → Identity providers → add `token.actions.githubusercontent.com`
   (audience `sts.amazonaws.com`).
2. Create a role trusted by that provider and limited to this repo
   (`repo:<owner>/<repo>:*`), with ECR push permissions
   (`AmazonEC2ContainerRegistryPowerUser` is enough).
3. Save the role ARN as the `AWS_ROLE_ARN` secret.

Alternative: create an IAM user with the same policy and store
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as secrets instead.

### 6. GitHub repository settings

**Settings → Secrets and variables → Actions**

| Kind | Name | Value |
|---|---|---|
| Variable | `AWS_REGION` | e.g. `ap-south-1` |
| Variable | `API_URL` | Same as the server's `API_URL`, e.g. `https://api.example.edu` |
| Variable | `DEPLOY_PATH` | Optional, default `/opt/ai-monitor` |
| Secret | `AWS_ROLE_ARN` | From step 5 (or the two access-key secrets) |
| Secret | `EC2_HOST` | Elastic IP or hostname |
| Secret | `EC2_USER` | `ubuntu` |
| Secret | `EC2_SSH_KEY` | Private key (`.pem` contents) for that user |

The deploy workflow is skipped until `AWS_REGION` is set, so pushes don't
fail before setup is finished.

### 7. Deploy

Push to `main`, or run **Actions → Deploy to AWS → Run workflow**. Each run
tags images with the commit SHA, so you can roll back by re-running an older
workflow run.

After the first deploy:

1. Set `RUN_SEED=false` in the server `.env`.
2. Sign in to the admin console and **change the default admin password**
   (`admin@institution.edu` / `Admin@123`).

### Administrator accounts

Public admin sign-up is closed. The admin login page offers **Create the first
account** only while no administrator exists, and that account becomes
`superadmin`. If you skip the seed, use this to create your own first admin
instead of the default one. After that, superadmins add staff from
**Settings → Administrators**.

---

## Operations

```bash
cd /opt/ai-monitor
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml exec db pg_dump -U postgres ai_monitor > backup.sql
```

Postgres data, uploads, logs and certificates live in named Docker volumes and
survive redeploys. Back up the `pgdata` volume, or use RDS with automated backups.
