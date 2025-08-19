#!/usr/bin/env bash
set -euo pipefail

# Rebuild Next.js app
npm run build

# Restart systemd services
sudo systemctl restart trivio
sudo systemctl restart trivio-socket

echo "Restart completed."
