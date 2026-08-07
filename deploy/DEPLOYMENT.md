# Deployment Guide — Scanner Dashboard

This guide covers deploying to **AWS (ECS Fargate)** and **Supabase + Vercel**.

---

## Architecture for Production

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│  PostgreSQL  │
│  (Vercel)    │ API │  (FastAPI)   │     │ (Supabase/   │
│  Next.js     │     │  ECS/EC2     │     │  RDS)        │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────▼───────┐     ┌──────────────┐
                     │   Worker     │────▶│    Redis     │
                     │   (arq)      │     │ (Upstash/    │
                     │   ECS/EC2    │     │  ElastiCache)│
                     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────▼───────┐
                     │  scanner-v3  │
                     │  (EFS/EC2)   │
                     └──────────────┘
```

---

## Option A: Supabase + Vercel + Upstash (Recommended — simplest)

### Cost: ~$0/month (free tiers)

### 1. Set up Supabase (Postgres)

1. Go to https://supabase.com → create a free project
2. Wait for provisioning (~2 min)
3. Go to **Project Settings → Database**
4. Copy the **Connection string** (URI format)
5. Go to **SQL Editor** → paste `deploy/supabase/schema.sql` → Run
6. This creates all tables with RLS policies

### 2. Set up Upstash (Redis)

1. Go to https://upstash.com → create a free Redis database
2. Copy the **Redis URL** (`redis://default:...`)
3. Free tier: 10,000 commands/day (enough for scans)

### 3. Deploy Backend (Railway / Render / EC2)

**Railway (easiest — $5/mo free credit):**
1. Go to https://railway.app → New Project → Deploy from GitHub
2. Connect your repo, select `backend/` as root
3. Add environment variables (from `deploy/supabase/.env.supabase.example`)
4. Railway auto-detects Dockerfile → builds → deploys
5. You get a URL like `https://scanner-api.up.railway.app`

**Render (free tier):**
1. Go to https://render.com → New → Web Service
2. Connect repo, root = `backend/`
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables
6. Create a **Background Worker** for the arq worker:
   - Build: same
   - Start: `arq app.services.worker.WorkerSettings`

**Important:** scanner-v3 must be available on the server. Options:
- Clone scanner-v3 into the Docker image (add to Dockerfile)
- Mount from a git submodule
- Use Railway's volume mount

### 4. Deploy Worker (same platform as backend)

The worker runs `arq app.services.worker.WorkerSettings`. Deploy it as a separate service/worker process.

### 5. Deploy Frontend (Vercel — free)

1. Go to https://vercel.com → New Project → Import from GitHub
2. Select `frontend/` as root directory
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-backend-url`
4. Deploy → get URL like `https://scanner-dashboard.vercel.app`

### 6. Update CORS

In backend `.env`, set:
```
CORS_ORIGINS=https://scanner-dashboard.vercel.app
```

---

## Option B: AWS ECS Fargate (Production scale)

### Cost: ~$30-50/month (t3.small + Fargate)

### 1. Create AWS resources

```bash
# Using AWS CLI (or Console)
aws configure  # set your access key + secret

# Create VPC, subnets, security groups (or use default VPC)
# Create RDS Postgres instance
aws rds create-db-instance \
  --db-instance-identifier scanner-dashboard \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username scanner \
  --master-user-password YOUR_PASSWORD \
  --allocated-storage 20 \
  --region ap-south-1

# Create ElastiCache Redis
aws elasticache create-cache-cluster \
  --cache-cluster-id scanner-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1 \
  --region ap-south-1

# Create ECR repos
aws ecr create-repository --repository-name scanner-dashboard-backend --region ap-south-1
aws ecr create-repository --repository-name scanner-dashboard-frontend --region ap-south-1

# Create EFS (for scanner-v3 + results)
aws efs create-file-system --name scanner-v3 --region ap-south-1
```

### 2. Build & push Docker images

```bash
# From scanner-dashboard/ root
chmod +x deploy/aws/deploy.sh
./deploy/aws/deploy.sh
```

### 3. Create ECS cluster + services

```bash
# Create cluster
aws ecs create-cluster --cluster-name scanner-dashboard --region ap-south-1

# Register task definition
aws ecs register-task-definition \
  --cli-input-json file://deploy/aws/ecs-task-definition.json \
  --region ap-south-1

# Create ALB (Application Load Balancer)
aws elbv2 create-load-balancer \
  --name scanner-dashboard-alb \
  --subnets subnet-xxx subnet-yyy \
  --region ap-south-1

# Create ECS service (backend)
aws ecs create-service \
  --cluster scanner-dashboard \
  --service-name scanner-backend \
  --task-definition scanner-dashboard \
  --desired-count 2 \
  --launch-type FARGATE \
  --load-balancers targetGroupArn=arn:... --containerName=backend --containerPort=8000 \
  --region ap-south-1
```

### 4. Deploy frontend

**Vercel (recommended):**
- Import repo, root = `frontend/`
- Set `NEXT_PUBLIC_API_URL` to ALB URL
- Deploy

**OR S3 + CloudFront:**
```bash
cd frontend
npm run build
aws s3 sync .next/static s3://scanner-dashboard-bucket/_next/static
# Configure CloudFront to serve from S3
```

### 5. Point your domain

- Frontend: `scanner.yourdomain.com` → Vercel/CloudFront
- API: `api.scanner.yourdomain.com` → ALB
- Update `CORS_ORIGINS` in backend env

---

## Option C: Single EC2 (simplest — all on one box)

### Cost: ~$10-15/month (t3.small)

```bash
# SSH into EC2
ssh ubuntu@your-ec2-ip

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Clone repos
git clone https://github.com/yourusername/scanner-v3.git
git clone https://github.com/yourusername/scanner-dashboard.git

# Create .env
cd scanner-dashboard
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, JWT_SECRET, SCANNER_V3_PATH=../scanner-v3

# Fix docker-compose for single-host (remove external port conflicts)
# Start everything
docker-compose up -d --build

# Set up nginx reverse proxy
sudo apt install nginx
# Configure: /etc/nginx/sites-available/scanner
#   server {
#     server_name scanner.yourdomain.com;
#     location / { proxy_pass http://localhost:3000; }
#     location /api { proxy_pass http://localhost:8000; }
#   }
sudo ln -s /etc/nginx/sites-available/scanner /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d scanner.yourdomain.com
```

---

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql+psycopg2://user:pass@host:5432/db` |
| `REDIS_URL` | Yes | Redis connection string | `redis://host:6379/0` |
| `JWT_SECRET` | Yes | Random 64-char string for JWT signing | `a1b2c3...` |
| `SCANNER_V3_PATH` | Yes | Path to scanner-v3 directory | `/opt/scanner-v3` |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins | `https://app.com` |
| `TELEGRAM_BOT_TOKEN` | No | For Telegram alerts | `123456:ABC-DEF` |
| `TELEGRAM_CHAT_ID` | No | Telegram chat ID | `-1001234567890` |
| `NEXT_PUBLIC_API_URL` | Frontend only | Backend API URL | `https://api.app.com` |

---

## Post-Deployment Checklist

- [ ] Backend health check: `GET /api/health` → `{"status": "ok"}`
- [ ] Register a user → login → get token
- [ ] Trigger a test scan → worker processes it → picks appear
- [ ] Market data endpoints return sector + regime data
- [ ] Frontend loads → login → dashboard shows data
- [ ] CORS configured (no console errors)
- [ ] HTTPS enabled (Let's Encrypt / Vercel SSL)
- [ ] Database backups configured (Supabase: automatic; RDS: enable snapshots)
- [ ] Log monitoring set up (CloudWatch / Railway logs)
- [ ] Scanner-v3 data directory persists (EFS / volume mount)
