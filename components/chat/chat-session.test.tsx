import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { APICallError, simulateReadableStream, type ChatTransport, type UIMessageChunk } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { ChatUIMessage } from './types';
import { ChatSession } from './chat-session';

const CHAT_ID = 'chat-1';
const CHAT_KEY = `wta.chat.v1.${CHAT_ID}`;

function textReply(text: string): UIMessageChunk[] {
  return [
    { type: 'start' },
    { type: 'start-step' },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    { type: 'finish-step' },
    { type: 'finish' },
  ];
}

// The server stream ends on a remember call: the browser runs it and posts
// the result back — a second request.
function rememberCall(value: unknown, category = 'climate'): UIMessageChunk[] {
  return [
    { type: 'start' },
    { type: 'start-step' },
    { type: 'tool-input-available', toolCallId: 'call-1', toolName: 'remember', input: { category, value } },
    { type: 'finish-step' },
    { type: 'finish' },
  ];
}

// A reply the test feeds chunk by chunk, to look at the chat mid-stream.
function controlledReply() {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>;
  const stream = new ReadableStream<UIMessageChunk>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    push: (...chunks: UIMessageChunk[]) => chunks.forEach((chunk) => controller.enqueue(chunk)),
    close: () => controller.close(),
  };
}

// Stands in for the network: each request takes the next scripted reply.
function fakeTransport(...replies: (UIMessageChunk[] | ReadableStream<UIMessageChunk>)[]) {
  const sendMessages = vi.fn(async () => {
    const next = replies.shift() ?? textReply('(no more replies)');
    return next instanceof ReadableStream ? next : simulateReadableStream({ chunks: next });
  });
  const transport = { sendMessages, reconnectToStream: async () => null } as ChatTransport<ChatUIMessage>;
  return { transport, sendMessages };
}

function renderSession(transport: ChatTransport<ChatUIMessage>, initialMessages: ChatUIMessage[] = []) {
  const onBusyChange = vi.fn();
  const view = render(
    <ChatSession
      chatId={CHAT_ID}
      initialMessages={initialMessages}
      transport={transport}
      onBusyChange={onBusyChange}
      onStartNewChat={vi.fn()}
    />,
    // StrictMode mounts, unmounts and mounts again — exactly what broke a
    // one-way aliveRef in the spec's review.
    { reactStrictMode: true },
  );
  return { ...view, onBusyChange };
}

async function ask(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Message' }), text);
  await user.keyboard('{Enter}');
}

const chatOf = (count: number): ChatUIMessage[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    parts: [{ type: 'text', text: `message ${i}` }],
  }));

let setItem: MockInstance<Storage['setItem']>;
const chatWrites = () => setItem.mock.calls.filter(([key]) => key === CHAT_KEY).length;

beforeEach(() => {
  localStorage.clear();
  setItem = vi.spyOn(Storage.prototype, 'setItem');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ChatSession — saving', () => {
  it('saves nothing when a chat is only opened, so it keeps its place in the list', async () => {
    const opened = chatOf(2);
    localStorage.setItem('wta.chats.v1', JSON.stringify([{ id: CHAT_ID, title: 'message 0', updatedAt: 1 }]));
    localStorage.setItem(CHAT_KEY, JSON.stringify(opened));
    setItem.mockClear();

    renderSession(fakeTransport().transport, opened);
    await act(async () => {});

    expect(chatWrites()).toBe(0);
    expect(JSON.parse(localStorage.getItem('wta.chats.v1')!)[0].updatedAt).toBe(1);
  });

  it('saves the question at once and the answer once complete, never mid-stream', async () => {
    const reply = controlledReply();
    renderSession(fakeTransport(reply.stream).transport);

    await ask('Weather in Kraków?');
    await waitFor(() => expect(chatWrites()).toBe(1));

    reply.push({ type: 'start' }, { type: 'start-step' }, { type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: 'Sunny' });
    await screen.findByText('Sunny');
    const midStream = chatWrites();
    reply.push({ type: 'text-delta', id: 't1', delta: ', 21°C.' });
    await screen.findByText('Sunny, 21°C.');
    expect(chatWrites()).toBe(midStream);

    reply.push({ type: 'text-end', id: 't1' }, { type: 'finish-step' }, { type: 'finish' });
    reply.close();
    await waitFor(() => expect(chatWrites()).toBe(midStream + 1));
    expect(localStorage.getItem(CHAT_KEY)).toContain('Sunny, 21°C.');
  });
});

describe('ChatSession — the automatic re-send after remember', () => {
  // A positive test: a one-way aliveRef (set false in cleanup only) passes
  // the negative test below but silently kills this re-send under StrictMode.
  it('posts the result back exactly once', async () => {
    const { transport, sendMessages } = fakeTransport(
      rememberCall({ maxComfortC: 28 }),
      textReply('Noted: up to 28°C.'),
    );
    renderSession(transport);

    await ask('I hate anything above 28 degrees');

    expect(await screen.findByText('Noted: up to 28°C.')).toBeInTheDocument();
    expect(sendMessages).toHaveBeenCalledTimes(2);
  });

  // The geocoder answers after the user left the chat: the orphaned Chat
  // must not post a paid request nobody will see.
  it('posts nothing once the session is gone', async () => {
    let answerGeocoder!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (answerGeocoder = resolve)));
    vi.stubGlobal('fetch', fetchMock);
    const { transport, sendMessages } = fakeTransport(rememberCall({ city: 'Kraków' }, 'homeCity'));
    const { unmount } = renderSession(transport);

    await ask('I live in Kraków');
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    unmount();
    answerGeocoder(
      new Response(
        JSON.stringify({ results: [{ latitude: 50.06, longitude: 19.94, name: 'Kraków', country: 'Poland' }] }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sendMessages).toHaveBeenCalledTimes(1);
  });
});

describe('ChatSession — busy state and capacity', () => {
  it('reports busy while a reply streams', async () => {
    const reply = controlledReply();
    const { onBusyChange } = renderSession(fakeTransport(reply.stream).transport);
    await ask('Hi');
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));
  });

  // A render error mid-reply unmounts the session while busy.
  it('reports idle when the session unmounts mid-reply', async () => {
    const reply = controlledReply();
    const { onBusyChange, unmount } = renderSession(fakeTransport(reply.stream).transport);
    await ask('Hi');
    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));

    unmount();

    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('warns when the chat is getting long', () => {
    renderSession(fakeTransport().transport, chatOf(45));
    expect(screen.getByText('This chat is getting long. Start a new one soon.')).toBeInTheDocument();
  });

  it('closes a chat that is already full when opened', () => {
    renderSession(fakeTransport().transport, chatOf(59));
    expect(screen.getByRole('button', { name: 'Start a new chat' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
  });

  // A long reply must keep Stop to the end; only then may the chat show as full.
  it('keeps Stop while a long reply streams, then closes the full chat', async () => {
    const reply = controlledReply();
    renderSession(fakeTransport(reply.stream).transport);
    await ask('Tell me everything');

    reply.push(
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'x'.repeat(60_000) },
    );
    await screen.findByText(/^x+$/);
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeInTheDocument();

    reply.push({ type: 'text-end', id: 't1' }, { type: 'finish-step' }, { type: 'finish' });
    reply.close();
    expect(await screen.findByRole('button', { name: 'Start a new chat' })).toBeInTheDocument();
  });

  it('shows "This chat is full" instead of an error when the route answers 413', async () => {
    const { transport } = fakeTransport();
    vi.mocked(transport.sendMessages).mockRejectedValue(
      new APICallError({
        message: '{"error":"This chat is too long.","code":"chat_too_long"}',
        url: '/api/chat',
        requestBodyValues: {},
        statusCode: 413,
      }),
    );
    renderSession(transport);

    await ask('One more');

    expect(await screen.findByText(/This chat is full/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
