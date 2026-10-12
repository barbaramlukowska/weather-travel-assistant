'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type ChatTransport } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { dismissNotice, pickNotice, saveChat } from '@/lib/history';
import { MAX_BODY_CHARS, buildChatRequestBody, chatCapacity, requestLength } from '@/lib/limits';
import { readMemory } from '@/lib/memory';
import type { ChatUIMessage } from './types';
import { ChatFullNotice } from './chat-full-notice';
import { runForget, runRemember, shouldAutoSend } from './client-tools';
import { Composer } from './composer';
import { describeChatError } from './describe-error';
import { HistoryNotice } from './history-notice';
import { MessageItem } from './message-item';
import { EmptyState, ErrorBanner, ThinkingIndicator } from './status';
import { useHistoryStatus } from './use-history';
import { useMemory } from './use-memory';

// Created once, outside the component: it is stateless, so there is nothing
// to rebuild per render (useChat reads the transport it is given at call
// time, so a new one each render would also work, just wastefully). The body comes from buildChatRequestBody — the same
// function that estimates the size, so the estimate is the real request.
// Memory is read at send time, including the automatic re-send after
// remember, never frozen at mount.
export const chatTransport = new DefaultChatTransport<ChatUIMessage>({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
    body: buildChatRequestBody({ chatId: id, messages, memory: readMemory(), trigger, messageId }),
  }),
});

interface ChatSessionProps {
  chatId: string;
  initialMessages: ChatUIMessage[];
  // A prop so tests can pass a fake network; the app uses the real one.
  transport?: ChatTransport<ChatUIMessage>;
  autoFocus?: boolean;
  onBusyChange: (isBusy: boolean) => void;
  onStartNewChat: () => void;
}

// One chat. The frame remounts it for every chat (keyed by id), so useChat
// starts clean with that chat's saved messages.
export function ChatSession({
  chatId,
  initialMessages,
  transport = chatTransport,
  autoFocus = false,
  onBusyChange,
  onStartNewChat,
}: ChatSessionProps) {
  const [input, setInput] = useState('');
  const stoppedRef = useRef(false);
  // False once this session is gone. A geocoder answer arriving after the
  // user switched chats would otherwise make the orphaned Chat post a paid
  // request nobody sees. Set in BOTH directions: StrictMode mounts, cleans
  // up and mounts again on the same instance, and a ref left false would
  // block every automatic re-send.
  const aliveRef = useRef(false);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Typed messages: part types like 'tool-getWeather' carry the real
  // input/output types from lib/tools.ts all the way into MessageItem.
  const { messages, sendMessage, status, stop, error, regenerate, addToolOutput } =
    useChat<ChatUIMessage>({
      id: chatId,
      messages: initialMessages,
      transport,
      // remember/forget have no server-side execute: the server stream ends
      // on the call, onToolCall writes localStorage, and this posts the
      // result back so the model can reply — a second request per such turn.
      // After Stop, a still-awaited geocoder call resolves later and calls
      // addToolOutput, which would trigger a paid request the user cancelled.
      // The size is measured with the fields this re-send carries (trigger,
      // messageId), so a request the route would reject with 413 is never
      // made; the chat then shows as full instead. The refs matter because
      // this can run after the component's last render (after Stop before a
      // re-render, or after unmount, e.g. a late geocoder answer), when a
      // value captured during render would be stale.
      sendAutomaticallyWhen: (options) =>
        aliveRef.current &&
        !stoppedRef.current &&
        shouldAutoSend(options) &&
        requestLength({
          chatId,
          messages: options.messages,
          memory: readMemory(),
          trigger: 'submit-message',
          messageId: options.messages.at(-1)?.id,
        }) <= MAX_BODY_CHARS,
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

  // Up to the frame through a callback (setState in an effect is not
  // allowed). Switching chats must wait for the reply: unmounting useChat
  // stops it. The cleanup reports "idle" when this session goes away
  // mid-reply (a render error), or the list would stay locked for good.
  useEffect(() => {
    onBusyChange(isBusy);
    return () => onBusyChange(false);
  }, [isBusy, onBusyChange]);

  // Saves on submitted (the question), ready, error and Stop — never during
  // streaming, which would rewrite the whole chat on every token. Opening a
  // chat saves nothing: useChat hands back the very array it was given, so
  // the chat keeps its place in the list. "Never mid-stream" also relies on
  // the route sending no messageId/messageMetadata in the start chunk: the
  // SDK then writes that assistant message with updateStatus: false, the
  // status stays 'submitted', and this effect would save an empty message.
  const savedRef = useRef(initialMessages);
  useEffect(() => {
    if (messages === savedRef.current || messages.length === 0 || status === 'streaming') return;
    savedRef.current = messages;
    saveChat(chatId, messages);
  }, [chatId, messages, status]);

  const memory = useMemory();
  const capacity = useMemo(
    () =>
      chatCapacity({
        messageCount: messages.length,
        requestChars: requestLength({ chatId, messages, memory }),
      }),
    [chatId, messages, memory],
  );
  const describedError = error ? describeChatError(error) : null;
  // Not while a reply streams: the composer holds the Stop button.
  const isFull = !isBusy && (capacity.level === 'full' || describedError?.kind === 'chat_full');
  const notice = pickNotice(useHistoryStatus(), chatId, capacity);

  const endRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    // The first scroll jumps: animating through a whole reopened chat is
    // slow and pointless. Reduced motion never animates.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({
      behavior: hasScrolledRef.current && !reduceMotion ? 'smooth' : 'auto',
    });
    hasScrolledRef.current = true;
  }, [messages, status]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    stoppedRef.current = false;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8">
          {messages.length === 0 && <EmptyState />}

          {messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              isStreaming={isBusy && index === messages.length - 1}
            />
          ))}

          {status === 'submitted' && <ThinkingIndicator />}

          {error && describedError?.kind !== 'chat_full' && (
            <ErrorBanner
              error={error}
              onRetry={() => {
                stoppedRef.current = false;
                regenerate();
              }}
            />
          )}

          <div ref={endRef} />
        </div>
      </main>

      <HistoryNotice notice={notice} onDismiss={dismissNotice} />

      {isFull ? (
        <ChatFullNotice onNewChat={onStartNewChat} />
      ) : (
        <Composer
          input={input}
          isBusy={isBusy}
          autoFocus={autoFocus}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          onStop={() => {
            stoppedRef.current = true;
            stop();
          }}
        />
      )}
    </>
  );
}
