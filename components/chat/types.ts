// The tool output shapes live next to the tools (lib/tools.ts) — a single
// source of truth shared by server and client. Type-only re-exports, so no
// server code is bundled into the client.
export type {
  AirQualityOutput,
  ChatTools,
  ChatUIMessage,
  ForecastDay,
  ForecastOutput,
  TripPlanOutput,
  WeatherOutput,
} from '@/lib/tools';

// Every tool output shares the found/not-found discriminator, so one generic
// part type covers all tools. The UI branches on `state`, then on `found`.
export type ToolOutput = { found: true } | { found: false; city: string };

// Structural view of the SDK's tool part — just the fields ToolCall reads.
// The real (inferred) part types from ChatUIMessage are assignable to this,
// so no casts are needed at the call sites.
export type ToolPart<T extends ToolOutput> = {
  state:
    | 'input-streaming'
    | 'input-available'
    | 'approval-requested'
    | 'approval-responded'
    | 'output-available'
    | 'output-error'
    | 'output-denied';
  input?: { city?: string };
  output?: T;
  errorText?: string;
};
