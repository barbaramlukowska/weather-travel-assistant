import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_MESSAGE } from '@/lib/errors';
import { ErrorBanner } from './status';

describe('ErrorBanner', () => {
  it('shows the route\'s "error" field, not the raw response body', () => {
    render(<ErrorBanner error={new Error('{"error":"Too many requests — please slow down."}')} onRetry={vi.fn()} />);
    expect(screen.getByText('Too many requests — please slow down.')).toBeInTheDocument();
    expect(screen.queryByText(/"error"/)).not.toBeInTheDocument();
  });

  it('replaces the masked server error with a friendly line and offers a retry', () => {
    render(<ErrorBanner error={new Error('An error occurred.')} onRetry={vi.fn()} />);
    expect(screen.getByText(/Something went wrong on our end/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers no retry for the daily quota', () => {
    render(<ErrorBanner error={new Error(RATE_LIMIT_MESSAGE)} onRetry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
