import {
  AlertCircle,
  CalendarDays,
  Cloud,
  Plane,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChatTools, ChatUIMessage, ToolOutput, ToolPart } from './types';
import { WeatherCard } from './weather-card';
import { ForecastCard } from './forecast-card';
import { AirQualityCard } from './air-quality-card';
import { TripPlanCard } from './trip-plan-card';

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

// One state machine for every tool: loading chip → success card → "not found"
// chip → error chip. Each tool only supplies its icon, labels, and card.
interface ToolCallProps<T extends ToolOutput> {
  part: ToolPart<T>;
  icon: LucideIcon;
  loadingLabel: string;
  errorLabel: string;
  renderCard: (output: Extract<T, { found: true }>) => ReactNode;
}

// Exported so its four states can be tested directly, without going through
// a full chat message and a specific tool's part type.
export function ToolCall<T extends ToolOutput>({
  part,
  icon,
  loadingLabel,
  errorLabel,
  renderCard,
}: ToolCallProps<T>) {
  const city = part.input?.city ?? '…';

  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return (
      <Chip icon={icon}>
        {loadingLabel} {city}
      </Chip>
    );
  }
  if (part.state === 'output-available' && part.output) {
    if (part.output.found) {
      return (
        <div className="w-full max-w-[92%]">
          {renderCard(part.output as Extract<T, { found: true }>)}
        </div>
      );
    }
    return (
      <Chip icon={AlertCircle} variant="error">
        Couldn&apos;t find “{part.output.city}”
      </Chip>
    );
  }
  if (part.state === 'output-error') {
    return (
      <Chip icon={AlertCircle} variant="error">
        {errorLabel}
      </Chip>
    );
  }
  return null;
}

// One entry per tool. The mapped type ties each renderCard to that tool's
// real output type, and a tool without an entry is a compile error.
interface ToolCardConfig<T extends ToolOutput> {
  icon: LucideIcon;
  loadingLabel: string;
  errorLabel: string;
  renderCard: (output: Extract<T, { found: true }>) => ReactNode;
}

const TOOL_CARDS: {
  [N in keyof ChatTools]: ToolCardConfig<ChatTools[N]['output']>;
} = {
  getWeather: {
    icon: Cloud,
    loadingLabel: 'Checking weather in',
    errorLabel: 'Weather lookup failed',
    renderCard: (output) => <WeatherCard data={output} />,
  },
  getForecast: {
    icon: CalendarDays,
    loadingLabel: 'Fetching forecast for',
    errorLabel: 'Forecast lookup failed',
    renderCard: (output) => <ForecastCard data={output} />,
  },
  getAirQuality: {
    icon: Wind,
    loadingLabel: 'Checking air quality in',
    errorLabel: 'Air quality lookup failed',
    renderCard: (output) => <AirQualityCard data={output} />,
  },
  planTrip: {
    icon: Plane,
    loadingLabel: 'Planning a trip to',
    errorLabel: 'Trip planning failed',
    renderCard: (output) => <TripPlanCard data={output} />,
  },
};

// The switch narrows part.type, so each ToolCall receives exactly its tool's
// input/output types — no casts anywhere on this path.
function renderToolPart(
  part: ChatUIMessage['parts'][number],
  key: number,
): ReactNode {
  switch (part.type) {
    case 'tool-getWeather':
      return <ToolCall key={key} part={part} {...TOOL_CARDS.getWeather} />;
    case 'tool-getForecast':
      return <ToolCall key={key} part={part} {...TOOL_CARDS.getForecast} />;
    case 'tool-getAirQuality':
      return <ToolCall key={key} part={part} {...TOOL_CARDS.getAirQuality} />;
    case 'tool-planTrip':
      return <ToolCall key={key} part={part} {...TOOL_CARDS.planTrip} />;
    default:
      return null;
  }
}

interface MessageItemProps {
  message: ChatUIMessage;
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

        return renderToolPart(part, i);
      })}
    </div>
  );
}
