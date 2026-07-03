import { AlertCircle, Cloud, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UIMessage } from 'ai';
import type { WeatherToolPart } from './types';
import { WeatherCard } from './weather-card';

// Small rounded chip used for the tool status and errors.
interface ChipProps {
  icon: LucideIcon;
  children: ReactNode;
  variant?: 'active' | 'error';
}

function Chip({ icon: Icon, children, variant = 'active' }: ChipProps) {
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

// Renders one conversation message: text parts as bubbles, and any getWeather
// tool parts as a status chip, weather card, or error chip.
interface MessageItemProps {
  message: UIMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  return (
    <div
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
  );
}
