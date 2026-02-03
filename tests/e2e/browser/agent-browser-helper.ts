/**
 * Agent Browser Helper
 *
 * Wrapper for agent-browser CLI to make it easier to use in Vitest E2E tests.
 * Provides a clean API for browser automation using the agent-browser CLI.
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const SCRATCHPAD_DIR = path.join(__dirname, '../../../.e2e-scratchpad');

export interface SnapshotElement {
  type: string;
  name?: string;
  ref: string;
  text?: string;
  checked?: boolean;
  expanded?: boolean;
  level?: number;
  url?: string;
}

export interface AgentBrowserOptions {
  session?: string;
  profile?: string;
  headed?: boolean;
  timeout?: number;
}

/**
 * Execute an agent-browser command and return the output
 */
export function execAgentBrowser(command: string, options: AgentBrowserOptions = {}): string {
  const args: string[] = [];

  if (options.session) {
    args.push('--session', options.session);
  }
  if (options.profile) {
    args.push('--profile', options.profile);
  }
  if (options.headed) {
    args.push('--headed');
  }

  const fullCommand = `agent-browser ${args.join(' ')} ${command}`.trim();
  const timeout = options.timeout || 30000;

  try {
    const result = execSync(fullCommand, {
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (error: unknown) {
    const execError = error as { stderr?: string; stdout?: string; message?: string };
    const stderr = execError.stderr || '';
    const stdout = execError.stdout || '';
    throw new Error(
      `agent-browser command failed: ${fullCommand}\n` +
        `stdout: ${stdout}\n` +
        `stderr: ${stderr}\n` +
        `error: ${execError.message || error}`
    );
  }
}

/**
 * Browser automation client for E2E tests
 */
export class AgentBrowser {
  private options: AgentBrowserOptions;
  private isOpen = false;

  constructor(options: AgentBrowserOptions = {}) {
    this.options = {
      session: options.session || `e2e-${Date.now()}`,
      timeout: options.timeout || 30000,
      ...options,
    };

    // Ensure scratchpad directory exists
    if (!fs.existsSync(SCRATCHPAD_DIR)) {
      fs.mkdirSync(SCRATCHPAD_DIR, { recursive: true });
    }
  }

  private exec(command: string): string {
    return execAgentBrowser(command, this.options);
  }

  /**
   * Navigate to a URL
   */
  async open(url: string): Promise<void> {
    this.exec(`open ${url}`);
    this.isOpen = true;
  }

  /**
   * Get the current URL
   */
  async getUrl(): Promise<string> {
    return this.exec('get url');
  }

  /**
   * Get the page title
   */
  async getTitle(): Promise<string> {
    return this.exec('get title');
  }

  /**
   * Get accessibility snapshot of the page
   * @param interactive - Only return interactive elements
   */
  async snapshot(interactive = false): Promise<string> {
    const flag = interactive ? '-i' : '';
    return this.exec(`snapshot ${flag}`);
  }

  /**
   * Get interactive elements only
   */
  async getInteractiveElements(): Promise<string> {
    return this.snapshot(true);
  }

  /**
   * Click an element by ref or selector
   */
  async click(selector: string): Promise<void> {
    this.exec(`click ${selector}`);
  }

  /**
   * Fill an input field
   */
  async fill(selector: string, text: string): Promise<void> {
    this.exec(`fill ${selector} "${text.replace(/"/g, '\\"')}"`);
  }

  /**
   * Type text (without clearing first)
   */
  async type(selector: string, text: string): Promise<void> {
    this.exec(`type ${selector} "${text.replace(/"/g, '\\"')}"`);
  }

  /**
   * Press a key
   */
  async press(key: string): Promise<void> {
    this.exec(`press ${key}`);
  }

  /**
   * Check a checkbox
   */
  async check(selector: string): Promise<void> {
    this.exec(`check ${selector}`);
  }

  /**
   * Uncheck a checkbox
   */
  async uncheck(selector: string): Promise<void> {
    this.exec(`uncheck ${selector}`);
  }

  /**
   * Get text content of an element
   */
  async getText(selector: string): Promise<string> {
    return this.exec(`get text ${selector}`);
  }

  /**
   * Get HTML of an element
   */
  async getHtml(selector: string): Promise<string> {
    return this.exec(`get html ${selector}`);
  }

  /**
   * Get value of a form element
   */
  async getValue(selector: string): Promise<string> {
    return this.exec(`get value ${selector}`);
  }

  /**
   * Check if element is visible
   */
  async isVisible(selector: string): Promise<boolean> {
    try {
      const result = this.exec(`is visible ${selector}`);
      return result.toLowerCase() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Check if element is enabled
   */
  async isEnabled(selector: string): Promise<boolean> {
    try {
      const result = this.exec(`is enabled ${selector}`);
      return result.toLowerCase() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Wait for an element or time
   * @param selectorOrMs - CSS selector or milliseconds to wait
   */
  async wait(selectorOrMs: string | number): Promise<void> {
    this.exec(`wait ${selectorOrMs}`);
  }

  /**
   * Take a screenshot
   * @param name - Filename (without extension)
   * @param fullPage - Capture full page
   */
  async screenshot(name: string, fullPage = false): Promise<string> {
    const filename = path.join(SCRATCHPAD_DIR, `${name}.png`);
    const flag = fullPage ? '--full' : '';
    this.exec(`screenshot ${flag} ${filename}`);
    return filename;
  }

  /**
   * Scroll the page
   * @param direction - up, down, left, right
   * @param pixels - Number of pixels
   */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', pixels?: number): Promise<void> {
    this.exec(`scroll ${direction}${pixels ? ` ${pixels}` : ''}`);
  }

  /**
   * Scroll element into view
   */
  async scrollIntoView(selector: string): Promise<void> {
    this.exec(`scrollintoview ${selector}`);
  }

  /**
   * Execute JavaScript in the page
   */
  async evaluate(js: string): Promise<string> {
    return this.exec(`eval "${js.replace(/"/g, '\\"')}"`);
  }

  /**
   * Go back in history
   */
  async back(): Promise<void> {
    this.exec('back');
  }

  /**
   * Go forward in history
   */
  async forward(): Promise<void> {
    this.exec('forward');
  }

  /**
   * Reload the page
   */
  async reload(): Promise<void> {
    this.exec('reload');
  }

  /**
   * Get console logs
   */
  async getConsoleLogs(): Promise<string> {
    return this.exec('console');
  }

  /**
   * Get page errors
   */
  async getErrors(): Promise<string> {
    return this.exec('errors');
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.isOpen) {
      try {
        this.exec('close');
      } catch {
        // Ignore close errors
      }
      this.isOpen = false;
    }
  }

  /**
   * Parse snapshot output into structured elements
   */
  parseSnapshot(snapshot: string): SnapshotElement[] {
    const elements: SnapshotElement[] = [];
    const lines = snapshot.split('\n');

    for (const line of lines) {
      const refMatch = line.match(/\[ref=(\w+)\]/);
      if (!refMatch) continue;

      const ref = refMatch[1];
      const typeMatch = line.match(/- (\w+)/);
      const type = typeMatch ? typeMatch[1] : 'unknown';
      const nameMatch = line.match(/"([^"]+)"/);
      const name = nameMatch ? nameMatch[1] : undefined;
      const checkedMatch = line.match(/\[checked\]/);
      const expandedMatch = line.match(/\[expanded\]/);
      const levelMatch = line.match(/\[level=(\d+)\]/);

      elements.push({
        type,
        name,
        ref,
        checked: !!checkedMatch,
        expanded: !!expandedMatch,
        level: levelMatch ? parseInt(levelMatch[1], 10) : undefined,
      });
    }

    return elements;
  }

  /**
   * Find element by name in snapshot
   */
  findByName(snapshot: string, name: string): SnapshotElement | undefined {
    const elements = this.parseSnapshot(snapshot);
    return elements.find((el) => el.name?.toLowerCase().includes(name.toLowerCase()));
  }

  /**
   * Find elements by type in snapshot
   */
  findByType(snapshot: string, type: string): SnapshotElement[] {
    const elements = this.parseSnapshot(snapshot);
    return elements.filter((el) => el.type.toLowerCase() === type.toLowerCase());
  }
}

/**
 * Create a new AgentBrowser instance
 */
export function createBrowser(options?: AgentBrowserOptions): AgentBrowser {
  return new AgentBrowser(options);
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout = 10000,
  interval = 500
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Cleanup scratchpad directory
 */
export function cleanupScratchpad(): void {
  if (fs.existsSync(SCRATCHPAD_DIR)) {
    fs.rmSync(SCRATCHPAD_DIR, { recursive: true, force: true });
  }
}
