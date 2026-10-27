#!/usr/bin/env python3
"""Lightweight ARM64 TV Box / Linux Server monitoring agent."""

import argparse
import json
import logging
import os
import platform
import re
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

# =============================================================================
# 4 MỤC CẤU HÌNH QUA BIẾN MÔI TRƯỜNG (Đọc từ file agent.env)
# =============================================================================

# 1. Định danh thiết bị (ID, Tên hiển thị, Model)
DEVICE_ID = os.getenv("MONITOR_DEVICE_ID", "arm64-tvbox-01")
DEVICE_NAME = os.getenv("MONITOR_DEVICE_NAME", "ARM64 Server TV Box")
DEVICE_MODEL = os.getenv("MONITOR_DEVICE_MODEL", "")
AGENT_VERSION = "1.0.0"

# 2. Đường dẫn file lưu trạng thái mạng (dùng để tính tốc độ RX/TX giữa 2 lần chạy)
STATE_FILE = Path(
    os.getenv("MONITOR_STATE_FILE", "/var/lib/server-monitor/net-state.json")
)  # Gợi ý đường dẫn: /var/lib/server-monitor/net-state.json hoặc /var/lib/<ten-du-an>-monitor/net-state.json

# 3. Danh sách các Docker Container quan trọng (cách nhau bởi dấu phẩy trong agent.env)
DEFAULT_CRITICAL_CONTAINERS = (
    "app-nginx",
    "app-backend",
    "app-mysql",
    "app-nextjs",
    "cloudflare-tunnel",
)

# 4. Mô tả vai trò mặc định của các Container
CONTAINER_ROLE = os.getenv("MONITOR_CONTAINER_ROLE", "Docker Service")


def run(command, timeout=8):
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return ""


def read_int_file(path, default=0):
    try:
        return int(Path(path).read_text().strip())
    except (OSError, ValueError):
        return default


def read_meminfo():
    result = {}
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, value = line.split(":", 1)
            match = re.search(r"\d+", value)
            if match:
                result[key] = int(match.group()) * 1024
    except OSError:
        pass
    return result


def read_cpu_counters():
    try:
        values = Path("/proc/stat").read_text().splitlines()[0].split()[1:]
        nums = [int(v) for v in values]
        idle = nums[3] + (nums[4] if len(nums) > 4 else 0)
        total = sum(nums)
        iowait = nums[4] if len(nums) > 4 else 0
        return total, idle, iowait
    except (OSError, ValueError, IndexError):
        return 0, 0, 0


def cpu_usage():
    a = read_cpu_counters()
    time.sleep(0.25)
    b = read_cpu_counters()

    total_delta = b[0] - a[0]
    idle_delta = b[1] - a[1]
    wait_delta = b[2] - a[2]

    if total_delta <= 0:
        return None, None

    cpu = 100 * (total_delta - idle_delta) / total_delta
    iowait = 100 * wait_delta / total_delta
    return round(max(0, min(100, cpu)), 2), round(iowait, 2)


def read_network():
    rx = tx = errors = 0
    try:
        lines = Path("/proc/net/dev").read_text().splitlines()[2:]
        for line in lines:
            interface, counters = line.split(":", 1)
            if interface.strip() == "lo":
                continue
            values = [int(v) for v in counters.split()]
            rx += values[0]
            errors += values[2] + values[10]
            tx += values[8]
    except (OSError, ValueError, IndexError):
        pass
    return rx, tx, errors


def network_rates():
    current = read_network()
    rx_rate = tx_rate = 0

    try:
        previous = json.loads(STATE_FILE.read_text())
        elapsed = time.time() - previous["time"]
        if elapsed > 0:
            rx_rate = max(0, int((current[0] - previous["rx"]) / elapsed))
            tx_rate = max(0, int((current[1] - previous["tx"]) / elapsed))
    except (OSError, ValueError, KeyError, TypeError):
        pass

    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(
            json.dumps(
                {
                    "time": time.time(),
                    "rx": current[0],
                    "tx": current[1],
                }
            )
        )
    except OSError:
        pass

    return rx_rate, tx_rate, current[2]


def temperatures():
    values = []
    root = Path("/sys/class/thermal")
    try:
        for item in root.glob("thermal_zone*/temp"):
            raw = read_int_file(item, -1)
            if raw < 0:
                continue
            temp = raw / 1000 if raw > 1000 else float(raw)
            if -10 <= temp <= 150:
                zone = item.parent
                try:
                    zone_type = (zone / "type").read_text().strip()
                except OSError:
                    zone_type = zone.name
                values.append(
                    {
                        "zone": zone.name,
                        "type": zone_type,
                        "temperature_celsius": round(temp, 2),
                    }
                )
    except OSError:
        pass

    cpu_values = [
        item["temperature_celsius"]
        for item in values
        if any(
            word in item["type"].lower() for word in ("cpu", "soc", "package")
        )
    ]
    selected = cpu_values or [item["temperature_celsius"] for item in values]
    return (
        round(max(selected), 2) if selected else None,
        values,
    )


def disk_metrics():
    try:
        info = shutil.disk_usage("/")
        percent = (
            round(100 * info.used / info.total, 2) if info.total > 0 else None
        )
        mounts = [
            {
                "mount": "/",
                "total_bytes": info.total,
                "used_bytes": info.used,
                "free_bytes": info.free,
                "percent": percent,
            }
        ]
        return info.total, info.used, percent, mounts
    except OSError:
        return None, None, None, []


def read_vmstat():
    result = {}
    try:
        for line in Path("/proc/vmstat").read_text().splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1].isdigit():
                result[parts[0]] = int(parts[1])
    except OSError:
        pass
    return result


def parse_size(raw):
    if not raw:
        return None
    match = re.match(
        r"^\s*([0-9.]+)\s*([kKmMgGtTpP]?i?[bB])?\s*$",
        raw.strip(),
    )
    if not match:
        return None
    value = float(match.group(1))
    unit = (match.group(2) or "b").lower()
    multipliers = {
        "b": 1,
        "kb": 1000,
        "kib": 1024,
        "mb": 1000**2,
        "mib": 1024**2,
        "gb": 1000**3,
        "gib": 1024**3,
        "tb": 1000**4,
        "tib": 1024**4,
    }
    return int(value * multipliers.get(unit, 1))


def get_critical_containers():
    raw_critical = os.getenv("MONITOR_CRITICAL_CONTAINERS", "").strip()
    if raw_critical:
        return tuple(
            item.strip() for item in raw_critical.split(",") if item.strip()
        )
    return DEFAULT_CRITICAL_CONTAINERS


def docker_metrics():
    ids_raw = run(["docker", "ps", "-aq"])
    if not ids_raw:
        return []

    ids = ids_raw.splitlines()
    inspect_raw = run(["docker", "inspect", *ids], timeout=12)
    stats_raw = run(
        ["docker", "stats", "--no-stream", "--format", "{{json .}}"],
        timeout=15,
    )

    stats_by_name = {}
    for line in stats_raw.splitlines():
        try:
            item = json.loads(line)
            name = item.get("Name", "").lstrip("/")
            if name:
                stats_by_name[name] = item
        except ValueError:
            continue

    try:
        inspected = json.loads(inspect_raw)
    except ValueError:
        return []

    critical_names = get_critical_containers()
    containers = []

    for item in inspected:
        name = item.get("Name", "").lstrip("/")
        state = item.get("State") or {}
        config = item.get("Config") or {}
        stats = stats_by_name.get(name, {})

        cpu_raw = str(stats.get("CPUPerc", "")).replace("%", "").strip()
        mem_perc_raw = str(stats.get("MemPerc", "")).replace("%", "").strip()
        mem_usage_raw = str(stats.get("MemUsage", ""))

        usage_bytes = limit_bytes = None
        if "/" in mem_usage_raw:
            left, right = mem_usage_raw.split("/", 1)
            usage_bytes = parse_size(left)
            limit_bytes = parse_size(right)

        try:
            cpu_val = round(float(cpu_raw), 2) if cpu_raw else None
        except ValueError:
            cpu_val = None

        try:
            mem_perc_val = (
                round(float(mem_perc_raw), 2) if mem_perc_raw else None
            )
        except ValueError:
            mem_perc_val = None

        health = (state.get("Health") or {}).get("Status") or "none"
        status_str = state.get("Status") or "unknown"

        containers.append(
            {
                "container_name": name,
                "container_id_short": (item.get("Id") or "")[:12] or None,
                "image": config.get("Image") or "unknown",
                "role_description": CONTAINER_ROLE,
                "is_critical_service": name in critical_names,
                "state": status_str,
                "status_text": status_str,
                "cpu_percent": cpu_val,
                "memory_usage_bytes": usage_bytes,
                "memory_limit_bytes": limit_bytes,
                "memory_percent": mem_perc_val,
                "restart_count": int(item.get("RestartCount") or 0),
                "oom_killed": bool(state.get("OOMKilled")),
                "health_status": health,
                "exit_code": state.get("ExitCode"),
                "started_at": state.get("StartedAt"),
            }
        )

    return containers


def cpu_model():
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if ":" in line:
                key, value = line.split(":", 1)
                if key.strip().lower() in ("model name", "hardware", "model"):
                    return value.strip()
    except OSError:
        pass
    return DEVICE_MODEL or platform.processor() or None


def collect_payload():
    now = datetime.now(timezone.utc)
    recorded_at = now.isoformat()
    idempotency_key = f"{DEVICE_ID}:{now.strftime('%Y%m%d%H%M')}:{uuid.uuid4().hex[:8]}"

    cpu_pct, iowait_pct = cpu_usage()
    try:
        load_1, load_5, load_15 = [round(v, 2) for v in os.getloadavg()]
    except OSError:
        load_1 = load_5 = load_15 = None

    mem = read_meminfo()
    vmstat = read_vmstat()
    temp_c, thermal_zones = temperatures()
    disk_total, disk_used, disk_pct, mounts = disk_metrics()
    rx_rate, tx_rate, net_errors = network_rates()

    try:
        uptime_seconds = int(
            float(Path("/proc/uptime").read_text().split()[0])
        )
    except (OSError, ValueError, IndexError):
        uptime_seconds = None

    mem_total = mem.get("MemTotal")
    mem_avail = mem.get("MemAvailable")
    mem_used = (
        max(0, mem_total - mem_avail)
        if mem_total is not None and mem_avail is not None
        else None
    )

    return {
        "device_id": DEVICE_ID,
        "idempotency_key": idempotency_key,
        "recorded_at": recorded_at,
        "device": {
            "name": DEVICE_NAME,
            "hostname": socket.gethostname(),
            "kernel_version": platform.release(),
            "architecture": platform.machine(),
            "cpu_model": cpu_model(),
            "cpu_cores": os.cpu_count() or 1,
            "agent_version": AGENT_VERSION,
        },
        "system": {
            "uptime_seconds": uptime_seconds,
            "cpu_percent": cpu_pct,
            "cpu_iowait_percent": iowait_pct,
            "load_1": load_1,
            "load_5": load_5,
            "load_15": load_15,
            "memory_total_bytes": mem_total,
            "memory_used_bytes": mem_used,
            "memory_available_bytes": mem_avail,
            "memory_cached_bytes": mem.get("Cached"),
            "memory_buffers_bytes": mem.get("Buffers"),
            "swap_total_bytes": mem.get("SwapTotal"),
            "swap_used_bytes": (
                mem.get("SwapTotal", 0) - mem.get("SwapFree", 0)
            ),
            "swap_in_pages": vmstat.get("pswpin"),
            "swap_out_pages": vmstat.get("pswpout"),
            "oom_kill_count": vmstat.get("oom_kill", 0),
            "temperature_celsius": temp_c,
            "thermal_zones_json": thermal_zones,
            "root_disk_total_bytes": disk_total,
            "root_disk_used_bytes": disk_used,
            "root_disk_percent": disk_pct,
            "mounts_json": mounts,
            "net_rx_bytes_per_sec": rx_rate,
            "net_tx_bytes_per_sec": tx_rate,
            "net_errors_count": net_errors,
        },
        "containers": docker_metrics(),
        "service_checks": [],
    }


def send_payload(payload):
    supabase_url = os.getenv("MONITOR_SUPABASE_URL", "").rstrip("/")
    anon_key = os.getenv("MONITOR_SUPABASE_ANON_KEY", "").strip()
    device_token = (
        os.getenv("MONITOR_DEVICE_TOKEN", "").strip()
        or os.getenv("MONITOR_INGEST_SECRET", "").strip()
    )
    functions_url = os.getenv("SUPABASE_FUNCTIONS_URL", "").rstrip("/")

    # Hỗ trợ cả 2 chế độ: gọi RPC `ingest_device_metrics` hoặc gọi Edge Function `ingest-metrics`
    if supabase_url and anon_key and device_token:
        url = f"{supabase_url}/rest/v1/rpc/ingest_device_metrics"
        body = json.dumps(
            {
                "payload": payload,
                "device_token": device_token,
            }
        ).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
        }
    elif functions_url and device_token:
        url = f"{functions_url}/ingest-metrics"
        body = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {device_token}",
        }
    else:
        raise RuntimeError(
            "Missing environment variables: configure (MONITOR_SUPABASE_URL, MONITOR_SUPABASE_ANON_KEY, MONITOR_DEVICE_TOKEN) "
            "or (SUPABASE_FUNCTIONS_URL, MONITOR_INGEST_SECRET)."
        )

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace").strip()
            if raw:
                data = json.loads(raw)
                rpc_status = data.get("status")
                if rpc_status and rpc_status not in ("accepted", "duplicate"):
                    raise RuntimeError(
                        f"Unexpected ingest response status: {rpc_status}"
                    )
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP error {exc.code} during telemetry ingest") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error during telemetry ingest: {exc.reason}") from exc


def main():
    parser = argparse.ArgumentParser(
        description="ARM64 TV Box / Linux Server monitoring agent"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print collected JSON payload to stdout without sending to Supabase",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    payload = collect_payload()
    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return

    send_payload(payload)
    logging.info(
        "Telemetry sent for device=%s containers=%d",
        payload["device_id"],
        len(payload["containers"]),
    )


if __name__ == "__main__":
    main()
