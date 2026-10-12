'use client';

import { Component, type ReactNode } from 'react';
import { markChatBroken } from '@/lib/history';

interface ChatErrorBoundaryProps {
  chatId: string;
  onStartNew: () => void;
  children: ReactNode;
}

interface ChatErrorBoundaryState {
  failed: boolean;
}

// A class: React 19 still has no hook for catching render errors. A saved
// chat can pass the schema and still crash a card (an `output` without its
// fields). Without this the page would crash after every F5, because the
// active chat id is stored. Keyed by chat id in the frame, so a new chat
// starts with a clean boundary.
export class ChatErrorBoundary extends Component<ChatErrorBoundaryProps, ChatErrorBoundaryState> {
  state: ChatErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ChatErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch() {
    markChatBroken(this.props.chatId);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="text-[15px] text-on-surface-variant">This chat can&apos;t be shown.</p>
        <button
          type="button"
          onClick={this.props.onStartNew}
          className="rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          Start a new chat
        </button>
      </div>
    );
  }
}
