/**
 * agent-browser Test Helper
 *
 * Wraps agent-browser CLI commands for use in Vitest E2E tests.
 * Provides a clean API for browser automation testing.
 */

import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

// Configuration
const DEFAULT_TIMEOUT = 30000;
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../.dev-data/e2e-screenshots');

export interface AgentBrowserOptions {
  session?: string;
  timeout?: number;
  headed?: boolean;
}

export interface SnapshotElement {
  type: string;
  ref: string;
  text?: string;
  role?: string;
  level?: number;
  checked?: boolean;
  expanded?: boolean;
}

/**
 * Execute an agent-browser command
 */
async function runCommand(command: string, options: AgentBrowserOptions = {}): Promise<string> {
  const { session = 'e2e-test', timeout = DEFAULT_TIMEOUT, headed = false } = options;

  const sessionArg = `--session ${session}`;
  const headedArg = headed ? '--headed' : '';
  const fullCommand = `agent-browser ${sessionArg} ${headedArg} ${command}`.trim();

  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      timeout,
      encoding: 'utf-8',
    });
    return stdout.trim();
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    // Some commands exit with non-zero but still have useful output
    if (err.stdout) {
      return err.stdout.trim();
    }
    throw new Error(`agent-browser command failed: ${err.message || error}`);
  }
}

/**
 * AgentBrowser class for fluent browser automation
 */
export class AgentBrowser {
  private session: string;
  private options: AgentBrowserOptions;

  constructor(options: AgentBrowserOptions = {}) {
    this.session = options.session || `e2e-${Date.now()}`;
    this.options = { ...options, session: this.session };
  }

  /**
   * Navigate to a URL
   */
  async open(url: string): Promise<void> {
    await runCommand(`open ${url}`, this.options);
  }

  /**
   * Get current URL
   */
  async getUrl(): Promise<string> {
    return runCommand('get url', this.options);
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return runCommand('get title', this.options);
  }

  /**
   * Get interactive elements snapshot
   */
  async snapshot(interactive = true): Promise<string> {
    const flag = interactive ? '-i' : '';
    return runCommand(`snapshot ${flag}`, this.options);
  }

  /**
   * Parse snapshot into structured elements
   */
  async getElements(interactive = true): Promise<SnapshotElement[]> {
    const raw = await this.snapshot(interactive);
    const elements: SnapshotElement[] = [];

    for (const line of raw.split('\n')) {
      // Match patterns like: - textbox "Username" [ref=e1]
      // or: - button "Sign In" [ref=e3]
      const match = line.match(/- (\w+)\s+"([^"]*)"\s+\[ref=(\w+)\]/);
      if (match) {
        elements.push({
          type: match[1],
          text: match[2],
          ref: match[3],
        });
      }
    }

    return elements;
  }

  /**
   * Click an element by ref
   */
  async click(ref: string): Promise<void> {
    await runCommand(`click @${ref}`, this.options);
  }

  /**
   * Fill a form field
   */
  async fill(ref: string, value: string): Promise<void> {
    await runCommand(`fill @${ref} "${value}"`, this.options);
  }

  /**
   * Type text (without clearing)
   */
  async type(ref: string, value: string): Promise<void> {
    await runCommand(`type @${ref} "${value}"`, this.options);
  }

  /**
   * Press a key
   */
  async press(key: string): Promise<void> {
    await runCommand(`press ${key}`, this.options);
  }

  /**
   * Check a checkbox
   */
  async check(ref: string): Promise<void> {
    await runCommand(`check @${ref}`, this.options);
  }

  /**
   * Uncheck a checkbox
   */
  async uncheck(ref: string): Promise<void> {
    await runCommand(`uncheck @${ref}`, this.options);
  }

  /**
   * Get text content of an element
   */
  async getText(ref: string): Promise<string> {
    return runCommand(`get text @${ref}`, this.options);
  }

  /**
   * Get element value
   */
  async getValue(ref: string): Promise<string> {
    return runCommand(`get value @${ref}`, this.options);
  }

  /**
   * Wait for element or time
   */
  async wait(selectorOrMs: string | number): Promise<void> {
    await runCommand(`wait ${selectorOrMs}`, this.options);
  }

  /**
   * Take a screenshot
   */
  async screenshot(name?: string): Promise<string> {
    // Ensure screenshot directory exists
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    const filename = name || `screenshot-${Date.now()}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await runCommand(`screenshot ${filepath}`, this.options);
    return filepath;
  }

  /**
   * Take a full page screenshot
   */
  async screenshotFull(name?: string): Promise<string> {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    const filename = name || `screenshot-full-${Date.now()}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await runCommand(`screenshot --full ${filepath}`, this.options);
    return filepath;
  }

  /**
   * Execute JavaScript in page context
   */
  async eval(js: string): Promise<string> {
    return runCommand(`eval "${js.replace(/"/g, '\\"')}"`, this.options);
  }

  /**
   * Go back in history
   */
  async back(): Promise<void> {
    await runCommand('back', this.options);
  }

  /**
   * Go forward in history
   */
  async forward(): Promise<void> {
    await runCommand('forward', this.options);
  }

  /**
   * Reload page
   */
  async reload(): Promise<void> {
    await runCommand('reload', this.options);
  }

  /**
   * Scroll in a direction
   */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', pixels?: number): Promise<void> {
    const px = pixels ? ` ${pixels}` : '';
    await runCommand(`scroll ${direction}${px}`, this.options);
  }

  /**
   * Check if element is visible
   */
  async isVisible(ref: string): Promise<boolean> {
    try {
      const result = await runCommand(`is visible @${ref}`, this.options);
      return result.toLowerCase().includes('true');
    } catch {
      return false;
    }
  }

  /**
   * Check if element is enabled
   */
  async isEnabled(ref: string): Promise<boolean> {
    try {
      const result = await runCommand(`is enabled @${ref}`, this.options);
      return result.toLowerCase().includes('true');
    } catch {
      return false;
    }
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    try {
      await runCommand('close', this.options);
    } catch {
      // Ignore errors on close
    }
  }
}

/**
 * Create a new AgentBrowser instance
 */
export function createBrowser(options?: AgentBrowserOptions): AgentBrowser {
  return new AgentBrowser(options);
}

/**
 * Get the base URL for the Orient dashboard
 */
export function getDashboardUrl(): string {
  return process.env.DASHBOARD_URL || 'http://localhost:5173';
}

/**
 * Get the API URL for the Orient dashboard
 */
export function getApiUrl(): string {
  return process.env.API_URL || 'http://localhost:4098';
}
