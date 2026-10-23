#!/usr/bin/env bash
# clau-ai installer — sets up the panel on a fresh Ubuntu/Debian or AlmaLinux/Rocky VPS.
#
#   git clone https://github.com/d34faiza-commits/clau-ai.git && cd clau-ai
#   sudo bash scripts/install.sh
#
# Every question can be answered up front with an environment variable, e.g.:
#   sudo DOMAIN=panel.example.com EMAIL=me@example.com ASSUME_YES=1 bash scripts/install.sh
#
# Variables (all optional):
#   DOMAIN        domain for the panel (enables HTTPS via Let's Encrypt). Empty = http://SERVER_IP:PANEL_PORT
#   EMAIL         email for Let's Encrypt
#   WEB_ROOT      folder the File Manager / scanners may access (default /var/www)
#   APP_USER      Linux user the panel runs as (default: owner of WEB_ROOT, or a new "clauai" user)
#   ADMIN_USER    panel login name (default admin)
#   ADMIN_PASS    panel password (default: generated and printed at the end)
#   INSTALL_DIR   where the app lives (default /opt/clau-ai)
#   PORT          internal Node.js port (default 3000)
#   PANEL_PORT    public port when there is no DOMAIN (default 8090)
#   SETUP_NGINX   auto|yes|no   (default auto: skipped when LiteSpeed/Apache already serve port 80)
#   SETUP_DB      auto|yes|no   (default auto: create a MySQL/MariaDB user if a server is running)
#   RESET_ADMIN   1 = replace the existing admin login on a re-run
#   ASSUME_YES    1 = never ask, use defaults
#   REPO_URL / BRANCH   source when the script is not run from a checkout

set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/d34faiza-commits/clau-ai.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/clau-ai}"
PORT="${PORT:-3000}"
PANEL_PORT="${PANEL_PORT:-8090}"
NODE_MAJOR="${NODE_MAJOR:-22}"
SETUP_NGINX="${SETUP_NGINX:-auto}"
SETUP_DB="${SETUP_DB:-auto}"
ASSUME_YES="${ASSUME_YES:-0}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
WEB_ROOT="${WEB_ROOT:-}"
APP_USER="${APP_USER:-}"
ADMIN_USER="${ADMIN_USER:-}"
ADMIN_PASS="${ADMIN_PASS:-}"
CONFIG_FILE=/etc/clau-ai.conf

# ---------------------------------------------------------------- helpers ---

if [[ -t 1 ]]; then
  C_RESET=$'\e[0m' C_BOLD=$'\e[1m' C_GREEN=$'\e[32m' C_YELLOW=$'\e[33m' C_RED=$'\e[31m' C_CYAN=$'\e[36m'
else
  C_RESET="" C_BOLD="" C_GREEN="" C_YELLOW="" C_RED="" C_CYAN=""
fi

step() { printf '\n%s==>%s %s%s%s\n' "$C_GREEN" "$C_RESET" "$C_BOLD" "$*" "$C_RESET"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '%s  ! %s%s\n' "$C_YELLOW" "$*" "$C_RESET"; }
die() {
  printf '%s  ✗ %s%s\n' "$C_RED" "$*" "$C_RESET" >&2
  exit 1
}
trap 'die "Installation failed at line $LINENO (command: $BASH_COMMAND). Fix the issue and run the installer again — it is safe to re-run."' ERR

# Questions are read from the terminal, so `curl ... | sudo bash` also works.
can_ask() { [[ "$ASSUME_YES" != 1 ]] && { : </dev/tty; } 2>/dev/null; }

ask() { # ask VAR "Question" "default"
  local var=$1 question=$2 default=${3:-} answer
  if [[ -n "${!var:-}" ]]; then return; fi
  if can_ask; then
    read -r -p "    $question${default:+ [$default]}: " answer </dev/tty || true
    printf -v "$var" '%s' "${answer:-$default}"
  else
    printf -v "$var" '%s' "$default"
  fi
}

confirm() { # confirm "Question" default(y|n)
  local question=$1 default=${2:-y} answer
  if ! can_ask; then [[ "$default" == y ]]; return; fi
  read -r -p "    $question [$([[ $default == y ]] && echo Y/n || echo y/N)]: " answer </dev/tty || true
  answer=${answer:-$default}
  [[ "$answer" =~ ^[Yy] ]]
}

ask_password() {
  if [[ -n "$ADMIN_PASS" ]] || ! can_ask; then return; fi
  local p1 p2
  while true; do
    read -r -s -p "    Admin password (min 10 chars, empty = generate one): " p1 </dev/tty || true
    echo
    [[ -z "$p1" ]] && return
    if ((${#p1} < 10)); then warn "Too short."; continue; fi
    read -r -s -p "    Repeat password: " p2 </dev/tty || true
    echo
    [[ "$p1" == "$p2" ]] && { ADMIN_PASS=$p1; return; }
    warn "Passwords do not match."
  done
}

random_string() { # alphanumeric only, safe in .env and SQL
  local len=${1:-24} out=""
  while ((${#out} < len)); do out+=$(head -c 64 /dev/urandom | tr -dc 'A-Za-z0-9'); done
  printf '%s' "${out:0:len}"
}

has_systemd() { [[ -d /run/systemd/system ]] && command -v systemctl >/dev/null; }

version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }

# Runs a command as the panel user with npm's cache inside the install dir.
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

# set_env KEY VALUE — replace or append a line in .env without sed escaping issues.
set_env() {
  local key=$1 value=$2 file="$INSTALL_DIR/.env"
  touch "$file"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    $0 ~ "^" k "=" { if (!done) { print k "=" v; done = 1 }; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" >"$file.tmp" && cat "$file.tmp" >"$file" && rm -f "$file.tmp"
}

get_env() { # get_env KEY — value from .env, empty if unset
  [[ -f "$INSTALL_DIR/.env" ]] || return 0
  awk -F= -v k="$1" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' "$INSTALL_DIR/.env"
}

PKG=""
APT_UPDATED=0
pkg_install() {
  case "$PKG" in
    apt)
      if ((APT_UPDATED == 0)); then
        apt-get update -qq
        APT_UPDATED=1
      fi
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null
      ;;
    dnf) dnf install -y -q "$@" >/dev/null ;;
  esac
}

svc_start() { # svc_start NAME — enable + (re)start, systemd or plain
  local name=$1
  if has_systemd; then
    systemctl enable --now "$name" >/dev/null 2>&1 || true
    systemctl reload-or-restart "$name"
  elif [[ "$name" == nginx ]]; then
    if pgrep -x nginx >/dev/null; then nginx -s reload; else nginx; fi
  fi
}

# ------------------------------------------------------------- preflight ---

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash scripts/install.sh"

printf '%s\n' "${C_CYAN}${C_BOLD}"
cat <<'BANNER'
     _                          _
 ___| | __ _ _   _        __ _ (_)
/ __| |/ _` | | | |_____ / _` || |
| (__| | (_| | |_| |_____| (_| || |
\___|_|\__,_|\__,_|      \__,_||_|   installer
BANNER
printf '%s\n' "$C_RESET"

step "Checking the system"
[[ -r /etc/os-release ]] || die "Cannot detect the OS (/etc/os-release missing)"
# shellcheck disable=SC1091
. /etc/os-release
case " ${ID:-} ${ID_LIKE:-} " in
  *" debian "* | *" ubuntu "*) PKG=apt ;;
  *" rhel "* | *" fedora "* | *" centos "*) PKG=dnf ;;
  *) die "Unsupported OS: ${PRETTY_NAME:-unknown}. Supported: Ubuntu, Debian, AlmaLinux, Rocky, RHEL." ;;
esac
info "OS: ${PRETTY_NAME:-$ID} ($PKG)"
info "Init: $(has_systemd && echo systemd || echo 'no systemd (will use PM2)')"

MEM_MB=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
SWAP_MB=$(awk '/SwapTotal/ { print int($2 / 1024) }' /proc/meminfo)
info "RAM: ${MEM_MB} MB, swap: ${SWAP_MB} MB"

# Where are we installing from?
SRC_DIR=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  candidate=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
  if [[ -f "$candidate/package.json" ]] && grep -q '"name": "clau-ai"' "$candidate/package.json"; then
    SRC_DIR=$candidate
  fi
fi

# ------------------------------------------------------------- questions ---

step "Configuration"
DETECTED_LSWS=0
DETECTED_APACHE=0
if [[ -x /usr/local/lsws/bin/lswsctrl ]] || pgrep -f '(lshttpd|litespeed)' >/dev/null 2>&1; then DETECTED_LSWS=1; fi
if pgrep -x apache2 >/dev/null 2>&1 || pgrep -x httpd >/dev/null 2>&1; then DETECTED_APACHE=1; fi

ask DOMAIN "Domain for the panel, e.g. panel.example.com (empty = use server IP)" ""
if [[ -n "$DOMAIN" ]]; then
  DOMAIN=${DOMAIN#http://}
  DOMAIN=${DOMAIN#https://}
  DOMAIN=${DOMAIN%%/*}
  [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "Invalid domain: $DOMAIN"
  ask EMAIL "Email for the Let's Encrypt certificate (empty = skip HTTPS)" ""
fi
default_root=/var/www
[[ -d /var/www ]] || { [[ -d /home ]] && ((DETECTED_LSWS == 1)) && default_root=/home; }
ask WEB_ROOT "Web root the File Manager may access" "$default_root"
WEB_ROOT=$(realpath -m "$WEB_ROOT")

if [[ -z "$APP_USER" ]]; then
  owner=$(stat -c %U "$WEB_ROOT" 2>/dev/null || echo root)
  ask APP_USER "Linux user to run the panel as" "$([[ "$owner" != root && "$owner" != UNKNOWN ]] && echo "$owner" || echo clauai)"
fi
if [[ "$APP_USER" == root && "${ALLOW_ROOT:-0}" != 1 ]]; then
  die "Running the panel as root is unsafe. Choose another user (or set ALLOW_ROOT=1 if you really must)."
fi

EXISTING_HASH=$(get_env ADMIN_PASSWORD_HASH)
if [[ -z "$EXISTING_HASH" || "${RESET_ADMIN:-0}" == 1 ]]; then
  ask ADMIN_USER "Panel admin username" "admin"
  [[ "$ADMIN_USER" =~ ^[A-Za-z0-9_.-]{3,32}$ ]] || die "Username must be 3-32 chars: letters, numbers, _ . -"
  ask_password
  if [[ -n "$ADMIN_PASS" ]] && ((${#ADMIN_PASS} < 10)); then die "ADMIN_PASS must be at least 10 characters"; fi
  GENERATED_PASS=0
  if [[ -z "$ADMIN_PASS" ]]; then
    ADMIN_PASS=$(random_string 20)
    GENERATED_PASS=1
  fi
else
  info "Keeping the existing admin login (set RESET_ADMIN=1 to change it)"
fi

# --------------------------------------------------------------- packages ---

step "Installing system packages"
if [[ "$PKG" == apt ]]; then
  pkg_install ca-certificates curl git gnupg procps iproute2 acl
else
  pkg_install ca-certificates curl git procps-ng iproute acl
fi

need_node=1
if command -v node >/dev/null; then
  current=$(node -p 'process.versions.node')
  if version_ge "$current" "18.17.0"; then
    need_node=0
    info "Node.js $current already installed"
  fi
fi
if ((need_node)); then
  info "Installing Node.js $NODE_MAJOR LTS (NodeSource)"
  if [[ "$PKG" == apt ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null
  else
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
    dnf install -y -q nodejs >/dev/null
  fi
  info "Node.js $(node -p 'process.versions.node') installed"
fi
NODE_BIN=$(command -v node)

if ((MEM_MB < 1800 && SWAP_MB < 512)) && [[ ! -e /swapfile ]]; then
  warn "Only ${MEM_MB} MB RAM and no swap — building the app may run out of memory."
  if confirm "Create a 2 GB swap file (/swapfile)?" y; then
    if fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
      chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile &&
        { grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab; } &&
        info "Swap enabled" || warn "Could not enable swap (container/VPS limits?) — continuing"
    fi
  fi
fi

# ------------------------------------------------------------ app user ---

step "Preparing user and folders"
mkdir -p "$WEB_ROOT"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$INSTALL_DIR" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
  info "Created system user $APP_USER"
fi
APP_GROUP=$(id -gn "$APP_USER")
WEB_OWNER=$(stat -c %U "$WEB_ROOT")
if [[ "$WEB_OWNER" != "$APP_USER" ]]; then
  warn "$WEB_ROOT is owned by $WEB_OWNER, the panel runs as $APP_USER."
  if confirm "Give $APP_USER read/write access to $WEB_ROOT with ACLs (setfacl)?" n; then
    setfacl -R -m "u:$APP_USER:rwX" "$WEB_ROOT" && setfacl -R -d -m "u:$APP_USER:rwX" "$WEB_ROOT" &&
      info "ACL added" || warn "setfacl failed (filesystem without ACL support?)"
  else
    info "File Manager will be read-only for files $APP_USER cannot write."
  fi
fi

# ------------------------------------------------------------------ code ---

step "Installing clau-ai into $INSTALL_DIR"
if [[ -n "$SRC_DIR" && "$SRC_DIR" == "$(realpath -m "$INSTALL_DIR")" ]]; then
  info "Using this checkout in place"
elif [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Existing installation found — keeping its code (use scripts/update.sh to update)"
elif [[ -n "$SRC_DIR" ]]; then
  git -c safe.directory='*' clone -q "$SRC_DIR" "$INSTALL_DIR"
  origin=$(git -c safe.directory='*' -C "$SRC_DIR" remote get-url origin 2>/dev/null || echo "$REPO_URL")
  git -c safe.directory='*' -C "$INSTALL_DIR" remote set-url origin "$origin"
  info "Copied from $SRC_DIR (updates will pull from $origin)"
else
  git clone -q --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  info "Cloned $REPO_URL ($BRANCH)"
fi
chown -R "$APP_USER:$APP_GROUP" "$INSTALL_DIR"
chmod 750 "$INSTALL_DIR"

# ------------------------------------------------------------------- .env ---

step "Writing configuration (.env)"
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
fi
if [[ "$(get_env AUTH_SECRET | wc -c)" -lt 33 ]]; then
  set_env AUTH_SECRET "$("$NODE_BIN" -e 'process.stdout.write(require("crypto").randomBytes(48).toString("base64url"))')"
fi
if [[ -n "$ADMIN_USER" ]]; then
  hash=$(CLAU_PW="$ADMIN_PASS" "$NODE_BIN" -e '
    const c = require("crypto"); const salt = c.randomBytes(16);
    const h = c.scryptSync(process.env.CLAU_PW, salt, 64);
    process.stdout.write(`scrypt:${salt.toString("base64url")}:${h.toString("base64url")}`);')
  set_env ADMIN_USERNAME "$ADMIN_USER"
  set_env ADMIN_PASSWORD_HASH "$hash"
fi
set_env FILE_MANAGER_ROOT "$WEB_ROOT"

# Prefer the PHP the websites use: LiteSpeed lsphp > cPanel ea-php > system php
php_bin=""
for pattern in "/usr/local/lsws/lsphp*/bin/php" "/opt/cpanel/ea-php*/root/usr/bin/php"; do
  # shellcheck disable=SC2086 # the glob must expand
  found=$(ls -d $pattern 2>/dev/null | sort -V | tail -n1 || true)
  [[ -n "$found" && -x "$found" ]] && { php_bin=$found; break; }
done
[[ -z "$php_bin" ]] && php_bin=$(command -v php || true)
if [[ -n "$php_bin" ]]; then
  set_env PHP_BINARY "$php_bin"
  info "PHP: $php_bin"
else
  info "PHP not found — PHP features stay empty until PHP is installed"
fi

# ------------------------------------------------------------- database ---

mysql_running=0
if pgrep -x mariadbd >/dev/null 2>&1 || pgrep -x mysqld >/dev/null 2>&1; then mysql_running=1; fi
if [[ "$SETUP_DB" == yes || ("$SETUP_DB" == auto && $mysql_running == 1) ]]; then
  step "Connecting the Database page"
  if [[ -n "$(get_env DB_USER)" ]]; then
    info "DB_USER already set in .env — keeping it"
  elif ! command -v mysql >/dev/null || ! mysql -e "SELECT 1" >/dev/null 2>&1; then
    warn "Cannot log in to MySQL/MariaDB as root via socket — set DB_USER/DB_PASSWORD in $INSTALL_DIR/.env yourself."
  else
    db_pass=$(random_string 28)
    mysql <<SQL
CREATE USER IF NOT EXISTS 'clauai'@'localhost' IDENTIFIED BY '$db_pass';
ALTER USER 'clauai'@'localhost' IDENTIFIED BY '$db_pass';
GRANT ALL PRIVILEGES ON *.* TO 'clauai'@'localhost';
FLUSH PRIVILEGES;
SQL
    set_env DB_HOST localhost
    set_env DB_USER clauai
    set_env DB_PASSWORD "$db_pass"
    info "Created MySQL user clauai@localhost"
    command -v mysqldump >/dev/null || warn "mysqldump not found — install the MySQL/MariaDB client for backups"
  fi
fi
chown "$APP_USER:$APP_GROUP" "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"

# ----------------------------------------------------------------- build ---

step "Installing dependencies and building (this takes a few minutes)"
cd "$INSTALL_DIR"
as_app npm ci --no-audit --no-fund --loglevel=error
as_app npm run build --silent >/tmp/clau-ai-build.log 2>&1 || {
  tail -n 30 /tmp/clau-ai-build.log
  die "Build failed — full log in /tmp/clau-ai-build.log"
}
info "Build complete"

# --------------------------------------------------------------- service ---

step "Starting the panel"
if has_systemd; then
  SERVICE_MODE=systemd
  cat >/etc/systemd/system/clau-ai.service <<UNIT
[Unit]
Description=clau-ai server control panel
After=network.target mariadb.service mysql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
ExecStart=$NODE_BIN $INSTALL_DIR/node_modules/next/dist/bin/next start -H 127.0.0.1 -p $PORT
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable clau-ai >/dev/null 2>&1
  systemctl restart clau-ai
  info "systemd service clau-ai enabled"
else
  SERVICE_MODE=pm2
  command -v pm2 >/dev/null || npm install -g pm2 --silent >/dev/null
  pm2_start
  info "Started with PM2 (no systemd). To start on boot, set up: pm2 startup"
fi

cat >"$CONFIG_FILE" <<CONF
# Written by clau-ai installer — read by scripts/update.sh and scripts/uninstall.sh
INSTALL_DIR=$INSTALL_DIR
APP_USER=$APP_USER
PORT=$PORT
SERVICE_MODE=$SERVICE_MODE
CONF

ok=0
for _ in $(seq 1 40); do
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/login"; then ok=1; break; fi
  sleep 1
done
((ok)) || die "The panel did not start. Check: $([[ $SERVICE_MODE == systemd ]] && echo 'journalctl -u clau-ai -n 50' || echo 'pm2 logs clau-ai')"
info "Panel is answering on 127.0.0.1:$PORT"

# ------------------------------------------------------------ web server ---

PUBLIC_URL=""
SERVER_IP=$(curl -fsS -4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')

if [[ "$SETUP_NGINX" == auto ]]; then
  if ((DETECTED_LSWS)); then SETUP_NGINX=litespeed
  elif ((DETECTED_APACHE)); then SETUP_NGINX=apache
  else SETUP_NGINX=yes
  fi
fi

case "$SETUP_NGINX" in
  yes)
    step "Configuring Nginx"
    command -v nginx >/dev/null || pkg_install nginx
    if [[ -n "$DOMAIN" ]]; then
      listen="listen 80;"
      server_name=$DOMAIN
      PUBLIC_URL="http://$DOMAIN"
    else
      listen="listen $PANEL_PORT;"
      server_name="_"
      PUBLIC_URL="http://$SERVER_IP:$PANEL_PORT"
    fi
    upload_mb=$(get_env MAX_UPLOAD_MB)
    if [[ -d /etc/nginx/sites-available ]]; then
      nginx_conf=/etc/nginx/sites-available/clau-ai
      ln -sf "$nginx_conf" /etc/nginx/sites-enabled/clau-ai
    else
      nginx_conf=/etc/nginx/conf.d/clau-ai.conf
    fi
    cat >"$nginx_conf" <<NGINX
# clau-ai — generated by scripts/install.sh
server {
    $listen
    server_name $server_name;

    client_max_body_size ${upload_mb:-100}M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        # \$http_host keeps the port, needed for the panel's same-origin check
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
        proxy_request_buffering off;
    }
}
NGINX
    if command -v getenforce >/dev/null && [[ "$(getenforce)" == Enforcing ]]; then
      setsebool -P httpd_can_network_connect 1 || true
      if [[ -z "$DOMAIN" ]] && command -v semanage >/dev/null; then
        semanage port -a -t http_port_t -p tcp "$PANEL_PORT" 2>/dev/null || true
      fi
    fi
    # On servers with IPv6 disabled, the distro's default site ("listen [::]:80") stops nginx from starting.
    if [[ ! -e /proc/net/if_inet6 ]]; then
      for f in /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf /etc/nginx/nginx.conf; do
        [[ -f "$f" ]] && grep -qE '^\s*listen\s+\[::\]' "$f" &&
          sed -i -E 's/^(\s*)(listen\s+\[::\])/\1# no IPv6 on this server (clau-ai installer): \2/' "$f" &&
          info "Disabled IPv6 listen lines in $f (IPv6 is not available)"
      done
    fi
    nginx -t >/dev/null 2>&1 || { nginx -t; die "Nginx configuration test failed"; }
    svc_start nginx
    info "Nginx site written to $nginx_conf"

    if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
      step "Requesting a Let's Encrypt certificate for $DOMAIN"
      if [[ "$PKG" == apt ]]; then
        pkg_install certbot python3-certbot-nginx
      else
        pkg_install epel-release || true
        pkg_install certbot python3-certbot-nginx
      fi
      if certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect >/tmp/clau-ai-certbot.log 2>&1; then
        PUBLIC_URL="https://$DOMAIN"
        info "HTTPS enabled (auto-renewal is handled by certbot)"
      else
        warn "Certificate request failed — is the DNS A record of $DOMAIN pointing to $SERVER_IP?"
        warn "Fix DNS, then run: certbot --nginx -d $DOMAIN   (log: /tmp/clau-ai-certbot.log)"
      fi
    fi

    # Open the firewall only if one is already active (never enable one — that could lock out SSH)
    if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
      if [[ -n "$DOMAIN" ]]; then ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null; else ufw allow "$PANEL_PORT/tcp" >/dev/null; fi
      info "UFW rules added"
    elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
      if [[ -n "$DOMAIN" ]]; then
        firewall-cmd --permanent --add-service=http --add-service=https >/dev/null
      else
        firewall-cmd --permanent --add-port="$PANEL_PORT/tcp" >/dev/null
      fi
      firewall-cmd --reload >/dev/null
      info "firewalld rules added"
    fi
    ;;
  litespeed)
    step "LiteSpeed detected — skipping Nginx"
    info "In LiteSpeed WebAdmin (port 7080): Virtual Host → External App → Web Server:"
    info "  Name clau-ai, Address 127.0.0.1:$PORT. Then add a Context: URI /, Type Proxy, Web Server clau-ai."
    info "CyberPanel: create a website for your panel domain and add the proxy rule in its rewrite rules:"
    info "  REWRITERULE ^(.*)\$ http://clau-ai/\$1 [P,L]"
    ;;
  apache)
    step "Apache detected — skipping Nginx"
    info "Enable the proxy modules:  a2enmod proxy proxy_http headers  (Debian/Ubuntu)"
    info "Then add a VirtualHost for your panel domain containing:"
    info "  ProxyPreserveHost On"
    info "  ProxyPass / http://127.0.0.1:$PORT/"
    info "  ProxyPassReverse / http://127.0.0.1:$PORT/"
    info "  RequestHeader set X-Forwarded-Proto \"https\"   # when served over HTTPS"
    ;;
  *)
    info "Skipping web server setup (SETUP_NGINX=$SETUP_NGINX)"
    ;;
esac

# ---------------------------------------------------------------- summary ---

printf '\n%s%s' "$C_GREEN" "$C_BOLD"
echo "  ✔ clau-ai is installed"
printf '%s\n' "$C_RESET"
if [[ -n "$PUBLIC_URL" ]]; then
  echo "  Open:        $PUBLIC_URL"
else
  echo "  Local URL:   http://127.0.0.1:$PORT  (finish the web server step above to reach it from outside)"
fi
if [[ -n "$ADMIN_USER" ]]; then
  echo "  Username:    $ADMIN_USER"
  if [[ "${GENERATED_PASS:-0}" == 1 ]]; then
    echo "  Password:    $ADMIN_PASS   ${C_YELLOW}← generated, save it now${C_RESET}"
  else
    echo "  Password:    (the one you entered)"
  fi
fi
echo "  App folder:  $INSTALL_DIR  (settings in $INSTALL_DIR/.env)"
echo "  Runs as:     $APP_USER   ·   File Manager root: $WEB_ROOT"
echo
if [[ "$SERVICE_MODE" == systemd ]]; then
  echo "  Status/logs: systemctl status clau-ai   ·   journalctl -u clau-ai -f"
else
  echo "  Status/logs: sudo -u $APP_USER PM2_HOME=$INSTALL_DIR/.pm2 pm2 status   ·   ... pm2 logs clau-ai"
fi
echo "  Update:      sudo bash $INSTALL_DIR/scripts/update.sh"
echo "  Uninstall:   sudo bash $INSTALL_DIR/scripts/uninstall.sh"
if [[ "$PUBLIC_URL" == http://* ]]; then
  echo
  warn "The panel is served over plain HTTP. Use a domain + EMAIL to enable HTTPS before logging in from public networks."
fi
echo
