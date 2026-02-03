/**
 * Server Metrics Tool
 *
 * Gets real-time CPU, memory, disk, and container metrics from the production server.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { MCPTool } from '../base.js';
import type { ToolContext } from '../../types.js';

const execAsync = promisify(exec);

// Input schema
const ServerMetricsInput = z.object({
  includeContainers: z
    .boolean()
    .optional()
    .describe('Include per-container metrics (default: true)'),
});

type Input = z.infer<typeof ServerMetricsInput>;

// Output types
interface CpuMetrics {
  usagePercent: number;
  loadAverage: [number, number, number];
}

interface MemoryMetrics {
  totalMB: number;
  usedMB: number;
  freeMB: number;
  usedPercent: number;
}

interface DiskMetrics {
  path: string;
  totalGB: number;
  usedGB: number;
  availableGB: number;
  usedPercent: number;
}

interface ContainerMetrics {
  name: string;
  status: 'running' | 'exited' | 'restarting' | 'paused' | 'unknown';
  cpuPercent: number;
  memoryUsage: string;
  memoryPercent: number;
}

interface Alert {
  type: 'cpu' | 'memory' | 'disk' | 'container_down';
  severity: 'warning' | 'critical';
  message: string;
}

interface Output {
  timestamp: string;
  host: {
    cpu: CpuMetrics;
    memory: MemoryMetrics;
    disk: DiskMetrics[];
  };
  containers: ContainerMetrics[];
  alerts: Alert[];
  connectionStatus: 'connected' | 'failed';
  error?: string;
}

/**
 * Server Metrics Tool Implementation
 */
export class ServerMetricsTool extends MCPTool<Input, Output> {
  readonly name = 'system_server_metrics';
  readonly description =
    'Get real-time CPU, memory, disk, and container metrics from the production server.';
  readonly category = 'system' as const;
  readonly inputSchema = ServerMetricsInput;
  readonly keywords = [
    'metrics',
    'cpu',
    'memory',
    'disk',
    'server',
    'production',
    'monitoring',
    'container',
    'docker',
    'health',
    'performance',
  ];
  readonly useCases = [
    'Check production server health',
    'Monitor CPU and memory usage',
    'Check disk space on production',
    'View Docker container resource usage',
    'Investigate performance issues',
    'Get server metrics',
  ];
  readonly examples = [
    { description: 'Get all server metrics', input: {} },
    {
      description: 'Get server metrics without container details',
      input: { includeContainers: false },
    },
  ];

  private sshHost = process.env.SSH_HOST || process.env.OCI_HOST || '';
  private sshUser = process.env.OCI_USER || 'opc';
  private sshKeyPath = process.env.SSH_KEY_PATH || '~/.ssh/id_rsa';

  // Default thresholds for alerts
  private thresholds = {
    cpu: 80,
    memory: 85,
    disk: 90,
  };

  async execute(input: Input, _context: ToolContext): Promise<Output> {
    const includeContainers = input.includeContainers !== false;

    try {
      // Execute SSH commands in parallel for speed
      const commands = [
        this.execSSH('top -bn1 | head -5'),
        this.execSSH('df -h / /home 2>/dev/null || df -h /'),
      ];

      if (includeContainers) {
        commands.push(
          this.execSSH(
            "docker stats --no-stream --format '{{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.MemPerc}}' 2>/dev/null || echo ''"
          ),
          this.execSSH("docker ps -a --format '{{.Names}}\\t{{.Status}}' 2>/dev/null || echo ''")
        );
      }

      const results = await Promise.all(commands);
      const [cpuMemOutput, diskOutput, containerStatsOutput, containerStatusOutput] = results;

      // Parse outputs
      const cpu = this.parseCpuMetrics(cpuMemOutput);
      const memory = this.parseMemoryMetrics(cpuMemOutput);
      const disk = this.parseDiskMetrics(diskOutput);
      const containers = includeContainers
        ? this.parseContainerMetrics(containerStatsOutput || '', containerStatusOutput || '')
        : [];

      // Build metrics object
      const metrics: Output = {
        timestamp: new Date().toISOString(),
        host: { cpu, memory, disk },
        containers,
        alerts: [],
        connectionStatus: 'connected',
      };

      // Check thresholds and generate alerts
      metrics.alerts = this.checkThresholds(metrics);

      return metrics;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        timestamp: new Date().toISOString(),
        host: {
          cpu: { usagePercent: 0, loadAverage: [0, 0, 0] },
          memory: { totalMB: 0, usedMB: 0, freeMB: 0, usedPercent: 0 },
          disk: [],
        },
        containers: [],
        alerts: [],
        connectionStatus: 'failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Execute SSH command on production server
   */
  private async execSSH(command: string): Promise<string> {
    if (!this.sshHost) {
      throw new Error('SSH host is not configured. Set SSH_HOST to use server metrics.');
    }
    const sshCommand = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i ${this.sshKeyPath} ${this.sshUser}@${this.sshHost} "${command}"`;

    const { stdout } = await execAsync(sshCommand, { timeout: 15000 });
    return stdout.trim();
  }

  /**
   * Parse CPU metrics from top output
   */
  private parseCpuMetrics(output: string): CpuMetrics {
    const loadMatch = output.match(/load average:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    const loadAverage: [number, number, number] = loadMatch
      ? [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])]
      : [0, 0, 0];

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

    const statusLines = statusOutput.split('\n').filter((line) => line.trim());
    for (const line of statusLines) {
      const [name, ...statusParts] = line.split('\t');
      if (name) {
        statusMap.set(name, statusParts.join(' ').toLowerCase());
      }
    }

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
  private checkThresholds(metrics: Output): Alert[] {
    const alerts: Alert[] = [];

    if (metrics.host.cpu.usagePercent >= this.thresholds.cpu) {
      const severity = metrics.host.cpu.usagePercent >= 95 ? 'critical' : 'warning';
      alerts.push({
        type: 'cpu',
        severity,
        message: `CPU usage is ${metrics.host.cpu.usagePercent}% (threshold: ${this.thresholds.cpu}%)`,
      });
    }

    if (metrics.host.memory.usedPercent >= this.thresholds.memory) {
      const severity = metrics.host.memory.usedPercent >= 95 ? 'critical' : 'warning';
      alerts.push({
        type: 'memory',
        severity,
        message: `Memory usage is ${metrics.host.memory.usedPercent}% (threshold: ${this.thresholds.memory}%)`,
      });
    }

    for (const disk of metrics.host.disk) {
      if (disk.usedPercent >= this.thresholds.disk) {
        const severity = disk.usedPercent >= 95 ? 'critical' : 'warning';
        alerts.push({
          type: 'disk',
          severity,
          message: `Disk usage on ${disk.path} is ${disk.usedPercent}% (threshold: ${this.thresholds.disk}%)`,
        });
      }
    }

    for (const container of metrics.containers) {
      if (container.status === 'exited' || container.status === 'restarting') {
        alerts.push({
          type: 'container_down',
          severity: 'critical',
          message: `Container ${container.name} is ${container.status}`,
        });
      }
    }

    return alerts;
  }
}

// Export singleton instance
export const serverMetricsTool = new ServerMetricsTool();
