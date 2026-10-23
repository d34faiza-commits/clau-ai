#!/usr/bin/env bash
# Updates an installed clau-ai to the latest code: sudo bash /opt/clau-ai/scripts/update.sh
# If the new version fails to build, the previous build is restored automatically.
set -Eeuo pipefail

CONFIG_FILE=/etc/clau-ai.conf
[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash $0" >&2; exit 1; }
[[ -r "$CONFIG_FILE" ]] || { echo "$CONFIG_FILE not found — install first with scripts/install.sh" >&2; exit 1; }
# shellcheck disable=SC1090
. "$CONFIG_FILE"
: "${INSTALL_DIR:?}" "${APP_USER:?}" "${PORT:?}" "${SERVICE_MODE:?}"

as_app() {
  runuser -u "$APP_USER" -- env HOME="$INSTALL_DIR" npm_config_cache="$INSTALL_DIR/.npm" npm_config_update_notifier=false \
    PM2_HOME="$INSTALL_DIR/.pm2" NEXT_TELEMETRY_DISABLED=1 PATH="$PATH" "$@"
}

# PM2 fallback (no systemd): start next directly so the port is always the configured one.
pm2_start() {
  as_app pm2 delete clau-ai >/dev/null 2>&1 || true
  as_app env NODE_ENV=production pm2 start "$INSTALL_DIR/node_modules/next/dist/bin/next" --name clau-ai \
    --cwd "$INSTALL_DIR" --max-memory-restart 512M -- start -H 127.0.0.1 -p "$PORT" >/dev/null
  as_app pm2 save >/dev/null
}

restart() {
  if [[ "$SERVICE_MODE" == systemd ]]; then
    systemctl restart clau-ai
  else
    pm2_start
  fi
}

healthy() {
  for _ in $(seq 1 40); do
    curl -fs -o /dev/null "http://127.0.0.1:$PORT/login" && return 0
    sleep 1
  done
  return 1
}

cd "$INSTALL_DIR"
before=$(as_app git rev-parse --short HEAD)
echo "==> Fetching updates (current: $before)"
as_app git pull --ff-only
after=$(as_app git rev-parse --short HEAD)
if [[ "$before" == "$after" && "${FORCE:-0}" != 1 ]]; then
  echo "    Already up to date. (FORCE=1 to rebuild anyway)"
  exit 0
fi

echo "==> Building $after"
rm -rf .next.previous
[[ -d .next ]] && cp -a .next .next.previous
if as_app npm ci --no-audit --no-fund --loglevel=error && as_app npm run build --silent >/tmp/clau-ai-build.log 2>&1; then
  restart
  if healthy; then
    rm -rf .next.previous
    echo "✔ Updated $before → $after"
    exit 0
  fi
  echo "✗ New version did not start — rolling back" >&2
else
  tail -n 30 /tmp/clau-ai-build.log >&2 || true
  echo "✗ Build failed — rolling back (log: /tmp/clau-ai-build.log)" >&2
fi

as_app git reset -q --hard "$before"
as_app npm ci --no-audit --no-fund --loglevel=error
rm -rf .next && [[ -d .next.previous ]] && mv .next.previous .next
restart
healthy && echo "    Rolled back to $before and running." >&2
exit 1
