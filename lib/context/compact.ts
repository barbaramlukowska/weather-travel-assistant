import type { ModelMessage, ToolResultPart } from 'ai';
import { digestToolResult } from './digest';
import {
  SUMMARY_PREFIX,
  cachedSummarizeMessages,
  type CachedSummarizer,
  type SummarySource,
} from './summarize';
import { estimateTokens } from './tokens';

// How many of the most recent tool results keep their full payload. Counted
// over the whole history, not per message: after convertToModelMessages one
// conversational turn becomes several ModelMessages, so counting messages
// would mean something different from one conversation to the next.
const DEFAULT_KEEP_RECENT_TOOL_RESULTS = 2;

// Level 2 only pays off on genuinely long conversations. The value comes from
// measuring a real eight-turn chat after level 1 (2273 tokens) and rounding
// down to the nearest 500, so summarisation actually fires instead of being
// dead code.
const DEFAULT_TOKEN_BUDGET = 2_000;

// How many messages at the end never enter the summary.
const DEFAULT_KEEP_RECENT_MESSAGES = 6;

// Below this, summarising costs a model call to save almost nothing.
const MIN_MESSAGES_TO_SUMMARIZE = 4;

export type CompactStats = {
  toolResultsDigested: number;
  summarized: boolean;
  // Where the recap came from: a cache hit, one extra pass over the newest
  // turns, or a full re-read. Without it a cache that never hits is
  // indistinguishable from one that always does.
  summarySource: SummarySource | null;
  tokensBefore: number;
  tokensAfterDigest: number;
  tokensAfter: number;
};

export type CompactOptions = {
  keepRecentToolResults?: number;
  tokenBudget?: number;
  keepRecentMessages?: number;
  summarize?: CachedSummarizer;
};

export type CompactResult = {
  messages: ModelMessage[];
  stats: CompactStats;
};

function countToolResults(messages: ModelMessage[]): number {
  let count = 0;

  for (const message of messages) {
    if (message.role !== 'tool') continue;
    for (const part of message.content) {
      if (part.type === 'tool-result') count++;
    }
  }

  return count;
}

function digestOldToolResults(
  messages: ModelMessage[],
  keepRecent: number,
): { messages: ModelMessage[]; digested: number } {
  const toDigest = Math.max(0, countToolResults(messages) - keepRecent);
  if (toDigest === 0) return { messages, digested: 0 };

  let seen = 0;
  let digested = 0;

  const next = messages.map((message) => {
    if (message.role !== 'tool') return message;

    const content = message.content.map((part) => {
      if (part.type !== 'tool-result') return part;
      if (seen++ >= toDigest) return part;

      const replaced = digestToolResult(part as ToolResultPart);
      if (replaced !== part) digested++;
      return replaced;
    });

    return { ...message, content };
  });

  return { messages: next, digested };
}

// A user message always starts a fresh turn, so the tool-call/tool-result
// chain from the previous turn is complete just before it. Cutting anywhere
// else risks sending a call with no matching result, which providers reject.
function findCutIndex(messages: ModelMessage[], keepRecentMessages: number): number {
  const latest = Math.min(messages.length - keepRecentMessages, messages.length - 1);

  for (let i = latest; i > 0; i--) {
    if (messages[i].role === 'user') return i;
  }

  return -1;
}

// Shrinks the history on its way to the model. The client keeps the full copy,
// so the UI cards are unaffected by anything that happens here.
export async function compactContext(
  messages: ModelMessage[],
  options: CompactOptions = {},
): Promise<CompactResult> {
  const {
    keepRecentToolResults = DEFAULT_KEEP_RECENT_TOOL_RESULTS,
    tokenBudget = DEFAULT_TOKEN_BUDGET,
    keepRecentMessages = DEFAULT_KEEP_RECENT_MESSAGES,
    summarize = cachedSummarizeMessages,
  } = options;

  const tokensBefore = estimateTokens(messages);
  const { messages: digested, digested: toolResultsDigested } = digestOldToolResults(
    messages,
    keepRecentToolResults,
  );
  const tokensAfterDigest = estimateTokens(digested);

  const levelOneOnly: CompactResult = {
    messages: digested,
    stats: {
      toolResultsDigested,
      summarized: false,
      summarySource: null,
      tokensBefore,
      tokensAfterDigest,
      tokensAfter: tokensAfterDigest,
    },
  };

  // Level 2 runs on the already-digested history: cheaper to summarise, and it
  // cannot lose a number that level 1 kept.
  if (tokensAfterDigest <= tokenBudget) return levelOneOnly;

  const cut = findCutIndex(digested, keepRecentMessages);
  if (cut < MIN_MESSAGES_TO_SUMMARIZE) return levelOneOnly;

  let summary: Awaited<ReturnType<CachedSummarizer>> = null;
  try {
    summary = await summarize(digested.slice(0, cut));
  } catch (error) {
    console.error('Context summarization failed:', error);
  }
  if (!summary) return levelOneOnly;

  const compacted: ModelMessage[] = [
    { role: 'user', content: `${SUMMARY_PREFIX}${summary.text}]` },
    ...digested.slice(cut),
  ];

  return {
    messages: compacted,
    stats: {
      ...levelOneOnly.stats,
      summarized: true,
      summarySource: summary.source,
      tokensAfter: estimateTokens(compacted),
    },
  };
}
