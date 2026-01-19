import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MissingIntegrationsBadge from '../MissingIntegrationsBadge';

describe('MissingIntegrationsBadge', () => {
  it('renders nothing when there are no missing integrations', () => {
    const { container } = render(<MissingIntegrationsBadge missingIntegrations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('displays badge with missing integration count', () => {
    render(<MissingIntegrationsBadge missingIntegrations={['google', 'slack']} />);
    expect(screen.getByText('2 missing')).toBeInTheDocument();
  });

  it('displays singular text for one missing integration', () => {
    render(<MissingIntegrationsBadge missingIntegrations={['google']} />);
    expect(screen.getByText('1 missing')).toBeInTheDocument();
  });

  it('shows tooltip with missing integration details on hover', () => {
    render(<MissingIntegrationsBadge missingIntegrations={['google', 'slack']} />);

    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);

    expect(screen.getByText('This app requires setup:')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
  });

  it('hides tooltip when mouse leaves', () => {
    render(<MissingIntegrationsBadge missingIntegrations={['google']} />);

    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);
    expect(screen.getByText('This app requires setup:')).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    expect(screen.queryByText('This app requires setup:')).not.toBeInTheDocument();
  });

  it('shows link to settings integration page', () => {
    render(<MissingIntegrationsBadge missingIntegrations={['calendar']} />);

    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);

    const link = screen.getByRole('link', { name: /go to settings/i });
    expect(link).toHaveAttribute('href', '/settings/integrations');
  });

  it('displays correct integration labels', () => {
    render(<MissingIntegrationsBadge missingIntegrations={['google', 'slack', 'jira', 'docs']} />);

    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);

    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('Jira')).toBeInTheDocument();
    expect(screen.getByText('Google Docs')).toBeInTheDocument();
  });

  it('uses unmapped label for unknown integrations', () => {
    render(<MissingIntegrationsBadge missingIntegrations={['unknown-service']} />);

    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);

    expect(screen.getByText('unknown-service')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<MissingIntegrationsBadge missingIntegrations={['google', 'slack']} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', '2 missing integrations');
  });

  it('uses correct styling classes', () => {
    render(<MissingIntegrationsBadge missingIntegrations={['google']} />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-amber-100', 'text-amber-800');
  });
});
