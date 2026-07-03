'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Cloud,
  CloudSun,
  Droplets,
  MapPin,
  Moon,
  Sparkles,
  Square,
  Sun,
  Thermometer,
  Wind,
  type LucideIcon,
} from 'lucide-react';

// Theme lives outside React (a class on <html>). useSyncExternalStore reads
// it without setState-in-effect and stays consistent across SSR/hydration.
function subscribeTheme(callback: () => void) {
  window.addEventListener('themechange', callback);
  return () => window.removeEventListener('themechange', callback);
}
function getThemeSnapshot() {
  return document.documentElement.classList.contains('dark');
}
function getThemeServerSnapshot() {
  return false;
}

// The shape our getWeather tool returns (see app/api/chat/route.ts).
type WeatherOutput =
  | {
      found: true;
      location: string;
      temperature: number;
      feelsLike: number;
      precipitation: number;
      windSpeed: number;
      units: { temperature: string; windSpeed: string };
    }
  | { found: false; city: string };

type WeatherToolPart = {
  toolCallId: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: { city?: string };
  output?: WeatherOutput;
  errorText?: string;
};

// One metric cell inside the weather card.
function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-5">
      <Icon className="text-on-surface-variant/40" size={20} />
      <div className="text-center">
        <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">
          {label}
        </p>
        <p className="text-base font-semibold">{value}</p>
      </div>
    </div>
  );
}

// The rich weather card, rendered from real Open-Meteo data.
function WeatherCard({ data }: { data: Extract<WeatherOutput, { found: true }> }) {
  return (
    <div className="assistant-glass w-full overflow-hidden rounded-4xl border border-outline-variant/40 shadow-sm">
      <div className="flex items-center justify-between gap-6 p-6">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <MapPin size={18} />
          <span className="text-xl font-bold tracking-tight">{data.location}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-5xl font-bold leading-none tracking-tight">
            {Math.round(data.temperature)}
            {data.units.temperature}
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/5 text-primary">
            <CloudSun size={38} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-outline-variant/20 border-t border-outline-variant/20 bg-surface-container-low/40">
        <Stat
          icon={Thermometer}
          label="Feels like"
          value={`${Math.round(data.feelsLike)}${data.units.temperature}`}
        />
        <Stat icon={Droplets} label="Precip." value={`${data.precipitation} mm`} />
        <Stat
          icon={Wind}
          label="Wind"
          value={`${Math.round(data.windSpeed)} ${data.units.windSpeed}`}
        />
      </div>
    </div>
  );
}

// Small rounded chip used for the tool status and errors.
function Chip({
  icon: Icon,
  children,
  variant = 'active',
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  variant?: 'active' | 'error';
}) {
  const styles =
    variant === 'error'
      ? 'border-error/20 bg-status-error-bg text-status-error-text'
      : 'border-outline-variant/40 bg-surface-container-low/50 text-on-surface-variant/80 animate-pulse';
  return (
    <div
      className={`flex items-center gap-2.5 rounded-full border px-4 py-2 ${styles}`}
    >
      <Icon size={16} />
      <span className="text-[11px] font-bold uppercase tracking-widest">{children}</span>
    </div>
  );
}

export default function Chat() {
  const [input, setInput] = useState('');

  const { messages, sendMessage, status, stop, error, regenerate } = useChat();
  const isBusy = status === 'submitted' || status === 'streaming';

  // Theme toggle. The initial class was set before paint by the script in
  // layout.tsx; we read/flip that class (external state) here.
  const isDark = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );
  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains('dark');
    const c = document.documentElement.classList;
    c.toggle('dark', next);
    c.toggle('light', !next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // ignore storage errors (e.g. private mode)
    }
    window.dispatchEvent(new Event('themechange'));
  };

  // Auto-scroll to the newest message.
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="shrink-0 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center gap-2.5 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary">
            <Sparkles className="text-on-primary" size={20} />
          </div>
          <h1 className="text-[17px] font-semibold tracking-tight">Aura Travel</h1>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      {/* Conversation */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-8">
          {messages.length === 0 && (
            <div className="mt-10 text-center text-on-surface-variant/60">
              <p className="text-lg font-medium">Where are we exploring today?</p>
              <p className="mt-1 text-sm">
                Ask about the weather anywhere — try “What&apos;s the weather in Kraków?”
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'user'
                  ? 'flex flex-col items-end gap-2'
                  : 'flex flex-col items-start gap-2'
              }
            >
              {message.parts.map((part, i) => {
                // Normal text.
                if (part.type === 'text') {
                  return (
                    <div
                      key={i}
                      className={
                        message.role === 'user'
                          ? 'bubble-user max-w-[85%] bg-user-bubble px-5 py-3 text-[15px] leading-relaxed text-white shadow-md'
                          : 'bubble-assistant assistant-glass max-w-[85%] border border-outline-variant/30 px-5 py-3 text-[15px] leading-relaxed shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                      }
                    >
                      {part.text}
                    </div>
                  );
                }

                // Weather tool states.
                if (part.type.startsWith('tool-')) {
                  const call = part as unknown as WeatherToolPart;
                  const city = call.input?.city ?? '…';

                  if (call.state === 'input-streaming' || call.state === 'input-available') {
                    return (
                      <Chip key={i} icon={Cloud}>
                        Checking weather in {city}
                      </Chip>
                    );
                  }
                  if (call.state === 'output-available' && call.output) {
                    if (call.output.found) {
                      return (
                        <div key={i} className="w-full max-w-[92%]">
                          <WeatherCard data={call.output} />
                        </div>
                      );
                    }
                    return (
                      <Chip key={i} icon={AlertCircle} variant="error">
                        Couldn&apos;t find “{call.output.city}”
                      </Chip>
                    );
                  }
                  if (call.state === 'output-error') {
                    return (
                      <Chip key={i} icon={AlertCircle} variant="error">
                        Weather lookup failed
                      </Chip>
                    );
                  }
                }

                return null;
              })}
            </div>
          ))}

          {/* "Thinking" — request sent, first token not here yet. */}
          {status === 'submitted' && (
            <div className="assistant-glass flex w-fit items-center gap-2 rounded-full border border-outline-variant/40 px-5 py-3.5 text-on-surface-variant/50">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          )}

          {/* Technical error + retry. */}
          {error && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-error/10 bg-status-error-bg px-5 py-3.5 text-status-error-text">
              <div className="flex items-center gap-3">
                <AlertCircle size={18} className="text-error" />
                <p className="text-[13px] font-medium">Something went wrong.</p>
              </div>
              <button
                type="button"
                onClick={() => regenerate()}
                className="text-[13px] font-semibold text-error hover:opacity-70"
              >
                Try again
              </button>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </main>

      {/* Composer */}
      <div className="shrink-0 bg-linear-to-t from-surface via-surface to-transparent pt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            sendMessage({ text: input });
            setInput('');
          }}
          className="mx-auto w-full max-w-2xl px-5 pb-5"
        >
          <div className="flex items-center gap-2 rounded-full border border-outline-variant/40 bg-surface-container-lowest p-2 pl-6 shadow-lg shadow-black/3 transition-colors focus-within:border-primary/40">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message Aura Travel…"
              disabled={isBusy}
              aria-label="Message"
              className="flex-1 bg-transparent py-2 text-[15px] placeholder:text-on-surface-variant/40 focus:outline-none disabled:opacity-60"
            />
            {isBusy ? (
              <button
                type="button"
                onClick={() => stop()}
                aria-label="Stop generating"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/50 bg-surface-container-low/50 text-on-surface-variant/70 transition-colors hover:bg-error/10 hover:text-error"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="Send"
                disabled={!input.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg shadow-primary/25 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
              >
                <ArrowUp size={22} />
              </button>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/30">
            AI assistant • Verify travel details independently
          </p>
        </form>
      </div>
    </div>
  );
}
