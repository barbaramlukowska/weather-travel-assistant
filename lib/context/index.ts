// Public surface of the context pipeline. Keeping it here means callers import
// '@/lib/context' exactly as they did before this directory existed.
export { compactContext } from './compact';
export type { CompactOptions, CompactResult, CompactStats } from './compact';
