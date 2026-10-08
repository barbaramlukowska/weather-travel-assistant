'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { clearMemory, countSavedItems, readMemory, removeFact } from '@/lib/memory';
import type { ChatUIMessage } from './types';
import { ChatHeader } from './chat-header';
import { runForget, runRemember, shouldAutoSend } from './client-tools';
import { Composer } from './composer';
import { MessageItem } from './message-item';
import { EmptyState, ErrorBanner, ThinkingIndicator } from './status';
import { MemoryPanel } from './memory-panel';
import { useMemory } from './use-memory';
import { useTheme } from './use-theme';

// Created once, outside the component: useChat keeps its transport for the
// chat's lifetime. `body` is a function, so memory is read at send time —
// including the automatic re-send after remember — never frozen at mount.
const transport = new DefaultChatTransport<ChatUIMessage>({
  api: '/api/chat',
  body: () => ({ memory: readMemory() }),
});

export function Chat() {
  const [input, setInput] = useState('');
  const stoppedRef = useRef(false);
  // Typed messages: part types like 'tool-getWeather' now carry the real
  // input/output types from lib/tools.ts all the way into MessageItem.
  const { messages, sendMessage, status, stop, error, regenerate, addToolOutput } =
    useChat<ChatUIMessage>({
      transport,
      // remember/forget have no server-side execute: the server stream ends
      // on the call, onToolCall writes localStorage, and this posts the
      // result back so the model can reply — a second request per such turn.
      // After Stop, a still-awaited geocoder call resolves later and calls
      // addToolOutput, which would trigger a paid request the user cancelled.
      // The ref is read at call time (useChat options are captured once).
      sendAutomaticallyWhen: (options) => !stoppedRef.current && shouldAutoSend(options),
      async onToolCall({ toolCall }) {
        // Must come first, or toolCall.toolName does not narrow (AI SDK
        // docs, "Chatbot Tool Usage").
        if (toolCall.dynamic) return;
        const { toolCallId } = toolCall;

        // runRemember IS awaited: a city waits for the geocoder, and the
        // result must exist before it can be posted. addToolOutput is NOT
        // awaited: awaiting it inside onToolCall can deadlock the stream
        // that is still delivering this call.
        if (toolCall.toolName === 'remember') {
          const result = await runRemember(toolCall.input);
          if (result.ok) {
            addToolOutput({ tool: 'remember', toolCallId, output: result.output });
          } else {
            addToolOutput({
              tool: 'remember',
              toolCallId,
              state: 'output-error',
              errorText: result.error,
            });
          }
        } else if (toolCall.toolName === 'forget') {
          const result = runForget(toolCall.input);
          if (result.ok) {
            addToolOutput({ tool: 'forget', toolCallId, output: result.output });
          } else {
            addToolOutput({
              tool: 'forget',
              toolCallId,
              state: 'output-error',
              errorText: result.error,
            });
          }
        }
      },
    });
  const isBusy = status === 'submitted' || status === 'streaming';
  const { isDark, toggleTheme } = useTheme();
  const memory = useMemory();
  const [isMemoryOpen, setMemoryOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    stoppedRef.current = false;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <div className="flex h-dvh flex-col">
      <ChatHeader
        isDark={isDark}
        onToggleTheme={toggleTheme}
        memoryCount={countSavedItems(memory)}
        isMemoryOpen={isMemoryOpen}
        onToggleMemory={() => setMemoryOpen((open) => !open)}
      />

      {isMemoryOpen && (
        <MemoryPanel
          memory={memory}
          onForget={removeFact}
          onForgetNote={(note) => runForget({ category: 'notes', note })}
          onClear={clearMemory}
          onClose={() => setMemoryOpen(false)}
        />
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8">
          {messages.length === 0 && <EmptyState />}

          {messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}

          {status === 'submitted' && <ThinkingIndicator />}

          {error && (
            <ErrorBanner message={error.message} onRetry={() => {
                stoppedRef.current = false;
                regenerate();
              }} />
          )}

          <div ref={endRef} />
        </div>
      </main>

      <Composer
        input={input}
        isBusy={isBusy}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onStop={() => {
          stoppedRef.current = true;
          stop();
        }}
      />
    </div>
  );
}
