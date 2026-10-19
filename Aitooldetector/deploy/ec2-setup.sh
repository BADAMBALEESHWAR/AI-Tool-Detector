#!/bin/sh
# One-time setup for a fresh Ubuntu 22.04 / 24.04 EC2 instance.
# Installs Docker + the compose plugin and the AWS CLI, and creates the deploy
# directory used by .github/workflows/deploy.yml.
#   scp deploy/ec2-setup.sh ubuntu@<ec2-host>:~ && ssh ubuntu@<ec2-host> 'sh ec2-setup.sh'
set -e

DEPLOY_PATH=${DEPLOY_PATH:-/opt/ai-monitor}

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"

if ! command -v aws >/dev/null 2>&1; then
  sudo snap install aws-cli --classic
fi

sudo mkdir -p "$DEPLOY_PATH/deploy" "$DEPLOY_PATH/downloads"
sudo chown -R "$USER":"$USER" "$DEPLOY_PATH"

echo
echo "Done. Next:"
echo "  1. Log out and back in so the docker group applies."
echo "  2. Create $DEPLOY_PATH/.env from Aitooldetector/.env.example."
echo "  3. Copy the desktop installers / extension zip into $DEPLOY_PATH/downloads."
echo "  4. Push to main (or run the 'Deploy to AWS' workflow) to start the stack."
