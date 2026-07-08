'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import type { ChatUIMessage } from './types';
import { ChatHeader } from './chat-header';
import { Composer } from './composer';
import { MessageItem } from './message-item';
import { EmptyState, ErrorBanner, ThinkingIndicator } from './status';
import { useTheme } from './use-theme';

export function Chat() {
  const [input, setInput] = useState('');
  // Typed messages: part types like 'tool-getWeather' now carry the real
  // input/output types from lib/tools.ts all the way into MessageItem.
  const { messages, sendMessage, status, stop, error, regenerate } =
    useChat<ChatUIMessage>();
  const isBusy = status === 'submitted' || status === 'streaming';
  const { isDark, toggleTheme } = useTheme();

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div className="flex h-dvh flex-col">
      <ChatHeader isDark={isDark} onToggleTheme={toggleTheme} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8">
          {messages.length === 0 && <EmptyState />}

          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}

          {status === 'submitted' && <ThinkingIndicator />}

          {error && (
            <ErrorBanner message={error.message} onRetry={() => regenerate()} />
          )}

          <div ref={endRef} />
        </div>
      </main>

      <Composer
        input={input}
        isBusy={isBusy}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onStop={() => stop()}
      />
    </div>
  );
}
