import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppsTab from '../AppsTab';

// Mock the API module
vi.mock('../../api', () => ({
  assetUrl: (path: string) => path,
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('AppsTab - Integration Display Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockClear();
  });

  it('loads active integrations on component mount', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/integrations/active')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ integrations: ['google', 'slack'] }),
        });
      }
      if (url.includes('/api/apps')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ apps: [] }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<AppsTab />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/integrations/active')
      );
    });
  });

  it('displays missing integrations badge for apps with missing integrations', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/integrations/active')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ integrations: ['google'] }),
        });
      }
      if (url.includes('/api/apps')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              apps: [
                {
                  name: 'test-app',
                  title: 'Test App',
                  description: 'A test app',
                  version: '1.0.0',
                  status: 'draft',
                  isBuilt: true,
                  permissions: {
                    google: { read: true, write: false },
                    slack: { read: true, write: true },
                  },
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<AppsTab />);

    await waitFor(() => {
      expect(screen.getByText('1 missing')).toBeInTheDocument();
    });
  });

  it('does not display badge for apps with no missing integrations', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/integrations/active')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ integrations: ['google', 'slack'] }),
        });
      }
      if (url.includes('/api/apps')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              apps: [
                {
                  name: 'test-app',
                  title: 'Test App',
                  description: 'A test app',
                  version: '1.0.0',
                  status: 'draft',
                  isBuilt: true,
                  permissions: {
                    google: { read: true, write: false },
                    slack: { read: true, write: true },
                  },
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<AppsTab />);

    await waitFor(() => {
      const badges = screen.queryAllByText(/\d+ missing/);
      expect(badges).toHaveLength(0);
    });
  });

  it('displays badge with all missing integrations count', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/integrations/active')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ integrations: [] }),
        });
      }
      if (url.includes('/api/apps')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              apps: [
                {
                  name: 'test-app',
                  title: 'Test App',
                  description: 'A test app',
                  version: '1.0.0',
                  status: 'draft',
                  isBuilt: true,
                  permissions: {
                    google: { read: true, write: false },
                    slack: { read: true, write: true },
                    jira: { read: false, write: true },
                  },
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<AppsTab />);

    await waitFor(() => {
      expect(screen.getByText('3 missing')).toBeInTheDocument();
    });
  });

  it('handles apps without permissions gracefully', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/integrations/active')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ integrations: ['google'] }),
        });
      }
      if (url.includes('/api/apps')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              apps: [
                {
                  name: 'test-app',
                  title: 'Test App',
                  description: 'A test app',
                  version: '1.0.0',
                  status: 'draft',
                  isBuilt: true,
                  // No permissions field
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<AppsTab />);

    await waitFor(() => {
      // Should not show any missing integrations badge
      const badges = screen.queryAllByText(/\d+ missing/);
      expect(badges).toHaveLength(0);
    });
  });

  it('displays integrations column in table header', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/integrations/active')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ integrations: [] }),
        });
      }
      if (url.includes('/api/apps')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              apps: [
                {
                  name: 'test-app',
                  title: 'Test App',
                  description: 'A test app',
                  version: '1.0.0',
                  status: 'published',
                  isBuilt: true,
                  permissions: {},
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<AppsTab />);

    await waitFor(() => {
      expect(screen.getByText('Integrations')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully when loading integrations', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/integrations/active')) {
        return Promise.resolve({ ok: false });
      }
      if (url.includes('/api/apps')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ apps: [] }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<AppsTab />);

    // Component should still render without crashing
    await waitFor(() => {
      expect(screen.getByText('Mini-Apps')).toBeInTheDocument();
    });
  });

  it('tooltip shows correct integration names when hovering over badge', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/integrations/active')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ integrations: ['google'] }),
        });
      }
      if (url.includes('/api/apps')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              apps: [
                {
                  name: 'test-app',
                  title: 'Test App',
                  description: 'A test app',
                  version: '1.0.0',
                  status: 'draft',
                  isBuilt: true,
                  permissions: {
                    slack: { read: true, write: true },
                    jira: { read: false, write: true },
                  },
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(<AppsTab />);

    await waitFor(() => {
      expect(screen.getByText('2 missing')).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: /2 missing/ });
    fireEvent.mouseEnter(button);

    await waitFor(() => {
      expect(screen.getByText('Slack')).toBeInTheDocument();
      expect(screen.getByText('Jira')).toBeInTheDocument();
    });
  });
});
