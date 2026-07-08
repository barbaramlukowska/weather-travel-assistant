import { AlertCircle, Clock } from 'lucide-react';
import { RATE_LIMIT_MESSAGE } from '@/lib/errors';

export function EmptyState() {
  return (
    <div className="mt-10 text-center text-on-surface-variant/60">
      <p className="text-lg font-medium">Where are we exploring today?</p>
      <p className="mt-1 text-sm">
        Ask about the weather, air pollution anywhere — try “What&apos;s the weather in Kraków?”
      </p>
    </div>
  );
}

export function ThinkingIndicator() {
  return (
    <div className="assistant-glass flex w-fit items-center gap-2 rounded-full border border-outline-variant/40 px-5 py-3.5 text-on-surface-variant/50">
      <div className="typing-dot" />
      <div className="typing-dot" />
      <div className="typing-dot" />
    </div>
  );
}

// The message comes from the server (see toClientErrorMessage); fall back to a
// generic line if it was masked or missing.
interface ErrorBannerProps {
  onRetry: () => void;
  message?: string;
}

export function ErrorBanner({ onRetry, message }: ErrorBannerProps) {
  // The daily-quota case can't be retried until the limit resets, so we show a
  // calmer "come back later" icon and hide the retry action for it.
  const isRateLimit = message === RATE_LIMIT_MESSAGE;
  const text =
    message && message !== 'An error occurred.'
      ? message
      : 'Something went wrong on our end. Please try again in a moment.';
  const Icon = isRateLimit ? Clock : AlertCircle;

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-error/10 bg-status-error-bg px-5 py-3.5 text-status-error-text">
      <div className="flex items-start gap-3">
        <Icon size={18} className="mt-0.5 shrink-0 text-error" />
        <p className="text-[13px] font-medium">{text}</p>
      </div>
      {!isRateLimit && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-[13px] font-semibold text-error hover:opacity-70"
        >
          Try again
        </button>
      )}
    </div>
  );
}
