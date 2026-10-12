'use client';

import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

export const HISTORY_DRAWER_ID = 'chat-history-drawer';
// Tailwind's lg, where the sidebar takes over from the drawer.
const DESKTOP = '(min-width: 64rem)';

interface ChatHistoryDrawerProps {
  onClose: () => void;
  // Gets close(): picking a chat or "New chat" closes the drawer the same way Esc does.
  children: (close: () => void) => ReactNode;
}

// A <dialog> opened with showModal: the browser gives the top layer, an
// inert page behind it, Esc, and focus back to the hamburger on close. Kept
// out of <header> so it does not depend on the header's backdrop-blur, which
// makes the header a containing block for fixed children: a non-modal or
// fallback fixed panel there would be clipped to the header. The dialog's top
// layer makes it full-screen regardless.
export function ChatHistoryDrawer({ onClose, children }: ChatHistoryDrawerProps) {
  // The node lives in state (a callback ref), not in useRef: `close` is
  // handed to `children` during render, and react-hooks/refs flags any
  // function that reads a ref when it is passed on there. `close` only ever
  // runs from event handlers.
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  // Every close goes through dialog.close(), and only the `close` event
  // unmounts the drawer (onClose). Unmounting an open dialog skips the
  // browser's focus return and leaves focus on <body>.
  const close = () => dialog?.close();

  useEffect(() => {
    if (!dialog) return;
    // Guarded: never open a dialog that is already open.
    if (!dialog.open) dialog.showModal();
    // Rotating a tablet past lg hides the drawer with CSS, but a hidden open
    // modal would keep the whole page inert. Closed in the event callback.
    const media = window.matchMedia(DESKTOP);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) dialog.close();
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [dialog]);

  return (
    <dialog
      ref={setDialog}
      id={HISTORY_DRAWER_ID}
      aria-label="Chat history"
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> element itself; clicks
      // inside land on its children.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-surface p-0 text-on-surface backdrop:bg-black/40 lg:hidden"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-3 pt-3">
          <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">
            Chats
          </p>
          <button
            type="button"
            onClick={close}
            aria-label="Close chat history"
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
          >
            <X size={16} />
          </button>
        </div>
        {children(close)}
      </div>
    </dialog>
  );
}
