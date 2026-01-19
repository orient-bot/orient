/**
 * Tests for IntegrationCredentialModal Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntegrationCredentialModal } from '../src/components/IntegrationCredentialModal';
import type { IntegrationManifest, AuthMethod } from '../src/api';

// Mock the API module
vi.mock('../src/api', () => ({
  saveIntegrationCredentials: vi.fn(),
}));

import { saveIntegrationCredentials } from '../src/api';

const mockSaveCredentials = saveIntegrationCredentials as ReturnType<typeof vi.fn>;

describe('IntegrationCredentialModal', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnCredentialsSaved = vi.fn();
  const mockOnError = vi.fn();
  const mockOnSuccess = vi.fn();

  const baseManifest: IntegrationManifest = {
    name: 'test-integration',
    title: 'Test Integration',
    description: 'A test integration',
    version: '1.0.0',
    status: 'stable',
    oauth: { type: 'oauth2' },
    requiredSecrets: [
      { name: 'CLIENT_ID', description: 'The client ID', required: true },
      { name: 'CLIENT_SECRET', description: 'The client secret', required: true },
    ],
    tools: [],
  };

  const baseIntegration = {
    manifest: baseManifest,
    secretsConfigured: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when open is false', () => {
    render(
      <IntegrationCredentialModal
        open={false}
        onOpenChange={mockOnOpenChange}
        integration={baseIntegration}
        onCredentialsSaved={mockOnCredentialsSaved}
      />
    );

    expect(screen.queryByText('Configure Test Integration')).not.toBeInTheDocument();
  });

  it('should not render when integration is null', () => {
    render(
      <IntegrationCredentialModal
        open={true}
        onOpenChange={mockOnOpenChange}
        integration={null}
        onCredentialsSaved={mockOnCredentialsSaved}
      />
    );

    expect(screen.queryByText('Configure')).not.toBeInTheDocument();
  });

  it('should render modal with integration title when open', () => {
    render(
      <IntegrationCredentialModal
        open={true}
        onOpenChange={mockOnOpenChange}
        integration={baseIntegration}
        onCredentialsSaved={mockOnCredentialsSaved}
      />
    );

    expect(screen.getByText('Configure Test Integration')).toBeInTheDocument();
  });

  it('should render required secret fields', () => {
    render(
      <IntegrationCredentialModal
        open={true}
        onOpenChange={mockOnOpenChange}
        integration={baseIntegration}
        onCredentialsSaved={mockOnCredentialsSaved}
      />
    );

    expect(screen.getByLabelText('CLIENT_ID')).toBeInTheDocument();
    expect(screen.getByLabelText('CLIENT_SECRET')).toBeInTheDocument();
  });

  it('should disable submit button when form is incomplete', () => {
    render(
      <IntegrationCredentialModal
        open={true}
        onOpenChange={mockOnOpenChange}
        integration={baseIntegration}
        onCredentialsSaved={mockOnCredentialsSaved}
      />
    );

    const submitButton = screen.getByText('Save & Connect');
    expect(submitButton).toBeDisabled();
  });

  it('should enable submit button when all fields are filled', () => {
    render(
      <IntegrationCredentialModal
        open={true}
        onOpenChange={mockOnOpenChange}
        integration={baseIntegration}
        onCredentialsSaved={mockOnCredentialsSaved}
      />
    );

    fireEvent.change(screen.getByLabelText('CLIENT_ID'), {
      target: { value: 'test-client-id' },
    });
    fireEvent.change(screen.getByLabelText('CLIENT_SECRET'), {
      target: { value: 'test-client-secret' },
    });

    const submitButton = screen.getByText('Save & Connect');
    expect(submitButton).not.toBeDisabled();
  });

  it('should call onOpenChange when cancel is clicked', () => {
    render(
      <IntegrationCredentialModal
        open={true}
        onOpenChange={mockOnOpenChange}
        integration={baseIntegration}
        onCredentialsSaved={mockOnCredentialsSaved}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should submit credentials and call callbacks on success', async () => {
    mockSaveCredentials.mockResolvedValue({ success: true, secretsConfigured: true });

    render(
      <IntegrationCredentialModal
        open={true}
        onOpenChange={mockOnOpenChange}
        integration={baseIntegration}
        onCredentialsSaved={mockOnCredentialsSaved}
        onSuccess={mockOnSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText('CLIENT_ID'), {
      target: { value: 'test-client-id' },
    });
    fireEvent.change(screen.getByLabelText('CLIENT_SECRET'), {
      target: { value: 'test-client-secret' },
    });

    fireEvent.click(screen.getByText('Save & Connect'));

    await waitFor(() => {
      expect(mockSaveCredentials).toHaveBeenCalledWith(
        'test-integration',
        {
          CLIENT_ID: 'test-client-id',
          CLIENT_SECRET: 'test-client-secret',
        },
        undefined
      );
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalledWith('Credentials saved successfully');
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      expect(mockOnCredentialsSaved).toHaveBeenCalled();
    });
  });

  it('should display error message on save failure', async () => {
    mockSaveCredentials.mockResolvedValue({
      success: false,
      secretsConfigured: false,
      message: 'Invalid credentials',
    });

    render(
      <IntegrationCredentialModal
        open={true}
        onOpenChange={mockOnOpenChange}
        integration={baseIntegration}
        onCredentialsSaved={mockOnCredentialsSaved}
        onError={mockOnError}
      />
    );

    fireEvent.change(screen.getByLabelText('CLIENT_ID'), {
      target: { value: 'test-client-id' },
    });
    fireEvent.change(screen.getByLabelText('CLIENT_SECRET'), {
      target: { value: 'test-client-secret' },
    });

    fireEvent.click(screen.getByText('Save & Connect'));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    expect(mockOnError).toHaveBeenCalledWith('Invalid credentials');
  });

  it('should handle network errors gracefully', async () => {
    mockSaveCredentials.mockRejectedValue(new Error('Network error'));

    render(
      <IntegrationCredentialModal
        open={true}
        onOpenChange={mockOnOpenChange}
        integration={baseIntegration}
        onCredentialsSaved={mockOnCredentialsSaved}
        onError={mockOnError}
      />
    );

    fireEvent.change(screen.getByLabelText('CLIENT_ID'), {
      target: { value: 'test-client-id' },
    });
    fireEvent.change(screen.getByLabelText('CLIENT_SECRET'), {
      target: { value: 'test-client-secret' },
    });

    fireEvent.click(screen.getByText('Save & Connect'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(mockOnError).toHaveBeenCalledWith('Network error');
  });

  describe('with dual auth methods', () => {
    const dualAuthManifest: IntegrationManifest = {
      name: 'dual-auth-integration',
      title: 'Dual Auth Integration',
      description: 'Integration with multiple auth methods',
      version: '1.0.0',
      status: 'stable',
      oauth: { type: 'oauth2' },
      authMethods: [
        {
          type: 'api_token',
          name: 'API Token',
          description: 'Use API token authentication',
          requiredFields: ['API_TOKEN'],
        },
        {
          type: 'oauth2',
          name: 'OAuth 2.0',
          description: 'Use OAuth 2.0 authentication',
          requiredFields: ['CLIENT_ID', 'CLIENT_SECRET'],
        },
      ],
      requiredSecrets: [
        { name: 'API_TOKEN', description: 'API Token', required: true, authMethod: 'api_token' },
        { name: 'CLIENT_ID', description: 'Client ID', required: true, authMethod: 'oauth2' },
        {
          name: 'CLIENT_SECRET',
          description: 'Client Secret',
          required: true,
          authMethod: 'oauth2',
        },
      ],
      tools: [],
    };

    const dualAuthIntegration = {
      manifest: dualAuthManifest,
      secretsConfigured: false,
    };

    it('should render auth method tabs when multiple methods available', () => {
      render(
        <IntegrationCredentialModal
          open={true}
          onOpenChange={mockOnOpenChange}
          integration={dualAuthIntegration}
          onCredentialsSaved={mockOnCredentialsSaved}
        />
      );

      // Find the tab buttons by role
      const tabButtons = screen
        .getAllByRole('button')
        .filter(
          (btn) => btn.textContent?.includes('API Token') || btn.textContent?.includes('OAuth 2.0')
        );
      expect(tabButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('should show correct fields for selected auth method', () => {
      render(
        <IntegrationCredentialModal
          open={true}
          onOpenChange={mockOnOpenChange}
          integration={dualAuthIntegration}
          onCredentialsSaved={mockOnCredentialsSaved}
        />
      );

      // Default should be first auth method (api_token)
      expect(screen.getByLabelText('API_TOKEN')).toBeInTheDocument();
      expect(screen.queryByLabelText('CLIENT_ID')).not.toBeInTheDocument();
    });

    it('should switch fields when auth method is changed', () => {
      render(
        <IntegrationCredentialModal
          open={true}
          onOpenChange={mockOnOpenChange}
          integration={dualAuthIntegration}
          onCredentialsSaved={mockOnCredentialsSaved}
        />
      );

      // Click OAuth 2.0 tab
      fireEvent.click(screen.getByText('OAuth 2.0'));

      // Now OAuth fields should be visible
      expect(screen.getByLabelText('CLIENT_ID')).toBeInTheDocument();
      expect(screen.getByLabelText('CLIENT_SECRET')).toBeInTheDocument();
      expect(screen.queryByLabelText('API_TOKEN')).not.toBeInTheDocument();
    });

    it('should pass selected auth method when saving', async () => {
      mockSaveCredentials.mockResolvedValue({ success: true, secretsConfigured: true });

      render(
        <IntegrationCredentialModal
          open={true}
          onOpenChange={mockOnOpenChange}
          integration={dualAuthIntegration}
          onCredentialsSaved={mockOnCredentialsSaved}
        />
      );

      // Fill API token field (default auth method)
      fireEvent.change(screen.getByLabelText('API_TOKEN'), {
        target: { value: 'test-api-token' },
      });

      fireEvent.click(screen.getByText('Save & Connect'));

      await waitFor(() => {
        expect(mockSaveCredentials).toHaveBeenCalledWith(
          'dual-auth-integration',
          { API_TOKEN: 'test-api-token' },
          'api_token'
        );
      });
    });
  });

  describe('password field visibility', () => {
    it('should hide password fields by default', () => {
      render(
        <IntegrationCredentialModal
          open={true}
          onOpenChange={mockOnOpenChange}
          integration={baseIntegration}
          onCredentialsSaved={mockOnCredentialsSaved}
        />
      );

      const secretField = screen.getByLabelText('CLIENT_SECRET');
      expect(secretField).toHaveAttribute('type', 'password');
    });

    it('should toggle password visibility when eye icon is clicked', () => {
      render(
        <IntegrationCredentialModal
          open={true}
          onOpenChange={mockOnOpenChange}
          integration={baseIntegration}
          onCredentialsSaved={mockOnCredentialsSaved}
        />
      );

      const secretField = screen.getByLabelText('CLIENT_SECRET');
      expect(secretField).toHaveAttribute('type', 'password');

      // Find and click the toggle button (it's a button with Eye icon near the input)
      const toggleButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.className.includes('absolute'));

      if (toggleButtons.length > 0) {
        fireEvent.click(toggleButtons[0]);
        // After clicking, the type should change to 'text'
        expect(secretField).toHaveAttribute('type', 'text');
      }
    });
  });
});
