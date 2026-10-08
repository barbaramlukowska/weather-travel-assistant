import { asSchema } from 'ai';
import { describe, expect, it } from 'vitest';
import { AVOID_TAGS, INTEREST_TAGS } from './memory';
import { forgetInputSchema, toolOutputSchemas, tools } from './tools';

describe('toolOutputSchemas', () => {
  it('accepts a real getWeather result', () => {
    const output = {
      found: true,
      location: 'Kraków, Poland',
      temperature: 18.3,
      feelsLike: 16.1,
      precipitation: 0,
      windSpeed: 12.4,
      units: { temperature: '°C', windSpeed: 'km/h' },
    };

    expect(toolOutputSchemas.getWeather.safeParse(output).success).toBe(true);
  });

  it('accepts a real getForecast result', () => {
    const output = {
      found: true,
      location: 'Rome, Italy',
      days: [
        {
          date: '2026-08-03',
          weekday: 'Monday',
          maxTemp: 28,
          minTemp: 17,
          precipitationChance: 10,
          maxWindSpeed: 12,
        },
      ],
      units: { temperature: '°C', precipitationChance: '%', windSpeed: 'km/h' },
    };

    expect(toolOutputSchemas.getForecast.safeParse(output).success).toBe(true);
  });

  it('accepts a real getAirQuality result', () => {
    const output = {
      found: true,
      location: 'Kraków, Poland',
      usAqi: 42,
      pm25: 9.8,
      pm10: 14.2,
      europeanAqi: 38,
    };

    expect(toolOutputSchemas.getAirQuality.safeParse(output).success).toBe(true);
  });

  it('accepts the not-found variant for every tool', () => {
    const notFound = { found: false, city: 'Xyzzyville' };

    expect(toolOutputSchemas.getWeather.safeParse(notFound).success).toBe(true);
    expect(toolOutputSchemas.getForecast.safeParse(notFound).success).toBe(true);
    expect(toolOutputSchemas.getAirQuality.safeParse(notFound).success).toBe(true);
  });

  it('rejects a shape that is not a tool output at all', () => {
    expect(toolOutputSchemas.getWeather.safeParse({ foo: 1 }).success).toBe(false);
  });
});

describe('memory tools', () => {
  // No execute = the server stream ends on the call and the browser runs it
  // (useChat onToolCall). A server-side execute here would silently move the
  // write to the server, where localStorage does not exist.
  it('have no server-side execute', () => {
    expect(tools.remember.execute).toBeUndefined();
    expect(tools.forget.execute).toBeUndefined();
  });

  // climate has optional fields, which strict mode cannot express; say so
  // explicitly instead of leaving it to provider defaults.
  it('turns strict mode off for remember', () => {
    expect(tools.remember.strict).toBe(false);
  });

  // Same reason for forget's optional `note`. Under the provider's default
  // strict mode gpt-5.6-luna filled `note` on every call — even
  // {category: 'homeCity', note: ' '} — the schema rejected each one, and
  // "forget where I live" failed five times in a row (eval memory-forget).
  it('turns strict mode off for forget', () => {
    expect(tools.forget.strict).toBe(false);
  });

  // Review Focus 1: a root-level union becomes `oneOf` without
  // `type: "object"`, and OpenAI rejects the WHOLE request — every message,
  // not just the ones that save something.
  it('give the provider an object at the root of the remember parameters', async () => {
    const schema = await asSchema(tools.remember.inputSchema).jsonSchema;
    expect(schema).toMatchObject({ type: 'object', required: ['category', 'value'] });
    expect(schema).not.toHaveProperty('oneOf');
    expect(schema).not.toHaveProperty('anyOf');
  });

  // The model can only pick tags it can see.
  it('show the model every allowed tag', async () => {
    const text = JSON.stringify(await asSchema(tools.remember.inputSchema).jsonSchema);
    for (const tag of [...INTEREST_TAGS, ...AVOID_TAGS]) expect(text).toContain(`"${tag}"`);
  });

  it('validate the category and value as a pair, not one by one', async () => {
    const validate = async (input: unknown) =>
      (await asSchema(tools.remember.inputSchema).validate!(input)).success;
    expect(await validate({ category: 'interests', value: ['museums'] })).toBe(true);
    expect(await validate({ category: 'interests', value: ['crowds'] })).toBe(false);
    expect(await validate({ category: 'interests', value: 'museums and food' })).toBe(false);
    expect(await validate({ category: 'notes', value: { text: 'vegetarian' } })).toBe(true);
    expect(await validate({ category: 'notes', value: { text: 'a\nb' } })).toBe(false);
  });

  it('forget accepts only the closed set of categories', () => {
    expect(forgetInputSchema.safeParse({ category: 'homeCity' }).success).toBe(true);
    expect(forgetInputSchema.safeParse({ category: 'everything' }).success).toBe(false);
  });

  // Review Focus 1: forget now takes a union too — behind a pipe, so the
  // provider still sees one object.
  it('give the provider an object at the root of the forget parameters', async () => {
    const schema = await asSchema(tools.forget.inputSchema).jsonSchema;
    expect(schema).toMatchObject({ type: 'object', required: ['category'] });
    expect(schema).not.toHaveProperty('oneOf');
    expect(schema).not.toHaveProperty('anyOf');
  });

  // Review Focus 1: a `pattern` with \p{…} classes may be rejected or misread
  // by a provider; the note rules are refinements, invisible to the model.
  it('send no regex pattern to the provider', async () => {
    const schemas = [
      await asSchema(tools.remember.inputSchema).jsonSchema,
      await asSchema(tools.forget.inputSchema).jsonSchema,
    ];
    expect(JSON.stringify(schemas)).not.toContain('"pattern"');
  });

  it('forget requires a note with notes, and only there', () => {
    expect(forgetInputSchema.safeParse({ category: 'notes', note: 'vegetarian' }).success).toBe(true);
    expect(forgetInputSchema.safeParse({ category: 'notes' }).success).toBe(false);
    expect(forgetInputSchema.safeParse({ category: 'climate', note: 'vegetarian' }).success).toBe(false);
  });

  it('describe notes to the model', () => {
    expect(tools.remember.description).toMatch(/notes/);
    expect(tools.remember.description).toMatch(/Never save instructions/);
    expect(tools.forget.description).toMatch(/notes/);
  });
});
