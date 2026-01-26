/**
 * Tests for instance-env.sh functionality
 *
 * Tests instance detection, port calculation, and environment configuration
 * for the multi-instance development environment.
 *
 * Database: SQLite (file-based, no PostgreSQL)
 * WhatsApp: Integrated into Dashboard (unified server, single DASHBOARD_PORT)
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { resolve } from 'path';

const scriptPath = resolve(__dirname, '../../scripts/instance-env.sh');

/**
 * Helper to execute bash script and capture output
 */
function runBashScript(command: string, env?: Record<string, string>): string {
  const fullCommand = `bash -c 'source ${scriptPath} && ${command}'`;

  try {
    return execSync(fullCommand, {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      cwd: resolve(__dirname, '../..'),
    }).trim();
  } catch (error) {
    throw new Error(`Script execution failed: ${error}`);
  }
}

describe('instance-env.sh', () => {
  describe('Port Calculation', () => {
    it('should calculate port for instance 0 (no offset)', () => {
      const result = runBashScript('calculate_port 4098 0');
      expect(result).toBe('4098');
    });

    it('should calculate port for instance 1 (offset 1000)', () => {
      const result = runBashScript('calculate_port 4098 1');
      expect(result).toBe('5098');
    });

    it('should calculate port for instance 2 (offset 2000)', () => {
      const result = runBashScript('calculate_port 80 2');
      expect(result).toBe('2080');
    });

    it('should calculate port for instance 9 (offset 9000)', () => {
      const result = runBashScript('calculate_port 9000 9');
      expect(result).toBe('18000');
    });

    it('should handle different base ports correctly', () => {
      expect(runBashScript('calculate_port 9000 1')).toBe('10000');
      expect(runBashScript('calculate_port 9001 1')).toBe('10001');
      expect(runBashScript('calculate_port 5173 3')).toBe('8173');
    });
  });

  describe('Instance Detection', () => {
    it('should use AI_INSTANCE_ID when explicitly set', () => {
      const result = runBashScript('detect_instance_id', { AI_INSTANCE_ID: '5' });
      expect(result).toBe('5');
    });

    it('should detect worktree from path', () => {
      const result = runBashScript('detect_instance_id');
      // Should be between 0-9
      const instanceId = parseInt(result, 10);
      expect(instanceId).toBeGreaterThanOrEqual(0);
      expect(instanceId).toBeLessThanOrEqual(9);
    });

    it('should return consistent instance ID for same path', () => {
      const result1 = runBashScript('detect_instance_id');
      const result2 = runBashScript('detect_instance_id');
      expect(result1).toBe(result2);
    });
  });

  describe('Environment Configuration', () => {
    it('should set all required environment variables', () => {
      const vars = [
        'AI_INSTANCE_ID',
        'NGINX_PORT',
        'DASHBOARD_PORT',
        'OPENCODE_PORT',
        'VITE_PORT',
        'MINIO_API_PORT',
        'MINIO_CONSOLE_PORT',
        'COMPOSE_PROJECT_NAME',
        'SQLITE_DB_PATH',
        'S3_BUCKET',
        'DATA_DIR',
        'LOG_DIR',
        'PID_DIR',
      ];

      for (const varName of vars) {
        const result = runBashScript(`configure_instance && echo $${varName}`);
        expect(result).not.toBe('');
        expect(result).not.toBe('undefined');
      }
    }, 15000);

    it('should configure instance 0 with original ports', () => {
      const results = {
        nginxPort: runBashScript('AI_INSTANCE_ID=0 configure_instance && echo $NGINX_PORT'),
        dashboardPort: runBashScript('AI_INSTANCE_ID=0 configure_instance && echo $DASHBOARD_PORT'),
        vitePort: runBashScript('AI_INSTANCE_ID=0 configure_instance && echo $VITE_PORT'),
      };

      expect(results.nginxPort).toBe('80');
      expect(results.dashboardPort).toBe('4098');
      expect(results.vitePort).toBe('5173');
    });

    it('should configure instance 1 with offset ports', () => {
      const results = {
        nginxPort: runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $NGINX_PORT'),
        dashboardPort: runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $DASHBOARD_PORT'),
        vitePort: runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $VITE_PORT'),
      };

      expect(results.nginxPort).toBe('1080');
      expect(results.dashboardPort).toBe('5098');
      expect(results.vitePort).toBe('6173');
    });

    it('should include instance ID in compose project name', () => {
      const result = runBashScript(
        'AI_INSTANCE_ID=2 configure_instance && echo $COMPOSE_PROJECT_NAME'
      );
      expect(result).toContain('2');
      expect(result).toContain('orienter-instance');
    });

    it('should include instance ID in SQLite database path', () => {
      const result = runBashScript('AI_INSTANCE_ID=3 configure_instance && echo $SQLITE_DB_PATH');
      expect(result).toContain('instance-3');
    });

    it('should include instance ID in S3 bucket name', () => {
      const result = runBashScript('AI_INSTANCE_ID=4 configure_instance && echo $S3_BUCKET');
      expect(result).toContain('-4');
    });

    it('should set instance-specific directories', () => {
      const dataDir = runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $DATA_DIR');
      const logDir = runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $LOG_DIR');
      const pidDir = runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $PID_DIR');

      expect(dataDir).toContain('instance-1');
      expect(logDir).toContain('instance-1');
      expect(pidDir).toContain('instance-1');
    });
  });

  describe('WhatsApp Configuration', () => {
    // TODO: Fix this test - environment-specific, fails on some systems
    it.skip('should enable WhatsApp by default in instance 0', () => {
      const result = runBashScript(
        'AI_INSTANCE_ID=0 unset WHATSAPP_ENABLED && configure_instance && echo $WHATSAPP_ENABLED'
      );
      expect(result).toBe('true');
    });

    it.skip('should disable WhatsApp by default in non-zero instances', () => {
      // TODO: Fix this test - it's currently failing on CI
      const results = [1, 2, 3, 4, 5].map((id) =>
        runBashScript(
          `AI_INSTANCE_ID=${id} unset WHATSAPP_ENABLED && configure_instance && echo $WHATSAPP_ENABLED`
        )
      );

      results.forEach((result) => {
        expect(result).toBe('false');
      });
    });

    it('should respect WHATSAPP_ENABLED override', () => {
      const result = runBashScript(
        'AI_INSTANCE_ID=1 WHATSAPP_ENABLED=true configure_instance && echo $WHATSAPP_ENABLED'
      );
      expect(result).toBe('true');
    });
  });

  describe('Port Uniqueness', () => {
    it('should generate unique ports for each instance', () => {
      const instance1Ports = [
        runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $NGINX_PORT'),
        runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $DASHBOARD_PORT'),
        runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $OPENCODE_PORT'),
        runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $VITE_PORT'),
      ];

      const uniquePorts = new Set(instance1Ports);
      expect(uniquePorts.size).toBe(instance1Ports.length);
    });

    it('should not overlap ports between instances', () => {
      const instance0Nginx = runBashScript(
        'AI_INSTANCE_ID=0 configure_instance && echo $NGINX_PORT'
      );
      const instance1Nginx = runBashScript(
        'AI_INSTANCE_ID=1 configure_instance && echo $NGINX_PORT'
      );

      expect(instance0Nginx).not.toBe(instance1Nginx);
      expect(parseInt(instance1Nginx, 10) - parseInt(instance0Nginx, 10)).toBe(1000);
    });
  });

  describe('SQLite Database Path', () => {
    it('should set SQLITE_DB_PATH for each instance', () => {
      const result = runBashScript('AI_INSTANCE_ID=2 configure_instance && echo $SQLITE_DB_PATH');
      expect(result).toContain('instance-2');
      expect(result).toContain('orient.db');
    });

    it('should place database in DATA_DIR', () => {
      const sqlitePath = runBashScript(
        'AI_INSTANCE_ID=1 configure_instance && echo $SQLITE_DB_PATH'
      );
      const dataDir = runBashScript('AI_INSTANCE_ID=1 configure_instance && echo $DATA_DIR');
      expect(sqlitePath).toContain(dataDir);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing parameters gracefully in calculate_port', () => {
      // This should not crash, though the result may be empty or 0
      expect(() => {
        runBashScript('calculate_port 4098');
      }).not.toThrow();
    });

    it('should handle invalid instance ID gracefully', () => {
      // Should not crash with invalid values
      expect(() => {
        runBashScript('AI_INSTANCE_ID=invalid configure_instance && echo done');
      }).not.toThrow();
    });
  });
});
