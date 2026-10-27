#!/bin/bash
set -u
umask 077

# Mục 5 - Chú thích: Giữ đường dẫn mặc định và gợi ý đường dẫn thay thế theo tên dự án của bạn
LOG_DIR="${MONITOR_LOG_DIR:-/var/log/server-monitor}"           # Gợi ý: /var/log/server-monitor hoặc /var/log/<ten-du-an>-monitor
LOG_FILE="${LOG_DIR}/agent.log"
LOCK_FILE="${MONITOR_LOCK_FILE:-/run/lock/server-monitor.lock}" # Gợi ý: /run/lock/server-monitor.lock hoặc /run/lock/<ten-du-an>-monitor.lock
AGENT="${MONITOR_SCRIPT_PATH:-/opt/server-monitor/monitor.py}"  # Gợi ý: /opt/server-monitor/monitor.py hoặc /opt/<ten-du-an>-monitor/monitor.py
ENV_FILE="${MONITOR_ENV_FILE:-/etc/server-monitor/agent.env}"   # Gợi ý: /etc/server-monitor/agent.env hoặc /etc/<ten-du-an>-monitor/agent.env

install -d -o root -g root -m 700 "$LOG_DIR"
touch "$LOG_FILE"
chown root:root "$LOG_FILE"
chmod 600 "$LOG_FILE"

exec 9>"$LOCK_FILE"
if ! /usr/bin/flock -n 9; then
    printf '%s WARNING another agent run is active; skipping\n' \
      "$(date --iso-8601=seconds)" >> "$LOG_FILE"
    exit 0
fi

if [ ! -r "$ENV_FILE" ]; then
    printf '%s ERROR agent environment file is unavailable\n' \
      "$(date --iso-8601=seconds)" >> "$LOG_FILE"
    exit 1
fi

set -a
. "$ENV_FILE"
set +a

if /usr/bin/timeout 45s /usr/bin/python3 "$AGENT" \
    >> "$LOG_FILE" 2>&1; then
    exit 0
else
    rc=$?
    if [ "$rc" -eq 124 ]; then
        printf '%s ERROR agent timed out after 45 seconds\n' \
          "$(date --iso-8601=seconds)" >> "$LOG_FILE"
    else
        printf '%s ERROR agent exited with code %s\n' \
          "$(date --iso-8601=seconds)" "$rc" >> "$LOG_FILE"
    fi
    exit "$rc"
fi
