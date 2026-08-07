#!/bin/bash
# AWS ECS Fargate deployment script
# Prerequisites: AWS CLI configured, ECR repos created, scanner-v3 on EFS

set -e

REGION="ap-south-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BACKEND="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/scanner-dashboard-backend"
ECR_FRONTEND="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/scanner-dashboard-frontend"

echo "=== 1. Authenticate ECR ==="
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

echo "=== 2. Build & push backend ==="
docker build -t scanner-dashboard-backend ./backend
docker tag scanner-dashboard-backend:latest ${ECR_BACKEND}:latest
docker push ${ECR_BACKEND}:latest

echo "=== 3. Build & push frontend ==="
docker build -t scanner-dashboard-frontend ./frontend
docker tag scanner-dashboard-frontend:latest ${ECR_FRONTEND}:latest
docker push ${ECR_FRONTEND}:latest

echo "=== 4. Register task definition ==="
aws ecs register-task-definition \
  --cli-input-json file://deploy/aws/ecs-task-definition.json \
  --region $REGION

echo "=== 5. Update service (if exists) ==="
aws ecs update-service \
  --cluster scanner-dashboard \
  --service scanner-dashboard-backend \
  --force-new-deployment \
  --region $REGION || echo "Service doesn't exist yet. Create it via AWS Console."

echo ""
echo "=== Deployment complete ==="
echo "Backend:  ${ECR_BACKEND}:latest"
echo "Frontend: ${ECR_FRONTEND}:latest"
echo ""
echo "Next steps:"
echo "  1. Create ECS cluster (Fargate)"
echo "  2. Create ALB (Application Load Balancer) for backend on port 8000"
echo "  3. Create ECS service for backend (2+ tasks)"
echo "  4. Deploy frontend to Vercel/Netlify/S3+CloudFront"
echo "  5. Point frontend NEXT_PUBLIC_API_URL to ALB domain"
