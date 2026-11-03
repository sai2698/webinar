#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Interactive VPS Disk & Swap Cleanup Script
# Reclaims disk space immediately by:
#  1. Turning off and deleting large/secondary swap files (/swapfile2, etc.)
#  2. Resizing /swapfile to strictly 512 MB
#  3. Cleaning APT package caches, old journald logs, and npm cache
# ─────────────────────────────────────────────────────────────
set -Eeuo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root (or with sudo)."
  echo "Run: sudo bash clean-disk-swap.sh"
  exit 1
fi

B=$'\033[1m'; DIM=$'\033[2m'; R=$'\033[0m'
GRN=$'\033[32m'; YEL=$'\033[33m'; CYN=$'\033[36m'; RED=$'\033[31m'

echo "${DIM}────────────────────────────────────────────────────────────${R}"
echo "${B}VPS DISK & SWAP RECOVERY UTILITY${R}"
echo "${DIM}────────────────────────────────────────────────────────────${R}"
echo ""
echo "${CYN}▸ Current Disk Usage:${R}"
df -h /
echo ""
echo "${CYN}▸ Current Active Swap:${R}"
swapon --show || cat /proc/swaps || echo "No active swap"
echo ""

echo "${YEL}This script will:${R}"
echo "  1. Deactivate active swap files"
echo "  2. Delete secondary swapfiles (e.g. /swapfile2)"
echo "  3. Recreate /swapfile strictly sized at 512 MB"
echo "  4. Vacuum systemd journal logs (>50M)"
echo "  5. Clear apt cache, npm cache, and /tmp"
echo ""

read -rp "Do you want to proceed with cleanup? [Y/n]: " CONFIRM
CONFIRM="${CONFIRM:-Y}"
if [[ "$CONFIRM" =~ ^[Nn] ]]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "${CYN}▸ Deactivating swap...${R}"
swapoff -a 2>/dev/null || true

# 1. Remove secondary swapfiles
for f in /swapfile2 /swapfile_extra /swapfile.bak /swapfile.old; do
  if [ -e "$f" ]; then
    echo "${CYN}▸ Removing $f...${R}"
    rm -f "$f"
    sed -i "\|^$f[[:space:]]|d" /etc/fstab 2>/dev/null || true
  fi
done

# 2. Reset /swapfile to 512 MB
echo "${CYN}▸ Creating lightweight 512 MB swapfile (/swapfile)...${R}"
rm -f /swapfile
if ! fallocate -l 512M /swapfile 2>/dev/null; then
  dd if=/dev/zero of=/swapfile bs=1M count=512 status=none
fi
chmod 600 /swapfile
mkswap /swapfile >/dev/null
swapon /swapfile

# Ensure /swapfile is in /etc/fstab
if ! grep -qE '^/swapfile[[:space:]]' /etc/fstab 2>/dev/null; then
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Set swappiness
sysctl -qw vm.swappiness=10 2>/dev/null || true

# 3. Clean system caches to maximize free disk
echo "${CYN}▸ Cleaning package manager and system logs...${R}"
if command -v apt-get >/dev/null 2>&1; then
  apt-get clean >/dev/null 2>&1 || true
  apt-get autoremove -y -qq >/dev/null 2>&1 || true
fi

if command -v journalctl >/dev/null 2>&1; then
  journalctl --vacuum-size=50M >/dev/null 2>&1 || true
fi

if command -v npm >/dev/null 2>&1; then
  npm cache clean --force >/dev/null 2>&1 || true
fi

rm -rf /tmp/* /var/tmp/* 2>/dev/null || true

echo ""
echo "${GRN}✔ Disk and swap cleanup complete!${R}"
echo ""
echo "${DIM}────────────────────────────────────────────────────────────${R}"
echo "${B}NEW DISK USAGE & SWAP STATUS${R}"
echo "${DIM}────────────────────────────────────────────────────────────${R}"
echo ""
df -h /
echo ""
swapon --show || cat /proc/swaps
echo ""
echo "${GRN}You can now re-run: ./deploy-native.sh up (or ./deploy-native.sh restart)${R}"

