import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { criticVerdictSchema, criticWireSchema, reviewIssueSchema } from './schema';

const issue = (problem: string) => ({ field: 'summary' as const, problem });

describe('criticVerdictSchema', () => {
  it('accepts a clean pass with no issues', () => {
    expect(criticVerdictSchema.safeParse({ issues: [], pass: true }).success).toBe(true);
  });

  it('rejects more than six issues', () => {
    const issues = Array.from({ length: 7 }, () => issue('too vague'));
    expect(criticVerdictSchema.safeParse({ issues, pass: false }).success).toBe(false);
  });

  it('rejects an issue longer than 160 characters', () => {
    const tooLong = issue('x'.repeat(161));
    expect(criticVerdictSchema.safeParse({ issues: [tooLong], pass: false }).success).toBe(false);
    const ok = issue('x'.repeat(160));
    expect(criticVerdictSchema.safeParse({ issues: [ok], pass: false }).success).toBe(true);
  });
});

describe('reviewIssueSchema', () => {
  it('caps item at 80 characters', () => {
    const at = (n: number) => ({ field: 'packingList' as const, item: 'x'.repeat(n), problem: 'p' });
    expect(reviewIssueSchema.safeParse(at(80)).success).toBe(true);
    expect(reviewIssueSchema.safeParse(at(81)).success).toBe(false);
  });
});

describe('criticWireSchema', () => {
  it('accepts more than 6 issues and long problems', () => {
    const long = { field: 'summary', item: null, problem: 'x'.repeat(300) };
    const wire = { issues: Array.from({ length: 8 }, () => long), pass: false };
    expect(criticWireSchema.safeParse(wire).success).toBe(true);
  });

  // OpenAI strict mode rejects the whole request when a property is not in
  // `required` (it did, on the first paid calibration run).
  it('lists every issue property as required', () => {
    const json = z.toJSONSchema(criticWireSchema) as unknown as {
      properties: { issues: { items: { properties: object; required: string[] } } };
    };
    const item = json.properties.issues.items;
    expect(item.required.sort()).toEqual(Object.keys(item.properties).sort());
  });
});
