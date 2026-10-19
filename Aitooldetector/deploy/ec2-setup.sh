#!/bin/sh
# One-time setup of the Ubuntu EC2 host that runs the backend container.
# Run as root (e.g. through Systems Manager → Run Command, or `sudo sh ec2-setup.sh`).
# Assumes nginx already proxies api.tooldetect.in → 127.0.0.1:3001 and the
# instance role has AmazonSSMManagedInstanceCore + AmazonEC2ContainerRegistryReadOnly.
set -e

REGISTRY=408945531212.dkr.ecr.ap-south-1.amazonaws.com
DEPLOY_PATH=/opt/ai-monitor

# 1 GB swap: the t3.micro has under 1 GB of RAM.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf && sysctl -p /etc/sysctl.d/99-swappiness.conf
fi

# Docker + compose from the Ubuntu archive, and the ECR credential helper so
# `docker pull` authenticates with the instance role (no stored passwords).
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 amazon-ecr-credential-helper
systemctl enable --now docker
mkdir -p /root/.docker
echo "{\"credHelpers\":{\"$REGISTRY\":\"ecr-login\"}}" > /root/.docker/config.json

# Deploy directory. Put the backend .env here (see DEPLOYMENT.md) plus
# ECR_REGISTRY=$REGISTRY, and the installers in downloads/.
mkdir -p "$DEPLOY_PATH/uploads" "$DEPLOY_PATH/logs" "$DEPLOY_PATH/downloads"
chown -R 1000:1000 "$DEPLOY_PATH/uploads" "$DEPLOY_PATH/logs"

docker --version
docker compose version
echo "Done. Create $DEPLOY_PATH/.env, then run the 'Deploy to AWS' workflow."
