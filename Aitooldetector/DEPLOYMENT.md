# Docker & AWS Deployment

## Production architecture (AWS ap-south-1, account 408945531212)

```
student-dashboard.tooldetect.in ─► CloudFront EMHQSVFRFZK74 ─► S3 student-dashboard.tooldetect.in
admin-dashboard.tooldetect.in   ─► CloudFront E2XT4ZSEEXHZVE ─► S3 admin-dashboard.tooldetect.in
api.tooldetect.in               ─► CloudFront E1UF59RBUR718Y ─► EC2 i-0570f5a38a841fbec
                                      nginx :80 ─► 127.0.0.1:3001  backend container (Docker)
                                                                       └─► RDS ai-tool-detector-db (Postgres)
```

- **Dashboards** are static Vite builds served from S3 through CloudFront.
- **Backend** runs as the `ai-monitor-backend` image from Amazon ECR, started
  with `docker-compose.prod.yml` in `/opt/ai-monitor` on the EC2 host. The
  host's nginx stays in front of it unchanged.
- **Database** is Amazon RDS. The container runs `prisma migrate deploy` on
  start, which applies only migrations that haven't run yet.
- DNS is managed at GoDaddy. All three hostnames share one ACM certificate in us-east-1.

## How deploys happen

Every push to `main` runs **`.github/workflows/deploy.yml`**:

1. **Backend:** builds the image and pushes it to ECR, tagged with the commit SHA and `latest`.
   It then tells the EC2 host, through Systems Manager (no SSH), to pull that
   tag and restart the container, and checks `https://api.tooldetect.in/health`.
2. **Dashboards** (only if the backend succeeded): `npm run build` with
   `VITE_API_URL=https://api.tooldetect.in/api`, then `aws s3 sync` to each bucket
   and a CloudFront invalidation.

GitHub authenticates with **OIDC**. It assumes the IAM role
`ai-tool-detector-github-deploy`, which only runs from `main` of this repo
and can only touch the resources above. No AWS keys are stored in GitHub.

`.github/workflows/ci.yml` builds every app and Dockerfile on each push and pull request.

### Roll back

Re-run an older successful **Deploy to AWS** run (Actions → the run → *Re-run all jobs*).
Each run deploys its own commit's image tag.

## Run locally with Docker

```bash
cd Aitooldetector
cp .env.example .env        # set POSTGRES_PASSWORD and the three JWT secrets
                            # (openssl rand -hex 32); RUN_SEED=true for the first start
docker compose up --build
```

- Student portal: http://localhost:5173
- Admin console: http://localhost:5174
- API: http://localhost:3001/health

Set `RUN_SEED=false` after the first start, because the seed resets settings
every time it runs. Installers served by `/downloads` go in `backend/downloads/`.

## Server details

| Item | Value |
|---|---|
| Deploy directory | `/opt/ai-monitor`: `docker-compose.prod.yml`, `.env`, `uploads/`, `logs/`, `downloads/` |
| `.env` | `DATABASE_URL` (RDS), the three JWT secrets, `FRONTEND_URL` / `ADMIN_URL` / `STUDENT_URL` (CORS origins), `ECR_REGISTRY` |
| Installers | `/opt/ai-monitor/downloads/` (mounted read-only) |
| Image pulls | ECR credential helper using the instance role (`AmazonEC2ContainerRegistryReadOnly`) |
| Memory | t3.micro + 1 GB swap file |

Useful commands, run through Session Manager (EC2 → instance → Connect → Session Manager):

```bash
cd /opt/ai-monitor
sudo docker compose -f docker-compose.prod.yml ps
sudo docker compose -f docker-compose.prod.yml logs -f --tail 100 backend
sudo docker compose -f docker-compose.prod.yml restart backend
```

## Administrator accounts

Public admin sign-up is closed. The admin login page offers **Create the first
account** only while no administrator exists, and that account becomes
`superadmin`. After that, superadmins add staff from **Settings → Administrators**.

## Rebuilding from scratch

1. **IAM role for GitHub** (once per account):

   ```bash
   cd Aitooldetector/deploy/aws
   aws iam create-role --role-name ai-tool-detector-github-deploy \
     --assume-role-policy-document file://github-deploy-trust.json
   aws iam put-role-policy --role-name ai-tool-detector-github-deploy \
     --policy-name deploy --policy-document file://github-deploy-policy.json
   ```

   This needs the GitHub OIDC provider `token.actions.githubusercontent.com`
   to already exist in IAM (it does in this account).
2. **ECR repository:** `aws ecr create-repository --repository-name ai-monitor-backend`.
3. **EC2 host:** attach `AmazonEC2ContainerRegistryReadOnly` to the instance
   role, run `deploy/ec2-setup.sh` as root, and create `/opt/ai-monitor/.env`.
4. Run **Actions → Deploy to AWS → Run workflow**.
