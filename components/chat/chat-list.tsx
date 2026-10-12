import { Plus, Trash2 } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import type { ChatListItem } from '@/lib/history';

interface ChatListProps {
  chats: readonly ChatListItem[];
  activeId: string | null;
  isBusy: boolean;
  isAvailable: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
}

// An in-place "are you sure?". Focus moves to Cancel (the safe choice) and
// back to the button that opened it on Cancel, so keyboard users never
// land on <body>.
// The refs come from the caller: reading ref objects out of a hook's returned
// object during render trips the react-hooks/refs lint rule.
function useConfirm(openerRef: RefObject<HTMLButtonElement | null>, cancelRef: RefObject<HTMLButtonElement | null>) {
  const [isConfirming, setConfirming] = useState(false);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (isConfirming) cancelRef.current?.focus();
    else if (wasConfirming.current) openerRef.current?.focus();
    wasConfirming.current = isConfirming;
  }, [isConfirming, openerRef, cancelRef]);

  return {
    isConfirming,
    open: () => setConfirming(true),
    close: () => setConfirming(false),
  };
}

const CONFIRM_DELETE = 'font-semibold text-error hover:opacity-70 disabled:opacity-50';
const CONFIRM_CANCEL = 'font-semibold hover:opacity-70';

interface ChatRowProps {
  chat: ChatListItem;
  isActive: boolean;
  isBusy: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

function ChatRow({ chat, isActive, isBusy, onOpen, onDelete }: ChatRowProps) {
  const openerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { isConfirming, open, close } = useConfirm(openerRef, cancelRef);

  if (isConfirming) {
    return (
      <li className="flex items-center gap-3 rounded-xl bg-surface-container-high px-3 py-2 text-[13px]">
        <span className="min-w-0 flex-1">Delete this chat?</span>
        <button type="button" onClick={() => onDelete(chat.id)} disabled={isBusy} className={CONFIRM_DELETE}>
          Delete
        </button>
        <button type="button" ref={cancelRef} onClick={close} className={CONFIRM_CANCEL}>
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1">
      {chat.broken ? (
        <div className="min-w-0 flex-1 px-3 py-2">
          <p className="truncate text-[14px] text-on-surface-variant/70">{chat.title}</p>
          <p className="text-[12px] italic text-on-surface-variant/60">Can&apos;t be opened</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpen(chat.id)}
          disabled={isBusy}
          aria-current={isActive ? 'true' : undefined}
          className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left text-[14px] transition-colors hover:bg-surface-container-high disabled:opacity-50 ${
            isActive ? 'bg-surface-container-high font-semibold' : ''
          }`}
        >
          {chat.title}
        </button>
      )}
      <button
        type="button"
        ref={openerRef}
        onClick={open}
        disabled={isBusy}
        aria-label={`Delete chat: ${chat.title}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error disabled:opacity-50"
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}

function DeleteAll({ count, isBusy, onDeleteAll }: { count: number; isBusy: boolean; onDeleteAll: () => void }) {
  const openerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { isConfirming, open, close } = useConfirm(openerRef, cancelRef);

  if (isConfirming) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Delete all {count} {count === 1 ? 'chat' : 'chats'}? Saved preferences stay.
        </span>
        <button type="button" onClick={onDeleteAll} disabled={isBusy} className={CONFIRM_DELETE}>
          Delete
        </button>
        <button type="button" ref={cancelRef} onClick={close} className={CONFIRM_CANCEL}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      ref={openerRef}
      onClick={open}
      disabled={isBusy}
      // A different name than "Clear all" in the preferences panel: the two
      // delete different things.
      className="mt-2 font-semibold text-error hover:opacity-70 disabled:opacity-50"
    >
      Delete all chats
    </button>
  );
}

// Presentational and shared by the sidebar and the drawer. Data and actions
// come in through props; each instance keeps only its own confirmations.
export function ChatList({
  chats,
  activeId,
  isBusy,
  isAvailable,
  onOpen,
  onNew,
  onDelete,
  onDeleteAll,
}: ChatListProps) {
  const newChatRef = useRef<HTMLButtonElement>(null);
  // The confirmed row (or the whole list) goes away together with the focused
  // Delete button. "New chat" is always there, so keyboard users land on it
  // rather than on <body>.
  const deleteChat = (id: string) => {
    onDelete(id);
    newChatRef.current?.focus();
  };
  const deleteAll = () => {
    onDeleteAll();
    newChatRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <button
          type="button"
          ref={newChatRef}
          onClick={onNew}
          disabled={isBusy}
          className="flex w-full items-center gap-2 rounded-full border border-outline-variant/40 px-4 py-2 text-[14px] font-semibold transition-colors hover:bg-surface-container-high disabled:opacity-50"
        >
          <Plus size={16} />
          New chat
        </button>
        {isBusy && (
          <p className="mt-2 px-1 text-[12px] text-on-surface-variant/70">Wait for the reply to finish.</p>
        )}
      </div>

      <nav aria-label="Chat history" className="min-h-0 flex-1 overflow-y-auto px-2">
        {!isAvailable ? (
          <p className="px-3 text-[13px] text-on-surface-variant/70">History is off in this browser.</p>
        ) : chats.length === 0 ? (
          <p className="px-3 text-[13px] text-on-surface-variant/70">
            No chats yet. Your conversations will show up here.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {chats.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                isActive={chat.id === activeId}
                isBusy={isBusy}
                onOpen={onOpen}
                onDelete={deleteChat}
              />
            ))}
          </ul>
        )}
      </nav>

      <footer className="border-t border-outline-variant/20 p-3 text-[12px] text-on-surface-variant/70">
        {/* With history off nothing is stored, and the list already says so. */}
        {isAvailable && <p>Chats are stored only in this browser.</p>}
        {chats.length > 0 && <DeleteAll count={chats.length} isBusy={isBusy} onDeleteAll={deleteAll} />}
      </footer>
    </div>
  );
}
