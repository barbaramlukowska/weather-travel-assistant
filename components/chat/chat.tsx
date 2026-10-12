'use client';

import { useState } from 'react';
import { clearHistory, deleteChat, openChat, startNewChat } from '@/lib/history';
import { clearMemory, countSavedItems, removeFact } from '@/lib/memory';
import { ChatErrorBoundary } from './chat-error-boundary';
import { ChatHeader } from './chat-header';
import { ChatHistoryDrawer } from './chat-history-drawer';
import { ChatList } from './chat-list';
import { ChatSession } from './chat-session';
import { runForget } from './client-tools';
import { Composer } from './composer';
import { MemoryPanel } from './memory-panel';
import { EmptyState } from './status';
import { useActiveChat, useHistory, useHistoryStatus } from './use-history';
import { useMemory } from './use-memory';
import { useTheme } from './use-theme';

const noop = () => {};

// The frame: lives for the whole page. ChatSession inside is remounted for
// every chat (the boundary is keyed by chat id), so useChat starts clean
// with that chat's saved messages.
export function Chat() {
  const active = useActiveChat();
  const chats = useHistory();
  const historyStatus = useHistoryStatus();
  const memory = useMemory();
  const { isDark, toggleTheme } = useTheme();
  const [isBusy, setBusy] = useState(false);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isMemoryOpen, setMemoryOpen] = useState(false);
  // Whether the next session takes focus: yes after "New chat" and after a
  // pick in the drawer (the drawer is gone); no after a pick in the sidebar,
  // where focus stays on the list.
  const [focusComposer, setFocusComposer] = useState(false);

  const startFresh = () => {
    setFocusComposer(true);
    startNewChat();
  };

  // `close` comes from the drawer; the sidebar passes nothing.
  const renderList = (close?: () => void) => (
    <ChatList
      chats={chats}
      activeId={active?.id ?? null}
      isBusy={isBusy}
      isAvailable={historyStatus.available}
      onOpen={(id) => {
        setFocusComposer(close !== undefined);
        openChat(id);
        close?.();
      }}
      onNew={() => {
        startFresh();
        close?.();
      }}
      onDelete={deleteChat}
      onDeleteAll={clearHistory}
    />
  );

  return (
    <div className="flex h-dvh">
      {/* lg, not md: at md the chat column would shrink to 512px. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-outline-variant/20 bg-surface-container-low/40 lg:flex">
        {renderList()}
      </aside>

      {isDrawerOpen && <ChatHistoryDrawer onClose={() => setDrawerOpen(false)}>{renderList}</ChatHistoryDrawer>}

      {/* min-w-0: without it the forecast strip pushes the page 254px sideways. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          isDark={isDark}
          onToggleTheme={toggleTheme}
          memoryCount={countSavedItems(memory)}
          isMemoryOpen={isMemoryOpen}
          onToggleMemory={() => setMemoryOpen((open) => !open)}
          isHistoryOpen={isDrawerOpen}
          onOpenHistory={() => setDrawerOpen(true)}
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

        {active === null ? (
          // Server render and hydration: the same layout, empty, so nothing
          // jumps once the stored chat appears.
          <>
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8">
                <EmptyState />
              </div>
            </main>
            <Composer input="" isBusy={false} disabled onInputChange={noop} onSubmit={noop} onStop={noop} />
          </>
        ) : (
          <ChatErrorBoundary key={active.id} chatId={active.id} onStartNew={startFresh}>
            <ChatSession
              chatId={active.id}
              initialMessages={active.initialMessages}
              autoFocus={focusComposer}
              onBusyChange={setBusy}
              onStartNewChat={startFresh}
            />
          </ChatErrorBoundary>
        )}
      </div>
    </div>
  );
}
