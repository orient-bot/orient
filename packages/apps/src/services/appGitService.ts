/**
 * App Git Service
 *
 * Manages git operations for Mini-Apps.
 * Creates worktrees for app development, commits changes,
 * and creates PRs for app approval.
 *
 * Follows the same pattern as GitWorktreeService but for apps.
 *
 * Exported via @orientbot/apps package.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createServiceLogger } from '@orientbot/core';
import { AppManifest, serializeManifestToYaml } from '../types.js';

const execAsync = promisify(exec);
const logger = createServiceLogger('app-git');

// ============================================
// TYPES
// ============================================

export interface AppWorktreeResult {
  /** Path to the worktree directory */
  worktreePath: string;
  /** Name of the branch created */
  branchName: string;
  /** Path to the app directory within the worktree */
  appPath: string;
  /** Cleanup function to remove worktree when done */
  cleanup: () => Promise<void>;
}

export interface AppFileResult {
  /** Path to the APP.yaml file */
  manifestPath: string;
  /** Path to the app directory */
  appDirPath: string;
  /** Path to the src directory */
  srcPath: string;
}

export interface AppGitConfig {
  /** Base directory for worktrees (default: $HOME/app-worktrees) */
  worktreeBase?: string;
  /** Path to the main repository */
  repoPath: string;
  /** Remote name (default: origin) */
  remoteName?: string;
  /** Base branch to create feature branches from (default: main) */
  baseBranch?: string;
  /** Path to apps directory within the repo (default: apps) */
  appsPath?: string;
}

// ============================================
// APP GIT SERVICE
// ============================================

export class AppGitService {
  private config: Required<AppGitConfig>;

  constructor(config: AppGitConfig) {
    this.config = {
      worktreeBase: config.worktreeBase || path.join(os.homedir(), 'app-worktrees'),
      repoPath: config.repoPath,
      remoteName: config.remoteName || 'origin',
      baseBranch: config.baseBranch || 'main',
      appsPath: config.appsPath || 'apps',
    };

    // Ensure worktree base directory exists
    if (!fs.existsSync(this.config.worktreeBase)) {
      fs.mkdirSync(this.config.worktreeBase, { recursive: true });
      logger.info('Created app worktree base directory', { path: this.config.worktreeBase });
    }
  }

  /**
   * Create an isolated worktree for app development
   * @param appName - Name of the app (used in branch name)
   * @returns AppWorktreeResult with paths and cleanup function
   */
  async createWorktree(appName: string): Promise<AppWorktreeResult> {
    const op = logger.startOperation('createAppWorktree', { appName });

    try {
      // Generate unique branch name with app/ prefix
      const timestamp = Date.now();
      const sanitizedName = appName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const branchName = `app/${sanitizedName}-${timestamp}`;
      const worktreePath = path.join(this.config.worktreeBase, `${sanitizedName}-${timestamp}`);
      const appPath = path.join(worktreePath, this.config.appsPath, sanitizedName);

      // Fetch latest from remote to ensure we have up-to-date refs
      logger.debug('Fetching latest from remote');
      await execAsync(`git fetch ${this.config.remoteName}`, { cwd: this.config.repoPath });

      // Create the worktree with a new branch based on latest main
      logger.debug('Creating worktree', { worktreePath, branchName });
      await execAsync(
        `git worktree add -b "${branchName}" "${worktreePath}" "${this.config.remoteName}/${this.config.baseBranch}"`,
        { cwd: this.config.repoPath }
      );

      // Create cleanup function
      const cleanup = async (): Promise<void> => {
        await this.removeWorktree(worktreePath, branchName);
      };

      op.success('App worktree created', { worktreePath, branchName, appPath });

      return {
        worktreePath,
        branchName,
        appPath,
        cleanup,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Write app files to the worktree
   * @param worktreePath - Path to the worktree
   * @param appName - Name of the app
   * @param manifest - App manifest
   * @param sourceFiles - Map of relative path to content
   * @returns AppFileResult with paths
   */
  async writeAppFiles(
    worktreePath: string,
    appName: string,
    manifest: AppManifest,
    sourceFiles: Map<string, string>
  ): Promise<AppFileResult> {
    const op = logger.startOperation('writeAppFiles', { appName });

    try {
      const sanitizedName = appName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const appDirPath = path.join(worktreePath, this.config.appsPath, sanitizedName);
      const srcPath = path.join(appDirPath, 'src');
      const manifestPath = path.join(appDirPath, 'APP.yaml');

      // Create directories
      fs.mkdirSync(srcPath, { recursive: true });

      // Write APP.yaml manifest
      const manifestYaml = serializeManifestToYaml(manifest);
      fs.writeFileSync(manifestPath, manifestYaml, 'utf-8');
      logger.debug('Wrote manifest', { manifestPath });

      // Write source files
      for (const [relativePath, content] of sourceFiles) {
        const filePath = path.join(appDirPath, relativePath);
        const dirPath = path.dirname(filePath);

        fs.mkdirSync(dirPath, { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
        logger.debug('Wrote file', { filePath });
      }

      op.success('App files written', { appDirPath, filesCount: sourceFiles.size });

      return {
        manifestPath,
        appDirPath,
        srcPath,
      };
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Write the complete app scaffold
   * Creates all necessary files for a buildable app
   */
  async scaffoldApp(
    worktreePath: string,
    appName: string,
    manifest: AppManifest,
    appComponent: string
  ): Promise<AppFileResult> {
    const sourceFiles = new Map<string, string>();

    // Main App component
    sourceFiles.set('src/App.tsx', appComponent);

    // Entry point
    sourceFiles.set(
      'src/main.tsx',
      `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`
    );

    // CSS with design system variables
    sourceFiles.set(
      'src/index.css',
      `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
  --radius: 0.5rem;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  --ring: 240 4.9% 83.9%;
}

* {
  border-color: hsl(var(--border));
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: Inter, system-ui, -apple-system, sans-serif;
}
`
    );

    // HTML template
    sourceFiles.set(
      'index.html',
      `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${manifest.title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
    );

    // Package.json
    sourceFiles.set(
      'package.json',
      JSON.stringify(
        {
          name: manifest.name,
          private: true,
          version: manifest.version,
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'tsc && vite build',
            preview: 'vite preview',
          },
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
            zod: '^4.1.13',
          },
          devDependencies: {
            '@types/react': '^18.2.43',
            '@types/react-dom': '^18.2.17',
            '@vitejs/plugin-react': '^4.2.1',
            autoprefixer: '^10.4.16',
            postcss: '^8.4.32',
            tailwindcss: '^3.4.0',
            typescript: '^5.3.3',
            vite: '^5.0.10',
          },
        },
        null,
        2
      )
    );

    // Vite config
    sourceFiles.set(
      'vite.config.ts',
      `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../_shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
`
    );

    // Tailwind config
    sourceFiles.set(
      'tailwind.config.js',
      `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../_shared/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
`
    );

    // PostCSS config
    sourceFiles.set(
      'postcss.config.js',
      `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`
    );

    // TypeScript config
    sourceFiles.set(
      'tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            useDefineForClassFields: true,
            lib: ['ES2020', 'DOM', 'DOM.Iterable'],
            module: 'ESNext',
            skipLibCheck: true,
            moduleResolution: 'bundler',
            allowImportingTsExtensions: true,
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: 'react-jsx',
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noFallthroughCasesInSwitch: true,
            paths: {
              '@shared/*': ['../_shared/*'],
            },
          },
          include: ['src', '../_shared'],
          references: [{ path: './tsconfig.node.json' }],
        },
        null,
        2
      )
    );

    // TypeScript node config
    sourceFiles.set(
      'tsconfig.node.json',
      JSON.stringify(
        {
          compilerOptions: {
            composite: true,
            skipLibCheck: true,
            module: 'ESNext',
            moduleResolution: 'bundler',
            allowSyntheticDefaultImports: true,
            strict: true,
          },
          include: ['vite.config.ts'],
        },
        null,
        2
      )
    );

    return this.writeAppFiles(worktreePath, appName, manifest, sourceFiles);
  }

  /**
   * Commit changes in the worktree
   */
  async commit(worktreePath: string, message: string): Promise<string> {
    const op = logger.startOperation('commitApp', { worktreePath });

    try {
      // Stage all changes
      await execAsync('git add -A', { cwd: worktreePath });

      // Check if there are changes to commit
      const { stdout: status } = await execAsync('git status --porcelain', { cwd: worktreePath });
      if (!status.trim()) {
        throw new Error('No changes to commit');
      }

      // Commit
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
        cwd: worktreePath,
      });

      // Get commit hash
      const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: worktreePath });
      const commitHash = hash.trim();

      op.success('App changes committed', { commitHash });

      return commitHash;
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Push the branch to remote
   */
  async push(worktreePath: string, branchName: string): Promise<void> {
    const op = logger.startOperation('pushApp', { branchName });

    try {
      await execAsync(`git push -u ${this.config.remoteName} ${branchName}`, {
        cwd: worktreePath,
      });

      op.success('App branch pushed to remote');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
      throw error;
    }
  }

  /**
   * Commit and push changes
   */
  async commitAndPush(worktreePath: string, branchName: string, message: string): Promise<string> {
    const commitHash = await this.commit(worktreePath, message);
    await this.push(worktreePath, branchName);
    return commitHash;
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(worktreePath: string, branchName?: string): Promise<void> {
    const op = logger.startOperation('removeAppWorktree', { worktreePath });

    try {
      if (fs.existsSync(worktreePath)) {
        await execAsync(`git worktree remove "${worktreePath}" --force`, {
          cwd: this.config.repoPath,
        });
        logger.debug('App worktree removed', { worktreePath });
      }

      if (branchName) {
        try {
          await execAsync(`git branch -D "${branchName}"`, {
            cwd: this.config.repoPath,
          });
          logger.debug('Local app branch deleted', { branchName });
        } catch {
          logger.debug('Could not delete local app branch (may not exist)', { branchName });
        }
      }

      op.success('App worktree cleanup complete');
    } catch (error) {
      op.failure(error instanceof Error ? error : String(error));
    }
  }

  /**
   * List all active app worktrees
   */
  async listWorktrees(): Promise<Array<{ path: string; branch: string; appName: string }>> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: this.config.repoPath,
      });

      const worktrees: Array<{ path: string; branch: string; appName: string }> = [];
      const lines = stdout.split('\n');

      let currentPath = '';
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentPath = line.substring(9);
        } else if (line.startsWith('branch ')) {
          const branch = line.substring(7);
          // Only include app/ branches
          if (currentPath && branch.startsWith('refs/heads/app/')) {
            const branchName = branch.replace('refs/heads/', '');
            // Extract app name from branch (e.g., "app/meeting-scheduler-123456" -> "meeting-scheduler")
            const match = branchName.match(/^app\/([a-z0-9-]+)-\d+$/);
            const appName = match ? match[1] : branchName.replace('app/', '');

            worktrees.push({
              path: currentPath,
              branch: branchName,
              appName,
            });
          }
          currentPath = '';
        }
      }

      return worktrees;
    } catch (error) {
      logger.error('Failed to list app worktrees', { error });
      return [];
    }
  }

  /**
   * Generate a PR description for an app
   */
  generateAppPRDescription(manifest: AppManifest, isUpdate: boolean = false): string {
    const action = isUpdate ? 'Update' : 'Add';
    const permissionsList = Object.entries(manifest.permissions)
      .filter(([key, val]) => key !== 'tools' && val && typeof val === 'object')
      .map(([key, val]) => {
        const perm = val as { read: boolean; write: boolean };
        const access = [];
        if (perm.read) access.push('read');
        if (perm.write) access.push('write');
        return `- ${key}: ${access.join(', ') || 'none'}`;
      })
      .join('\n');

    const capabilitiesList = [];
    if (manifest.capabilities.scheduler?.enabled) {
      capabilitiesList.push(`- Scheduler (max ${manifest.capabilities.scheduler.max_jobs} jobs)`);
    }
    if (manifest.capabilities.webhooks?.enabled) {
      capabilitiesList.push(
        `- Webhooks (${manifest.capabilities.webhooks.endpoints?.length || 0} endpoints)`
      );
    }

    return `## ${action} App: ${manifest.title}

### Description
${manifest.description}

### Permissions
${permissionsList || '- None requested'}

### Capabilities
${capabilitiesList.join('\n') || '- None'}

### Sharing Mode
- Mode: \`${manifest.sharing.mode}\`
${manifest.sharing.expires_after_days ? `- Expires after: ${manifest.sharing.expires_after_days} days` : ''}
${manifest.sharing.max_uses ? `- Max uses: ${manifest.sharing.max_uses}` : ''}

### Checklist
- [ ] App follows design system
- [ ] Permissions are minimal and justified
- [ ] App has been tested locally

---
*This PR was created automatically by the Orient*
`;
  }
}

/**
 * Create an AppGitService instance
 */
export function createAppGitService(config: AppGitConfig): AppGitService {
  return new AppGitService(config);
}
