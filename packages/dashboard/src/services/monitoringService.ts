/**
 * Monitoring Service
 *
 * Collects real-time server metrics from the production server via SSH.
 * Supports CPU, memory, disk, and Docker container monitoring.
 * Sends alerts via Slack DM when thresholds are exceeded.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createServiceLogger } from '@orientbot/core';

const execAsync = promisify(exec);
const logger = createServiceLogger('monitoring');

// ============================================
// TYPES
// ============================================

export interface CpuMetrics {
  usagePercent: number;
  loadAverage: [number, number, number];
}

export interface MemoryMetrics {
  totalMB: number;
  usedMB: number;
  freeMB: number;
  usedPercent: number;
}

export interface DiskMetrics {
  path: string;
  totalGB: number;
  usedGB: number;
  availableGB: number;
  usedPercent: number;
}

export interface ContainerMetrics {
  name: string;
  status: 'running' | 'exited' | 'restarting' | 'paused' | 'unknown';
  cpuPercent: number;
  memoryUsage: string;
  memoryPercent: number;
}

export interface Alert {
  type: 'cpu' | 'memory' | 'disk' | 'container_down';
  severity: 'warning' | 'critical';
  value: number;
  threshold: number;
  message: string;
  timestamp: string;
  path?: string; // For disk alerts
  containerName?: string; // For container alerts
}

export interface ServerMetrics {
  timestamp: string;
  host: {
    cpu: CpuMetrics;
    memory: MemoryMetrics;
    disk: DiskMetrics[];
  };
  containers: ContainerMetrics[];
  alerts: Alert[];
}

export interface AlertThresholds {
  cpu: number; // Percentage (0-100)
  memory: number; // Percentage (0-100)
  disk: number; // Percentage (0-100)
}

export interface MonitoringConfig {
  sshHost?: string;
  sshUser?: string;
  sshKeyPath?: string;
  thresholds?: AlertThresholds;
  alertCooldownMs?: number; // Cooldown between same alert type
  enabled?: boolean;
}

/**
 * Slack notification interface for sending alerts
 */
export interface SlackNotifier {
  sendDM(email: string, message: string): Promise<void>;
}

// ============================================
// MONITORING SERVICE
// ============================================

export class MonitoringService {
  private sshHost: string;
  private sshUser: string;
  private sshKeyPath: string;
  private thresholds: AlertThresholds;
  private alertCooldownMs: number;
  private enabled: boolean;
  private slackNotifier: SlackNotifier | null = null;
  private alertUserEmail: string | null = null;
  private lastAlerts: Map<string, number> = new Map(); // Alert type -> last sent timestamp

  constructor(config: MonitoringConfig = {}) {
    this.sshHost = config.sshHost || process.env.SSH_HOST || process.env.OCI_HOST || '';
    this.sshUser = config.sshUser || process.env.OCI_USER || 'opc';
    this.sshKeyPath = config.sshKeyPath || process.env.SSH_KEY_PATH || '~/.ssh/id_rsa';
    this.thresholds = config.thresholds || {
      cpu: 80,
      memory: 85,
      disk: 90,
    };
    this.alertCooldownMs = config.alertCooldownMs || 5 * 60 * 1000; // 5 minutes
    this.enabled = config.enabled ?? process.env.MONITORING_ENABLED !== 'false';
    this.alertUserEmail = process.env.MONITORING_ALERT_USER_EMAIL || null;

    logger.info('Monitoring service initialized', {
      sshHost: this.sshHost,
      sshUser: this.sshUser,
      thresholds: this.thresholds,
      enabled: this.enabled,
    });
  }

  /**
   * Set the Slack notifier for sending alerts
   */
  setSlackNotifier(notifier: SlackNotifier, alertEmail?: string): void {
    this.slackNotifier = notifier;
    if (alertEmail) {
      this.alertUserEmail = alertEmail;
    }
    logger.info('Slack notifier configured', { alertEmail: this.alertUserEmail });
  }

  /**
   * Get current thresholds
   */
  getThresholds(): AlertThresholds {
    return { ...this.thresholds };
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<AlertThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.info('Thresholds updated', { thresholds: this.thresholds });
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Execute SSH command on production server
   */
  private async execSSH(command: string): Promise<string> {
    if (!this.sshHost) {
      throw new Error('SSH host is not configured. Set SSH_HOST or provide sshHost in config.');
    }
    const sshCommand = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i ${this.sshKeyPath} ${this.sshUser}@${this.sshHost} "${command}"`;

    try {
      const { stdout } = await execAsync(sshCommand, { timeout: 15000 });
      return stdout.trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('SSH command failed', { command, error: message });
      throw new Error(`SSH command failed: ${message}`);
    }
  }

  /**
   * Collect all server metrics
   */
  async collectMetrics(): Promise<ServerMetrics> {
    if (!this.enabled) {
      throw new Error('Monitoring is disabled');
    }

    logger.debug('Collecting server metrics');

    try {
      // Execute SSH commands in parallel for speed
      const [cpuMemOutput, diskOutput, containerStatsOutput, containerStatusOutput] =
        await Promise.all([
          this.execSSH('top -bn1 | head -5'),
          this.execSSH('df -h / /home 2>/dev/null || df -h /'),
          this.execSSH(
            "docker stats --no-stream --format '{{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.MemPerc}}' 2>/dev/null || echo ''"
          ),
          this.execSSH("docker ps -a --format '{{.Names}}\\t{{.Status}}' 2>/dev/null || echo ''"),
        ]);

      // Parse outputs
      const cpu = this.parseCpuMetrics(cpuMemOutput);
      const memory = this.parseMemoryMetrics(cpuMemOutput);
      const disk = this.parseDiskMetrics(diskOutput);
      const containers = this.parseContainerMetrics(containerStatsOutput, containerStatusOutput);

      // Build metrics object
      const metrics: ServerMetrics = {
        timestamp: new Date().toISOString(),
        host: { cpu, memory, disk },
        containers,
        alerts: [],
      };

      // Check thresholds and generate alerts
      metrics.alerts = this.checkThresholds(metrics);

      // Send alerts if any
      await this.sendAlerts(metrics.alerts);

      logger.debug('Metrics collected successfully', {
        cpu: cpu.usagePercent,
        memory: memory.usedPercent,
        containers: containers.length,
        alerts: metrics.alerts.length,
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to collect metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Parse CPU metrics from top output
   */
  private parseCpuMetrics(output: string): CpuMetrics {
    // Parse load average from first line
    // Format: top - 10:00:00 up 30 days, 2:15, 1 user, load average: 0.50, 0.60, 0.55
    const loadMatch = output.match(/load average:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    const loadAverage: [number, number, number] = loadMatch
      ? [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])]
      : [0, 0, 0];

    // Parse CPU usage from %Cpu(s) line
    // Format: %Cpu(s): 25.0 us, 5.0 sy, 0.0 ni, 70.0 id, 0.0 wa, 0.0 hi, 0.0 si, 0.0 st
    const cpuMatch = output.match(/%Cpu\(s\):\s*([\d.]+)\s*us,\s*([\d.]+)\s*sy/);
    const userCpu = cpuMatch ? parseFloat(cpuMatch[1]) : 0;
    const sysCpu = cpuMatch ? parseFloat(cpuMatch[2]) : 0;
    const usagePercent = Math.round((userCpu + sysCpu) * 10) / 10;

    return { usagePercent, loadAverage };
  }

  /**
   * Parse memory metrics from top output
   */
  private parseMemoryMetrics(output: string): MemoryMetrics {
    // Parse memory from MiB Mem line
    // Format: MiB Mem : 7856.0 total, 1000.0 free, 4000.0 used, 2856.0 buff/cache
    const memMatch = output.match(
      /MiB Mem\s*:\s*([\d.]+)\s*total,\s*([\d.]+)\s*free,\s*([\d.]+)\s*used/
    );

    if (memMatch) {
      const totalMB = parseFloat(memMatch[1]);
      const freeMB = parseFloat(memMatch[2]);
      const usedMB = parseFloat(memMatch[3]);
      const usedPercent = Math.round((usedMB / totalMB) * 1000) / 10;

      return { totalMB, usedMB, freeMB, usedPercent };
    }

    // Fallback: try KiB format
    const kibMatch = output.match(
      /KiB Mem\s*:\s*([\d.]+)\s*total,\s*([\d.]+)\s*free,\s*([\d.]+)\s*used/
    );

    if (kibMatch) {
      const totalMB = parseFloat(kibMatch[1]) / 1024;
      const freeMB = parseFloat(kibMatch[2]) / 1024;
      const usedMB = parseFloat(kibMatch[3]) / 1024;
      const usedPercent = Math.round((usedMB / totalMB) * 1000) / 10;

      return { totalMB, usedMB, freeMB, usedPercent };
    }

    return { totalMB: 0, usedMB: 0, freeMB: 0, usedPercent: 0 };
  }

  /**
   * Parse disk metrics from df output
   */
  private parseDiskMetrics(output: string): DiskMetrics[] {
    const lines = output.split('\n').filter((line) => line && !line.startsWith('Filesystem'));
    const metrics: DiskMetrics[] = [];

    for (const line of lines) {
      // Format: /dev/sda1 50G 25G 23G 52% /
      const parts = line.split(/\s+/);
      if (parts.length >= 6) {
        const path = parts[5];
        const totalStr = parts[1];
        const usedStr = parts[2];
        const availStr = parts[3];
        const usedPercentStr = parts[4];

        const parseSize = (str: string): number => {
          const match = str.match(/([\d.]+)([KMGT]?)/i);
          if (!match) return 0;
          const value = parseFloat(match[1]);
          const unit = match[2].toUpperCase();
          switch (unit) {
            case 'T':
              return value * 1024;
            case 'G':
              return value;
            case 'M':
              return value / 1024;
            case 'K':
              return value / (1024 * 1024);
            default:
              return value;
          }
        };

        metrics.push({
          path,
          totalGB: parseSize(totalStr),
          usedGB: parseSize(usedStr),
          availableGB: parseSize(availStr),
          usedPercent: parseInt(usedPercentStr) || 0,
        });
      }
    }

    return metrics;
  }

  /**
   * Parse container metrics from docker stats and docker ps output
   */
  private parseContainerMetrics(statsOutput: string, statusOutput: string): ContainerMetrics[] {
    const statusMap = new Map<string, string>();

    // Parse container status
    const statusLines = statusOutput.split('\n').filter((line) => line.trim());
    for (const line of statusLines) {
      const [name, ...statusParts] = line.split('\t');
      if (name) {
        statusMap.set(name, statusParts.join(' ').toLowerCase());
      }
    }

    // Parse container stats
    const metrics: ContainerMetrics[] = [];
    const statsLines = statsOutput.split('\n').filter((line) => line.trim());

    for (const line of statsLines) {
      const parts = line.split('\t');
      if (parts.length >= 4) {
        const name = parts[0];
        const cpuStr = parts[1].replace('%', '');
        const memUsage = parts[2];
        const memPercentStr = parts[3].replace('%', '');

        const statusStr = statusMap.get(name) || '';
        let status: ContainerMetrics['status'] = 'unknown';
        if (statusStr.includes('up')) status = 'running';
        else if (statusStr.includes('exited')) status = 'exited';
        else if (statusStr.includes('restarting')) status = 'restarting';
        else if (statusStr.includes('paused')) status = 'paused';

        metrics.push({
          name,
          status,
          cpuPercent: parseFloat(cpuStr) || 0,
          memoryUsage: memUsage,
          memoryPercent: parseFloat(memPercentStr) || 0,
        });
      }
    }

    // Add containers that have status but no stats (stopped containers)
    for (const [name, statusStr] of statusMap) {
      if (!metrics.find((m) => m.name === name)) {
        let status: ContainerMetrics['status'] = 'unknown';
        if (statusStr.includes('exited')) status = 'exited';
        else if (statusStr.includes('restarting')) status = 'restarting';

        metrics.push({
          name,
          status,
          cpuPercent: 0,
          memoryUsage: '0B / 0B',
          memoryPercent: 0,
        });
      }
    }

    return metrics;
  }

  /**
   * Check thresholds and generate alerts
   */
  private checkThresholds(metrics: ServerMetrics): Alert[] {
    const alerts: Alert[] = [];
    const now = new Date().toISOString();

    // CPU alert
    if (metrics.host.cpu.usagePercent >= this.thresholds.cpu) {
      const severity = metrics.host.cpu.usagePercent >= 95 ? 'critical' : 'warning';
      alerts.push({
        type: 'cpu',
        severity,
        value: metrics.host.cpu.usagePercent,
        threshold: this.thresholds.cpu,
        message: `CPU usage is ${metrics.host.cpu.usagePercent}% (threshold: ${this.thresholds.cpu}%)`,
        timestamp: now,
      });
    }

    // Memory alert
    if (metrics.host.memory.usedPercent >= this.thresholds.memory) {
      const severity = metrics.host.memory.usedPercent >= 95 ? 'critical' : 'warning';
      alerts.push({
        type: 'memory',
        severity,
        value: metrics.host.memory.usedPercent,
        threshold: this.thresholds.memory,
        message: `Memory usage is ${metrics.host.memory.usedPercent}% (threshold: ${this.thresholds.memory}%)`,
        timestamp: now,
      });
    }

    // Disk alerts
    for (const disk of metrics.host.disk) {
      if (disk.usedPercent >= this.thresholds.disk) {
        const severity = disk.usedPercent >= 95 ? 'critical' : 'warning';
        alerts.push({
          type: 'disk',
          severity,
          value: disk.usedPercent,
          threshold: this.thresholds.disk,
          message: `Disk usage on ${disk.path} is ${disk.usedPercent}% (threshold: ${this.thresholds.disk}%)`,
          timestamp: now,
          path: disk.path,
        });
      }
    }

    // Container alerts (stopped containers)
    for (const container of metrics.containers) {
      if (container.status === 'exited' || container.status === 'restarting') {
        alerts.push({
          type: 'container_down',
          severity: 'critical',
          value: 0,
          threshold: 0,
          message: `Container ${container.name} is ${container.status}`,
          timestamp: now,
          containerName: container.name,
        });
      }
    }

    return alerts;
  }

  /**
   * Send alerts via Slack DM
   */
  private async sendAlerts(alerts: Alert[]): Promise<void> {
    if (!this.slackNotifier || !this.alertUserEmail) {
      return;
    }

    const now = Date.now();

    for (const alert of alerts) {
      const alertKey = `${alert.type}:${alert.path || alert.containerName || 'host'}`;
      const lastSent = this.lastAlerts.get(alertKey) || 0;

      // Skip if within cooldown period
      if (now - lastSent < this.alertCooldownMs) {
        logger.debug('Alert skipped (cooldown)', { alertKey });
        continue;
      }

      try {
        const emoji = alert.severity === 'critical' ? ':rotating_light:' : ':warning:';
        const message =
          `${emoji} *Server Alert*\n\n` +
          `*Type:* ${alert.type.replace('_', ' ').toUpperCase()}\n` +
          `*Severity:* ${alert.severity.toUpperCase()}\n` +
          `*Message:* ${alert.message}\n` +
          `*Time:* ${alert.timestamp}`;

        await this.slackNotifier.sendDM(this.alertUserEmail, message);
        this.lastAlerts.set(alertKey, now);

        logger.info('Alert sent', { type: alert.type, severity: alert.severity });
      } catch (error) {
        logger.error('Failed to send alert', {
          type: alert.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Test SSH connection to production server
   */
  async testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const start = Date.now();

    try {
      const output = await this.execSSH('echo "connected"');
      const latencyMs = Date.now() - start;

      if (output.includes('connected')) {
        return {
          success: true,
          message: `Connected to ${this.sshHost}`,
          latencyMs,
        };
      }

      return {
        success: false,
        message: `Unexpected response: ${output}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Create a MonitoringService instance
 */
export function createMonitoringService(config?: MonitoringConfig): MonitoringService {
  return new MonitoringService(config);
}
