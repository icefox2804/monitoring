# ARM64 Server & Docker Monitoring Dashboard

Hệ thống giám sát hạ tầng **3 tầng (3-Tier Architecture)** chuyên dụng cho máy chủ **Linux ARM64 (TV Box / Mini PC / Raspberry Pi)** chạy các dịch vụ Docker Production thông qua Cloudflare Tunnel, sử dụng **Supabase (PostgreSQL + Edge Functions + Auth RLS)** và giao diện **React + TypeScript + Tailwind CSS**.

---

## 1. Kiến trúc tổng thể (3 Thành phần)

```text
┌─────────────────────────────────────────────────────────────────┐
│ TẦNG 1: MÁY CHỦ LINUX ARM64 / TV BOX (`/agent`)                 │
│ - Wrapper `/opt/server-monitor/run-agent.sh` kiểm tra khóa      │
│   `flock`, nạp `/etc/server-monitor/agent.env`, giới hạn        │
│   timeout 45s và ghi log vào `/var/log/server-monitor/agent.log`│
│ - Script Python `/opt/server-monitor/monitor.py` đọc `/proc/*`, │
│   nhiệt độ SoC, mạng, ổ cứng & Docker containers mỗi 60s        │
│ - Tự động chạy định kỳ qua `server-monitor-agent.service` và    │
│   `server-monitor-agent.timer`                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS POST (Outbound-only)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ TẦNG 2: SUPABASE BACKEND (`/supabase`)                          │
│ - Cổng nhận dữ liệu (RPC `ingest_device_metrics` hoặc Edge      │
│   Function `ingest-metrics`): Xác thực SHA-256 Token từ bảng    │
│   `device_secrets`, lưu dữ liệu vào 12 bảng PostgreSQL          │
│ - Edge Function `external-probe`: Kiểm tra độ trễ & HTTP status │
│   của Website/API công khai từ bên ngoài                        │
│ - PostgreSQL + RLS (`is_monitoring_admin()`): Bảo vệ toàn bộ    │
│   12 bảng, chỉ tài khoản trong `admin_users` mới được phép đọc  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Supabase JS SDK (Anon Key + Auth)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ TẦNG 3: WEB DASHBOARD (`/src`)                                  │
│ - Giao diện React + Vite + Tailwind CSS                         │
│ - Hỗ trợ cả chế độ Live Telemetry (Supabase) và Prototype Mode  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Bản đồ Chi tiết Toàn bộ các File (File ở đâu? Dùng để làm gì?)

### 2.1. Nhóm 7 File của Agent trên Máy chủ Linux ARM64 / TV Box

Đây là bộ file vận hành trực tiếp trên thiết bị TV Box để thu thập và đẩy thông số mỗi 60 giây:

| STT | Tên file | Vị trí trong Repo Git | Vị trí cài đặt trên TV Box | Loại file & Quyền | Chức năng chi tiết (File dùng để làm gì?) |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | **`monitor.py`** | `/agent/monitor.py` | `/opt/server-monitor/monitor.py` | Mã nguồn tĩnh (`chmod 700`) | **Trái tim của Agent**: Đọc trực tiếp `/proc/stat` (CPU), `/proc/meminfo` (RAM/Swap), `/proc/vmstat` (OOM Kill), `/sys/class/thermal` (Nhiệt độ SoC), `/proc/net/dev` (Mạng), ổ cứng và gọi `docker stats`/`docker inspect` để đóng gói thành JSON gửi lên Supabase. |
| **2** | **`run-agent.sh`** | `/agent/run-agent.sh` | `/opt/server-monitor/run-agent.sh` | Script thực thi (`chmod 700`) | **Lớp vỏ bảo vệ (Wrapper)**: Tạo thư mục log an toàn (`umask 077`), dùng `/usr/bin/flock -n 9` trên file `/run/lock/server-monitor.lock` để **chống chạy chồng chéo**, nạp biến môi trường từ `agent.env`, và bọc lệnh chạy `monitor.py` trong `/usr/bin/timeout 45s` để **chống treo máy** nếu Docker bị đơ. |
| **3** | **`server-monitor-agent.service`** | `/agent/systemd/server-monitor-agent.service` | `/etc/systemd/system/server-monitor-agent.service` | Cấu hình Systemd (`chmod 644`) | **Định nghĩa dịch vụ**: Khai báo với Linux Systemd cách chạy `/opt/server-monitor/run-agent.sh` dưới quyền `root` ở chế độ `Type=oneshot` (chạy xong thoát ngay, không chiếm RAM ngầm) với ngưỡng cắt an toàn `TimeoutStartSec=50`. |
| **4** | **`server-monitor-agent.timer`** | `/agent/systemd/server-monitor-agent.timer` | `/etc/systemd/system/server-monitor-agent.timer` | Lịch chạy Systemd (`chmod 644`) | **Đồng hồ báo thức tự động**: Đợi 2 phút sau khi TV Box khởi động (`OnBootSec=2min`), sau đó cứ đúng **60 giây** kể từ khi lần chạy trước kết thúc (`OnUnitInactiveSec=60s`) sẽ kích hoạt file `.service` ở mục 3. |
| **5** | **`agent.env`** | `/agent/agent.env.example` *(mẫu Git)*<br>`/agent/agent.env` *(bản riêng, ẩn `.gitignore`)* | `/etc/server-monitor/agent.env` | Cấu hình nhạy cảm (`chmod 600`) | **Két sắt chứa cấu hình & mật khẩu của Agent**: Lưu `MONITOR_DEVICE_ID`, danh sách container quan trọng (`MONITOR_CRITICAL_CONTAINERS`), URL Supabase, `MONITOR_SUPABASE_ANON_KEY` và mật khẩu thiết bị `MONITOR_DEVICE_TOKEN`. Chỉ `root` mới đọc được. |
| **6** | **`agent.log`** | *(Không lưu trên Git — Tự sinh khi chạy)* | `/var/log/server-monitor/agent.log` | File nhật ký Runtime (`chmod 600`) | **Sổ khám bệnh (Chẩn đoán sự cố)**: Được `run-agent.sh` tự động tạo ra. Ghi lại mọi cảnh báo chạy trùng, lỗi thiếu file `agent.env`, lỗi quá thời gian 45 giây (`rc=124`), hoặc lỗi kết nối mạng/HTTP khi gửi dữ liệu lên Supabase. |
| **7** | **`net-state.json`** | *(Không lưu trên Git — Tự sinh khi chạy)* | `/var/lib/server-monitor/net-state.json` | File trạng thái Runtime (`chmod 600`) | **Bộ nhớ tạm tính tốc độ mạng**: Do `/proc/net/dev` của Linux chỉ lưu tổng số byte cộng dồn từ lúc bật máy, `monitor.py` tự động ghi `{"rx": ..., "tx": ..., "ts": ...}` vào file này ở mỗi chu kỳ để lấy **(Số byte hiện tại − Số byte 60s trước) / Khoảng thời gian**, từ đó tính ra tốc độ mạng `B/s` thực tế. |

> **Lưu ý thêm**: Khi `run-agent.sh` đang chạy, nó còn tạo một file khóa tạm thời tại `/run/lock/server-monitor.lock` để cơ chế `flock` nhận biết tiến trình đang hoạt động.

---

### 2.2. Nhóm File Backend Supabase & Giao diện Web Dashboard

| STT | File trong Dự án | Dùng để làm gì? | Đặt / Chạy ở đâu? |
| :-: | :--- | :--- | :--- |
| **1** | `supabase/migrations/001_initial_monitoring_schema.sql` | Khởi tạo toàn bộ **12 bảng PostgreSQL**, hàm kiểm tra quyền `is_monitoring_admin()` và chính sách bảo mật **Row-Level Security (RLS)**. | Copy nội dung và bấm **Run** trong mục **SQL Editor** trên Supabase Dashboard. |
| **2** | `supabase/functions/ingest-metrics/index.ts` | Edge Function nhận gói tin JSON từ `monitor.py`, băm SHA-256 token để đối chiếu với bảng `device_secrets`, lưu thông số vào DB và tự động bật/tắt cảnh báo (`alerts`). | Deploy lên **Supabase Edge Functions** bằng lệnh `supabase functions deploy ingest-metrics`. |
| **3** | `supabase/functions/external-probe/index.ts` | Edge Function đóng vai người dùng thật từ Internet gọi thử vào Website & API qua Cloudflare Tunnel để đo độ trễ (ms) và phát hiện lỗi `502 Bad Gateway` / `530 Origin Down`. | Deploy lên **Supabase Edge Functions** bằng lệnh `supabase functions deploy external-probe`. |
| **4** | `.env` *(ẩn trong `.gitignore`)* & `.env.example` | Cấu hình biến môi trường cho giao diện Web Dashboard (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MONITOR_DEVICE_ID`). | Đặt tại thư mục gốc `/` của dự án Web (hoặc mục **Environment Variables** trên Vercel/Cloudflare Pages khi deploy web). |

---

## 3. Hướng dẫn Chi tiết về Secret & Token (Cách tạo & Gắn ở đâu?)

Hệ thống sử dụng **4 loại khóa/định danh bảo mật** tách biệt rõ ràng giữa **Thiết bị (TV Box)**, **Database (Supabase)** và **Trình duyệt (Web Dashboard)**.

### Bảng tổng hợp nhanh: Secret/Token nào gắn ở đâu?

| Tên Khóa / Secret | Cách tạo / Lấy ở đâu? | Gắn vào đâu? | TUYỆT ĐỐI KHÔNG gắn vào đâu? |
| :--- | :--- | :--- | :--- |
| **1. `MONITOR_DEVICE_TOKEN`** *(Bản chữ thường / Plain-text)* | Tự sinh ngẫu nhiên bằng lệnh:<br>`openssl rand -hex 32` | 1. File `/etc/server-monitor/agent.env` trên TV Box<br>2. *(Tuỳ chọn)* Biến `MONITOR_INGEST_SECRET` trong Supabase Edge Function Secrets | Không gắn vào `.env` của Web Dashboard; không lưu bản gốc chưa mã hóa vào bảng Database. |
| **2. `token_sha256`** *(Bản băm SHA-256 của mục 1)* | Băm chuỗi ở mục 1 bằng SQL `encode(digest('...', 'sha256'), 'hex')` hoặc lệnh `sha256sum` | Cột `token_sha256` trong bảng `public.device_secrets` trên Supabase Database | Không điền mã đã băm này vào file `agent.env` trên TV Box (TV Box phải giữ bản gốc). |
| **3. `SUPABASE_ANON_KEY`** *(Public Anon Key)* | Lấy tại: `Supabase Dashboard` ➔ `Project Settings` ➔ `API` ➔ `anon` `public` | 1. Biến `MONITOR_SUPABASE_ANON_KEY` trong `/etc/server-monitor/agent.env` (TV Box)<br>2. Biến `VITE_SUPABASE_ANON_KEY` trong `.env` (Web Dashboard) | An toàn khi dùng ở cả Agent và Web vì đã có RLS chặn người lạ. |
| **4. `SUPABASE_SERVICE_ROLE_KEY`** *(Secret Key tối cao)* | Lấy tại: `Supabase Dashboard` ➔ `Project Settings` ➔ `API` ➔ `service_role` `secret` | Tự động có sẵn trong **Supabase Edge Functions** (`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`) | **TUYỆT ĐỐI KHÔNG** gắn vào `.env` của Web Dashboard hay `agent.env` trên TV Box. |

---

### Chi tiết cách tạo và gắn từng Secret/Token:

#### A. Cách tạo cặp khóa xác thực Thiết bị (`MONITOR_DEVICE_TOKEN` & `token_sha256`)

Cơ chế bảo mật hoạt động giống như mật khẩu ngân hàng: **TV Box giữ mật khẩu gốc (`MONITOR_DEVICE_TOKEN`)**, còn **Database chỉ lưu mã băm một chiều (`token_sha256`)**. Khi TV Box gửi dữ liệu lên, Supabase sẽ băm mật khẩu TV Box gửi lên rồi so sánh với `token_sha256` trong bảng `device_secrets`.

**Bước A1 — Tạo mật khẩu gốc (Plain-text Token) trên máy tính hoặc TV Box:**
Mở terminal trên Linux/macOS (hoặc trên chính TV Box) và chạy lệnh tạo chuỗi ngẫu nhiên 64 ký tự:
```bash
openssl rand -hex 32
```
Giả sử kết quả in ra là:
```text
9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```
👉 Đây chính là **`MONITOR_DEVICE_TOKEN`** (mật khẩu gốc).

**Bước A2 — Gắn mật khẩu gốc vào TV Box (`/etc/server-monitor/agent.env`):**
Mở file `/etc/server-monitor/agent.env` trên TV Box và dán chuỗi vừa tạo vào:
```dotenv
MONITOR_DEVICE_ID="arm64-tvbox-01"
MONITOR_DEVICE_TOKEN="9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
```

**Bước A3 — Băm SHA-256 và gắn vào bảng `public.device_secrets` trên Supabase:**
Bạn không cần tự tính mã SHA-256 bên ngoài, chỉ cần mở **Supabase Dashboard ➔ SQL Editor** và chạy câu lệnh SQL sau (PostgreSQL sẽ tự băm chuỗi của bạn thành `token_sha256` và lưu vào bảng `device_secrets`):
```sql
-- Thay chuỗi bên trong dấu nháy đơn bằng MONITOR_DEVICE_TOKEN bạn vừa tạo ở Bước A1
INSERT INTO public.device_secrets (device_id, token_sha256, rotated_at)
VALUES (
  'arm64-tvbox-01',
  encode(digest('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', 'sha256'), 'hex'),
  now()
)
ON CONFLICT (device_id) DO UPDATE SET
  token_sha256 = EXCLUDED.token_sha256,
  rotated_at = now();
```
*(Nếu bạn muốn tự kiểm tra mã băm SHA-256 trên terminal Linux, có thể chạy: `printf '%s' "chuỗi_token_của_bạn" | sha256sum` — lưu ý dùng `printf '%s'` để không bị dính ký tự xuống dòng `\n`).*

---

#### B. Cách lấy `SUPABASE_URL` và `SUPABASE_ANON_KEY` và nơi gắn

1. **Cách lấy**:
   - Đăng nhập [Supabase Dashboard](https://supabase.com/dashboard) ➔ Chọn Project của bạn.
   - Nhấn vào biểu tượng bánh răng **Project Settings** (góc dưới bên trái) ➔ chọn mục **API**.
   - Tại mục **Project URL**: Copy đường dẫn `https://xxxxxxxxxxxx.supabase.co`.
   - Tại mục **Project API keys**: Tìm dòng `anon` `public` và nhấn **Copy** (chuỗi bắt đầu bằng `eyJhbGciOi...`).

2. **Gắn ở đâu (2 nơi)**:
   - **Nơi thứ 1 — Trên TV Box (`/etc/server-monitor/agent.env`)**: Để script `monitor.py` biết địa chỉ cổng Supabase cần gửi thông số tới:
     ```dotenv
     MONITOR_SUPABASE_URL="https://xxxxxxxxxxxx.supabase.co"
     MONITOR_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
     ```
   - **Nơi thứ 2 — Tại thư mục gốc của Web Dashboard (`.env`)**: Để giao diện React kết nối tới Supabase:
     ```dotenv
     VITE_SUPABASE_URL="https://xxxxxxxxxxxx.supabase.co"
     VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
     VITE_MONITOR_DEVICE_ID="arm64-tvbox-01"
     ```

---

#### C. Cách tạo Tài khoản Admin (`User UID`) và gắn quyền truy cập Dashboard

Vì toàn bộ 12 bảng đều bật **Row-Level Security (RLS)**, ngay cả khi có `VITE_SUPABASE_ANON_KEY`, người lạ vẫn không đọc được bất kỳ dữ liệu nào nếu chưa nằm trong bảng `public.admin_users`.

1. **Cách tạo**:
   - Vào **Supabase Dashboard ➔ Authentication ➔ Users**.
   - Nhấn nút **Add user ➔ Create new user**.
   - Nhập **Email** và **Password** của bạn, tích chọn **Auto Confirm User** rồi nhấn **Create user**.
   - Sau khi tạo xong, nhìn vào cột **User UID** (dạng `a1b2c3d4-e5f6-7890-abcd-1234567890ab`), nhấn copy mã UUID đó.
2. **Gắn ở đâu**:
   - Vào **SQL Editor** trên Supabase và chạy lệnh gắn `User UID` đó vào bảng `public.admin_users`:
     ```sql
     INSERT INTO public.admin_users (user_id, email, role)
     VALUES ('a1b2c3d4-e5f6-7890-abcd-1234567890ab', 'your-email@example.com', 'admin')
     ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
     ```

---

## 4. Danh sách 12 Bảng Cơ sở dữ liệu (PostgreSQL Schema)

File migration [`supabase/migrations/001_initial_monitoring_schema.sql`](./supabase/migrations/001_initial_monitoring_schema.sql) khởi tạo đầy đủ **12 bảng** chuẩn Production cùng hàm bảo mật `is_monitoring_admin()` và các **RLS Policies**:

1. **`admin_users`**: Danh sách quản trị viên được phép truy cập Dashboard (`user_id`, `email`, `role`, `created_at`).
2. **`devices`**: Thông tin phần cứng máy chủ ARM64, phiên bản kernel, số nhân CPU, danh sách `expected_containers` và thời điểm `last_seen_at`.
3. **`device_secrets`**: Lưu mã băm `token_sha256` của từng thiết bị để xác thực Agent (chỉ `service_role` hoặc hàm `SECURITY DEFINER` được phép đọc/ghi).
4. **`system_metrics`**: Lưu thông số tài nguyên chi tiết theo từng phút (`idempotency_key`, CPU %, I/O wait, Load 1/5/15, RAM/Swap tính theo Bytes, nhiệt độ SoC `temperature_celsius`, `thermal_zones_json`, `mounts_json`, băng thông mạng).
5. **`system_metrics_hourly`**: Bảng tổng hợp dữ liệu theo từng giờ (`hour_bucket`) phục vụ biểu đồ dài hạn và tối ưu dung lượng.
6. **`container_metrics`**: Trạng thái từng Docker container (`container_name`, `image`, `role_description`, `state`, `cpu_percent`, `memory_usage_bytes`, `restart_count`, `oom_killed`, `health_status`).
7. **`service_checks`**: Kết quả kiểm tra sức khỏe dịch vụ từ Agent nội bộ (`agent_local`) và từ Edge Function bên ngoài (`external_probe`).
8. **`alerts`**: Danh sách cảnh báo & sự cố (`rule_key`, `severity`, `status`, `observation`, `probable_cause`, `recommended_check`, `acknowledged_by`).
9. **`alert_events`**: Lịch sử sự kiện của từng cảnh báo (`opened`, `acknowledged`, `resolved`, `email_sent`...).
10. **`monitoring_settings`**: Cấu hình ngưỡng cảnh báo (RAM, CPU, Nhiệt độ, Ổ cứng, Heartbeat Stale/Offline, Cooldown, danh sách email nhận cảnh báo).
11. **`monitor_alert_state`**: Trạng thái theo dõi lỗi liên tiếp (`consecutive_failures`) cho từng dịch vụ.
12. **`monitor_alert_outbox`**: Hàng đợi gửi thông báo cảnh báo (Outbox pattern).

---

## 5. Quy trình Cài đặt Thực tế Từng bước (Từ A-Z)

### Bước 1: Khởi tạo Database, Thiết bị và Secret trên Supabase
1. Mở **Supabase Dashboard ➔ SQL Editor**, copy toàn bộ nội dung file [`supabase/migrations/001_initial_monitoring_schema.sql`](./supabase/migrations/001_initial_monitoring_schema.sql) và nhấn **Run**.
2. Chạy tiếp đoạn SQL sau để đăng ký Admin, khởi tạo Thiết bị (`devices`) và lưu mã băm `token_sha256` vào `device_secrets`:

```sql
-- 1. Cấp quyền Admin cho tài khoản Supabase Auth của bạn
INSERT INTO public.admin_users (user_id, email, role)
VALUES ('00000000-0000-0000-0000-000000000000', 'admin@example.com', 'admin')
ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;

-- 2. Khởi tạo thiết bị máy chủ ARM64 cần giám sát
INSERT INTO public.devices (id, name, hostname, kernel_version, architecture, cpu_cores, expected_containers)
VALUES (
  'arm64-tvbox-01',
  'ARM64 Server TV Box',
  'arm64-tvbox',
  '6.1.0-arm64',
  'aarch64',
  4,
  ARRAY['app-nginx', 'app-backend', 'app-mysql', 'app-nextjs', 'cloudflare-tunnel']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Băm SHA-256 mật khẩu thiết bị và lưu vào bảng device_secrets
INSERT INTO public.device_secrets (device_id, token_sha256, rotated_at)
VALUES (
  'arm64-tvbox-01',
  encode(digest('your-plain-secret-token', 'sha256'), 'hex'),
  now()
)
ON CONFLICT (device_id) DO UPDATE SET
  token_sha256 = EXCLUDED.token_sha256,
  rotated_at = now();
```

---

### Bước 2: Triển khai Supabase Edge Functions (Tuỳ chọn nếu dùng Edge Ingest & External Probe)
Cài đặt [Supabase CLI](https://supabase.com/docs/guides/cli) và chạy các lệnh sau tại thư mục gốc của dự án:

```bash
# 1. Đăng nhập và liên kết với Supabase Project của bạn
supabase login
supabase link --project-ref your-project-ref

# 2. Gắn các biến môi trường bảo mật lên Supabase Edge Functions
supabase secrets set MONITOR_INGEST_SECRET="your-plain-secret-token"
supabase secrets set MONITOR_DEVICE_ID="arm64-tvbox-01"
supabase secrets set PROBE_WEBSITE_URL="https://your-domain.example.com"
supabase secrets set PROBE_API_HEALTH_URL="https://your-domain.example.com/api/v1/health-ping"

# 3. Deploy 2 Edge Functions
supabase functions deploy ingest-metrics --no-verify-jwt
supabase functions deploy external-probe --no-verify-jwt
```

---

### Bước 3: Cài đặt Agent (`run-agent.sh` & `monitor.py`) trên Máy chủ Linux ARM64 / TV Box

SSH vào máy chủ Linux ARM64 / TV Box và thực hiện tuần tự:

```bash
# 1. Tạo các thư mục chuẩn cho mã nguồn, cấu hình, trạng thái mạng và log
sudo mkdir -p /opt/server-monitor /etc/server-monitor /var/lib/server-monitor /var/log/server-monitor

# 2. Sao chép các file từ thư mục agent/ vào đúng vị trí hệ thống
sudo cp agent/run-agent.sh /opt/server-monitor/run-agent.sh
sudo cp agent/monitor.py /opt/server-monitor/monitor.py
sudo cp agent/agent.env.example /etc/server-monitor/agent.env

# 3. Phân quyền bảo mật nghiêm ngặt (chỉ root được đọc/thực thi)
sudo chown -R root:root /opt/server-monitor /etc/server-monitor /var/lib/server-monitor /var/log/server-monitor
sudo chmod 700 /opt/server-monitor/run-agent.sh /opt/server-monitor/monitor.py
sudo chmod 600 /etc/server-monitor/agent.env
```

Mở file `/etc/server-monitor/agent.env` (`sudo nano /etc/server-monitor/agent.env`) và điền các giá trị thực tế:
```dotenv
# Các đường dẫn & Systemd Unit liên quan đến Agent
MONITOR_RUN_SCRIPT="/opt/server-monitor/run-agent.sh"
MONITOR_SCRIPT_PATH="/opt/server-monitor/monitor.py"
MONITOR_ENV_FILE="/etc/server-monitor/agent.env"
MONITOR_LOG_DIR="/var/log/server-monitor"
MONITOR_LOG_FILE="/var/log/server-monitor/agent.log"
MONITOR_LOCK_FILE="/run/lock/server-monitor.lock"
MONITOR_SYSTEMD_SERVICE="server-monitor-agent.service"
MONITOR_SYSTEMD_TIMER="server-monitor-agent.timer"

# 1. Định danh thiết bị (Khớp với cột id trong bảng public.devices)
MONITOR_DEVICE_ID="arm64-tvbox-01"
MONITOR_DEVICE_NAME="ARM64 Server TV Box"
MONITOR_DEVICE_MODEL="Tanix TX3 Mini (Amlogic S905W)"

# 2. Đường dẫn file lưu trạng thái mạng (tự động tạo khi chạy)
MONITOR_STATE_FILE="/var/lib/server-monitor/net-state.json"

# 3. Danh sách các Container quan trọng cần theo dõi sát
MONITOR_CRITICAL_CONTAINERS="app-nginx,app-backend,app-mysql,app-nextjs,cloudflare-tunnel"

# 4. Mô tả vai trò mặc định của các Container
MONITOR_CONTAINER_ROLE="Docker Service"

# 5. Kết nối Supabase & Khóa xác thực thiết bị (Bản gốc Plain-text)
MONITOR_SUPABASE_URL="https://your-project-ref.supabase.co"
MONITOR_SUPABASE_ANON_KEY="your-public-anon-key-here"
MONITOR_DEVICE_TOKEN="your-plain-secret-token"
```

Kiểm tra chạy thử và bật lịch tự động 60 giây (`systemd timer`):
```bash
# 1. Chạy thử nghiệm in JSON ra màn hình (không gửi lên server) để kiểm tra thu thập thông số
sudo /usr/bin/python3 /opt/server-monitor/monitor.py --dry-run

# 2. Chạy thử qua wrapper script (sẽ nạp agent.env, gửi thật lên Supabase và tạo file agent.log + net-state.json)
sudo /opt/server-monitor/run-agent.sh

# 3. Kiểm tra xem file net-state.json và agent.log đã được tạo chưa
sudo cat /var/lib/server-monitor/net-state.json
sudo cat /var/log/server-monitor/agent.log

# 4. Cài đặt và kích hoạt Systemd Service + Timer tự động chạy mỗi 60 giây
sudo cp agent/systemd/server-monitor-agent.service /etc/systemd/system/
sudo cp agent/systemd/server-monitor-agent.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now server-monitor-agent.timer

# 5. Kiểm tra trạng thái bộ đếm Timer
sudo systemctl status server-monitor-agent.timer --no-pager
sudo systemctl list-timers --all server-monitor-agent.timer --no-pager
```

---

### Bước 4: Cấu hình và Chạy Giao diện Web Dashboard

1. Tạo file `.env` tại thư mục gốc của dự án từ file mẫu `.env.example`:
```bash
cp .env.example .env
```

2. Điền thông tin kết nối vào `.env`:
```dotenv
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_ANON_KEY="your-public-anon-key-here"
VITE_MONITOR_DEVICE_ID="arm64-tvbox-01"
VITE_ADMIN_EMAIL="admin@example.com"
```

3. Cài đặt thư viện và khởi chạy:
```bash
npm install
npm run dev
```
Mở trình duyệt tại `http://localhost:3000` và đăng nhập bằng tài khoản Admin đã tạo ở Bước 1.

---

## 6. Cách Kiểm tra & Chẩn đoán Sự cố (Troubleshooting)

| Triệu chứng | Nguyên nhân phổ biến | Cách kiểm tra & Khắc phục |
| :--- | :--- | :--- |
| **`agent.log` báo `ERROR agent environment file is unavailable`** | Chưa tạo file `/etc/server-monitor/agent.env` hoặc sai đường dẫn. | Kiểm tra bằng `ls -la /etc/server-monitor/agent.env` và đảm bảo quyền `chmod 600`. |
| **`agent.log` báo `HTTP error 401` hoặc `Unauthorized`** | `MONITOR_DEVICE_TOKEN` trong `agent.env` không khớp với mã băm `token_sha256` trong bảng `public.device_secrets`, hoặc sai `MONITOR_SUPABASE_ANON_KEY`. | Chạy lại lệnh SQL `INSERT INTO public.device_secrets ... ON CONFLICT DO UPDATE` với đúng chuỗi token trong `agent.env`. |
| **`agent.log` báo `ERROR agent timed out after 45 seconds`** | Docker daemon trên TV Box bị treo hoặc mạng kết nối đi Supabase bị đứt nghẽn. | Kiểm tra `docker ps` trên TV Box và thử `curl -I https://your-project-ref.supabase.co`. |
| **Tốc độ mạng (`net_rx_bytes_per_sec`) bằng `null` ở lần chạy đầu** | Hoàn toàn bình thường vì lần đầu mới tạo file `net-state.json`, chưa có mốc cũ để trừ. | Đợi chu kỳ 60 giây tiếp theo, `monitor.py` sẽ đọc `net-state.json` cũ và tính ra tốc độ `B/s`. |
| **Đăng nhập Web Dashboard thành công nhưng không thấy dữ liệu** | `User UID` của tài khoản đăng nhập chưa được thêm vào bảng `public.admin_users` hoặc `VITE_MONITOR_DEVICE_ID` khác với `MONITOR_DEVICE_ID`. | Kiểm tra bảng `public.admin_users` trên Supabase và đảm bảo `MONITOR_DEVICE_ID` ở cả 2 nơi giống hệt nhau. |
