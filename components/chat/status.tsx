import { AlertCircle } from 'lucide-react';

// Shown before the first message is sent.
export function EmptyState() {
  return (
    <div className="mt-10 text-center text-on-surface-variant/60">
      <p className="text-lg font-medium">Where are we exploring today?</p>
      <p className="mt-1 text-sm">
        Ask about the weather anywhere — try “What&apos;s the weather in Kraków?”
      </p>
    </div>
  );
}

// Animated dots shown after the request is sent, before the first token.
export function ThinkingIndicator() {
  return (
    <div className="assistant-glass flex w-fit items-center gap-2 rounded-full border border-outline-variant/40 px-5 py-3.5 text-on-surface-variant/50">
      <div className="typing-dot" />
      <div className="typing-dot" />
      <div className="typing-dot" />
    </div>
  );
}

// Technical error banner with a retry button.
interface ErrorBannerProps {
  onRetry: () => void;
}

export function ErrorBanner({ onRetry }: ErrorBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-error/10 bg-status-error-bg px-5 py-3.5 text-status-error-text">
      <div className="flex items-center gap-3">
        <AlertCircle size={18} className="text-error" />
        <p className="text-[13px] font-medium">Something went wrong.</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="text-[13px] font-semibold text-error hover:opacity-70"
      >
        Try again
      </button>
    </div>
  );
}
