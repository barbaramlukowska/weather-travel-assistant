// Single source of truth for the free-tier daily-quota (HTTP 429) message.
// The server sets it (see app/api/chat/route.ts) and the client compares
// against it to recognize the case — so the exact text lives in one place and
// the client never has to guess from a duplicated string.
export const RATE_LIMIT_MESSAGE =
  "This demo runs on Google Gemini's free tier, which allows only a limited number of requests per day — and that limit has been reached. It resets once every 24 hours, so please check back tomorrow.";
