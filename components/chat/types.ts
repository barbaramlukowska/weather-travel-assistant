// The shapes our tools return (see app/api/chat/route.ts). Each is a
// discriminated union on `found`, so the UI can narrow on it.
export type WeatherOutput =
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

export type ForecastDay = {
  date: string;
  weekday: string;
  maxTemp: number;
  minTemp: number;
  precipitationChance: number;
  maxWindSpeed: number;
};

export type ForecastOutput =
  | {
      found: true;
      location: string;
      days: ForecastDay[];
      units: { temperature: string; precipitationChance: string; windSpeed: string };
    }
  | { found: false; city: string };

export type AirQualityOutput =
  | {
      found: true;
      location: string;
      usAqi: number;
      pm25: number;
      pm10: number;
      europeanAqi: number;
    }
  | { found: false; city: string };

// Every tool output shares the found/not-found discriminator, so one generic
// part type covers all tools. The UI branches on `state`, then on `found`.
export type ToolOutput = { found: true } | { found: false; city: string };

export type ToolPart<T extends ToolOutput> = {
  toolCallId: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: { city?: string };
  output?: T;
  errorText?: string;
};
