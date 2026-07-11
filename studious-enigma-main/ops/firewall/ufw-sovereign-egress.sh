#!/usr/bin/env bash
set -euo pipefail

# Optional host-level template: deny outbound traffic by default,
# while allowing localhost loopback and DNS/NTP for system stability.
# Review and adapt this script before running in production.

sudo ufw --force reset
sudo ufw default deny outgoing
sudo ufw default deny incoming

# Keep loopback communication available.
sudo ufw allow out on lo
sudo ufw allow in on lo

# Optional minimal essentials (adjust to your environment policy).
# DNS
sudo ufw allow out 53
# NTP
sudo ufw allow out 123

# Frontend/backend local development ports (host-local usage).
sudo ufw allow in 5173/tcp
sudo ufw allow in 5000/tcp

sudo ufw --force enable
sudo ufw status verbose
