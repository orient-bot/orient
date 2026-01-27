import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// TODO: Re-enable when apps tools are migrated to @orientbot/mcp-tools
// These tools are currently stubs - see packages/mcp-tools/src/tools/apps/index.ts
// import type { ToolContext } from '@orientbot/mcp-tools';
// import { createAppTool, getAppTool, listAppsTool, updateAppTool, shareAppTool } from '@orientbot/mcp-tools';

const baseContext = { config: {}, correlationId: 'test' } as any;

describe.skip('apps tools (pending migration)', () => {
  beforeEach(() => {
    process.env.APPS_BASE_URL = 'https://apps.example.com';
  });

  afterEach(() => {
    delete process.env.APPS_BASE_URL;
  });

  it('creates an app via app generator', async () => {
    const context = {
      ...baseContext,
      appGenerator: {
        generateApp: vi.fn().mockResolvedValue({
          manifest: {
            name: 'demo-app',
            title: 'Demo App',
            description: 'Demo description',
          },
          componentCode: '<App />',
          explanation: 'Generated',
        }),
      },
    } as ToolContext;

    const result = await createAppTool.execute(
      { prompt: 'Create a simple demo app for testing', name: 'demo-app' },
      context
    );

    expect(result.success).toBe(true);
    expect(result.appName).toBe('demo-app');
    expect(result.previewUrl).toContain('/preview/demo-app');
  });

  it('gets app details', async () => {
    const context = {
      ...baseContext,
      appsService: {
        getApp: () => ({
          manifest: {
            name: 'demo-app',
            title: 'Demo App',
            description: 'Demo description',
            version: '1.0.0',
            author: 'me',
            permissions: { slack: { read: true, write: false } },
            capabilities: { scheduler: { enabled: true, max_jobs: 3 } },
            sharing: { mode: 'link', expires_after_days: 7 },
          },
          status: 'published',
          isBuilt: true,
          path: '/tmp/demo-app',
        }),
      },
    } as ToolContext;

    const result = await getAppTool.execute({ name: 'demo-app' }, context);
    expect(result.found).toBe(true);
    expect(result.app?.name).toBe('demo-app');
  });

  it('lists apps with filtering and limits', async () => {
    const context = {
      ...baseContext,
      appsService: {
        listApps: () => [
          {
            name: 'a',
            title: 'A',
            description: 'A',
            version: '1',
            status: 'published',
            isBuilt: true,
            author: 'x',
          },
          {
            name: 'b',
            title: 'B',
            description: 'B',
            version: '1',
            status: 'draft',
            isBuilt: false,
            author: 'y',
          },
        ],
      },
    } as ToolContext;

    const result = await listAppsTool.execute({ status: 'published', limit: 1 }, context);
    expect(result.total).toBe(1);
    expect(result.apps[0]?.name).toBe('a');
  });

  it('updates an app with generator output', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-'));
    fs.writeFileSync(path.join(tempDir, 'App.tsx'), 'export default function App() {}');

    const context = {
      ...baseContext,
      appsService: {
        getApp: () => ({
          manifest: {
            name: 'demo-app',
            title: 'Demo App',
            description: 'Demo',
            version: '1.0.0',
          },
          srcPath: tempDir,
        }),
      },
      appGenerator: {
        updateApp: vi.fn().mockResolvedValue({
          manifest: {
            name: 'demo-app',
            title: 'Demo App',
            description: 'Demo',
            version: '1.0.1',
          },
          componentCode: '<Updated />',
          explanation: 'Updated',
        }),
      },
    } as ToolContext;

    const result = await updateAppTool.execute(
      { name: 'demo-app', updateRequest: 'Add a new button' },
      context
    );

    expect(result.success).toBe(true);
    expect(result.version).toBe('1.0.1');
  });

  it('shares an app and returns a link', async () => {
    const context = {
      ...baseContext,
      appsService: {
        getApp: () => ({
          manifest: {
            name: 'demo-app',
            title: 'Demo App',
          },
        }),
      },
    } as ToolContext;

    const result = await shareAppTool.execute({ name: 'demo-app', expiryDays: 5 }, context);

    expect(result.success).toBe(true);
    expect(result.shareUrl).toContain('/a/demo-app/');
    expect(result.expiryDays).toBe(5);
  });
});
