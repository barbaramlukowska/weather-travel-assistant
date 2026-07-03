// The shape our getWeather tool returns (see app/api/chat/route.ts).
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

export type WeatherToolPart = {
  toolCallId: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: { city?: string };
  output?: WeatherOutput;
  errorText?: string;
};
