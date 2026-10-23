#!/usr/bin/env bash
# Removes clau-ai: sudo bash /opt/clau-ai/scripts/uninstall.sh
# Your websites, databases and the clau-ai folder are kept unless you confirm their removal.
# PURGE=1 removes the app folder and the clauai MySQL user without asking (databases are never touched).
set -Eeuo pipefail

CONFIG_FILE=/etc/clau-ai.conf
[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash $0" >&2; exit 1; }
[[ -r "$CONFIG_FILE" ]] || { echo "$CONFIG_FILE not found — nothing to uninstall" >&2; exit 1; }
# shellcheck disable=SC1090
. "$CONFIG_FILE"

confirm() {
  [[ "${PURGE:-0}" == 1 ]] && return 0
  local answer
  read -r -p "$1 [y/N]: " answer </dev/tty || true
  [[ "$answer" =~ ^[Yy] ]]
}

echo "==> Stopping the panel"
if [[ "$SERVICE_MODE" == systemd ]]; then
  systemctl disable --now clau-ai 2>/dev/null || true
  rm -f /etc/systemd/system/clau-ai.service
  systemctl daemon-reload
else
  runuser -u "$APP_USER" -- env HOME="$INSTALL_DIR" PM2_HOME="$INSTALL_DIR/.pm2" PATH="$PATH" pm2 kill >/dev/null 2>&1 || true
fi

echo "==> Removing the web server site"
removed_site=0
for f in /etc/nginx/sites-enabled/clau-ai /etc/nginx/sites-available/clau-ai /etc/nginx/conf.d/clau-ai.conf; do
  [[ -e "$f" || -L "$f" ]] && { rm -f "$f"; removed_site=1; }
done
if ((removed_site)) && command -v nginx >/dev/null && nginx -t >/dev/null 2>&1; then
  if [[ -d /run/systemd/system ]]; then systemctl reload nginx; else nginx -s reload 2>/dev/null || true; fi
fi

if command -v mysql >/dev/null && mysql -e "SELECT 1" >/dev/null 2>&1 &&
  [[ -n "$(mysql -N -e "SELECT 1 FROM mysql.user WHERE User='clauai' AND Host='localhost'")" ]] &&
  confirm "Remove the MySQL user clauai@localhost? (your databases are NOT deleted)"; then
  mysql -e "DROP USER 'clauai'@'localhost'"
  echo "    MySQL user removed"
fi

if confirm "Delete the app folder $INSTALL_DIR (includes .env and AI settings)?"; then
  rm -rf "$INSTALL_DIR"
  echo "    $INSTALL_DIR deleted"
fi

rm -f "$CONFIG_FILE"
echo "✔ clau-ai uninstalled"
