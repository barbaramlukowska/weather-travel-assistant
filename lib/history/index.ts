// Public surface of chat history, mirroring lib/memory/index.ts.
export { chatIndexEntrySchema, storedMessagesSchema } from './schema';
export type { ChatIndexEntry } from './schema';
export { FALLBACK_TITLE, MAX_TITLE_CHARS, chatTitle, titleFrom } from './title';
export {
  ACTIVE_KEY,
  CHAT_KEY_PREFIX,
  EMPTY_INDEX,
  INDEX_KEY,
  MAX_CHATS,
  MAX_EVICTIONS_PER_SAVE,
  SERVER_STATUS,
  clearHistory,
  deleteChat,
  dismissNotice,
  getActiveChat,
  getHistoryStatus,
  markChatBroken,
  openChat,
  readChat,
  readIndex,
  saveChat,
  startNewChat,
  subscribeHistory,
} from './store';
export type { ActiveChat, ChatListItem, Evicted, HistoryStatus, SaveResult } from './store';
export { pickNotice } from './notices';
export type { HistoryNotice } from './notices';
