export type SystemHealthStatus =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'stale'
  | 'offline'
  | 'unknown';

export type ContainerRunState =
  | 'running'
  | 'exited'
  | 'restarting'
  | 'paused'
  | 'dead'
  | 'missing';

export type ContainerHealthState =
  | 'healthy'
  | 'unhealthy'
  | 'starting'
  | 'none';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export type SimulationScenarioId =
  | 'nominal'
  | 'warning'
  | 'critical'
  | 'stale'
  | 'offline'
  | 'sensor_na';

export type DataViewMode = 'populated' | 'loading' | 'empty' | 'error';

export interface ThermalZoneReading {
  zone: string;
  type: string;
  celsius: number | null;
}

export interface MountPointMetric {
  mount_point: string;
  device: string;
  fs_type: string;
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  used_percent: number;
  read_only: boolean;
  category: 'root' | 'docker' | 'database' | 'storage' | 'sd_card';
}

export interface DeviceInfo {
  id: string;
  name: string;
  hostname: string;
  kernel_version: string;
  architecture: string;
  cpu_model: string | null;
  cpu_cores: number;
  agent_version: string;
  enabled: boolean;
  last_seen_at: string | null;
  created_at: string;
  expected_containers: string[];
}

export interface SystemMetricRecord {
  id: number;
  device_id: string;
  idempotency_key: string;
  recorded_at: string;
  uptime_seconds: number | null;
  cpu_percent: number | null;
  cpu_iowait_percent: number | null;
  load_1: number | null;
  load_5: number | null;
  load_15: number | null;
  memory_total_bytes: number | null;
  memory_used_bytes: number | null;
  memory_available_bytes: number | null;
  memory_cached_bytes: number | null;
  memory_buffers_bytes: number | null;
  swap_total_bytes: number | null;
  swap_used_bytes: number | null;
  swap_in_pages: number | null;
  swap_out_pages: number | null;
  oom_kill_count: number | null;
  temperature_celsius: number | null;
  thermal_zones_json: ThermalZoneReading[] | null;
  root_disk_total_bytes: number | null;
  root_disk_used_bytes: number | null;
  root_disk_percent: number | null;
  mounts_json: MountPointMetric[] | null;
  net_rx_bytes_per_sec: number | null;
  net_tx_bytes_per_sec: number | null;
  net_errors_count: number | null;
}

export interface ContainerMetricRecord {
  id: number;
  device_id: string;
  recorded_at: string;
  container_name: string;
  container_id_short: string | null;
  image: string;
  role_description: string;
  is_critical_service: boolean;
  state: ContainerRunState;
  status_text: string;
  cpu_percent: number | null;
  memory_usage_bytes: number | null;
  memory_limit_bytes: number | null;
  memory_percent: number | null;
  restart_count: number;
  oom_killed: boolean;
  health_status: ContainerHealthState;
  exit_code: number | null;
  started_at: string | null;
}

export type ServiceTargetName =
  | 'nginx'
  | 'laravel_backend'
  | 'mariadb'
  | 'redis'
  | 'nextjs'
  | 'queue_worker'
  | 'cloudflare_tunnel'
  | 'phpmyadmin'
  | 'public_website'
  | 'public_api'
  | 'ingestion_endpoint';

export type ProbeErrorType =
  | 'NONE'
  | 'TIMEOUT'
  | 'DNS_ERROR'
  | 'TLS_ERROR'
  | 'NETWORK_ERROR'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'CONTAINER_STOPPED'
  | 'DEPENDENCY_FAILED'
  | 'OOM_TERMINATED';

export interface ServiceCheckRecord {
  id: number;
  device_id: string | null;
  source: 'agent_local' | 'external_probe';
  target_name: ServiceTargetName;
  display_name: string;
  endpoint_or_target: string;
  checked_at: string;
  status: SystemHealthStatus;
  container_running: boolean | null;
  app_responding: boolean | null;
  dependency_healthy: boolean | null;
  public_reachable: boolean | null;
  http_status: number | null;
  response_time_ms: number | null;
  error_code: ProbeErrorType;
  error_summary: string | null;
  verification_method: string;
}

export interface AlertEventRecord {
  id: string;
  alert_id: string;
  event_type:
    | 'opened'
    | 'escalated'
    | 'acknowledged'
    | 'resolved'
    | 'email_sent'
    | 'email_suppressed_cooldown'
    | 'email_failed';
  created_at: string;
  actor: string;
  summary: string;
}

export interface AlertRecord {
  id: string;
  device_id: string;
  rule_key: string;
  source: 'agent_metrics' | 'docker_engine' | 'external_uptime' | 'heartbeat_monitor';
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  observation: string;
  probable_cause: string;
  recommended_check: string;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  last_notified_at: string | null;
  notification_count: number;
  cooldown_minutes: number;
  events: AlertEventRecord[];
}

export interface MonitoringSettings {
  ram_available_warn_percent: number;
  ram_available_critical_percent: number;
  swap_used_warn_percent: number;
  cpu_warn_percent: number;
  cpu_critical_percent: number;
  temp_warn_celsius: number;
  temp_critical_celsius: number;
  disk_warn_percent: number;
  disk_critical_percent: number;
  heartbeat_stale_seconds: number;
  heartbeat_offline_seconds: number;
  consecutive_breaches_required: number;
  alert_cooldown_minutes: number;
  alert_recipient_emails: string[];
  email_provider: 'resend_api' | 'smtp_relay';
  default_chart_range: '1h' | '6h' | '24h' | '7d';
  raw_retention_days: number;
  hourly_rollup_retention_days: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  label: string;
  cpu_percent: number | null;
  memory_used_percent: number | null;
  memory_available_mb: number | null;
  swap_used_mb: number | null;
  temperature_celsius: number | null;
  load_1: number | null;
  web_response_ms: number | null;
  api_response_ms: number | null;
  net_rx_kbps: number | null;
  net_tx_kbps: number | null;
}

export interface MonitoringSnapshot {
  is_mock_data: boolean;
  scenario_id: SimulationScenarioId;
  scenario_label: string;
  scenario_description: string;
  fetched_at: string;
  device: DeviceInfo;
  latest_system: SystemMetricRecord | null;
  containers: ContainerMetricRecord[];
  service_checks: ServiceCheckRecord[];
  alerts: AlertRecord[];
  time_series: TimeSeriesPoint[];
  settings: MonitoringSettings;
}
