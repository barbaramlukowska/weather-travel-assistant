import { Info } from 'lucide-react';
import { MAX_CHATS, type HistoryNotice as Notice } from '@/lib/history';

interface HistoryNoticeProps {
  notice: Notice | null;
  onDismiss: (kind: 'unavailable' | 'evicted') => void;
}

const quote = (title: string) => `“${title}”`;

function noticeText(notice: Notice): string {
  switch (notice.kind) {
    case 'warn':
      return 'This chat is getting long. Start a new one soon.';
    case 'save_failed':
      return "Couldn't save this chat. Browser storage is full. Delete some chats to make room.";
    case 'unavailable':
      return 'History is off in this browser. This chat will be gone when you close the page.';
    case 'evicted':
      if (notice.reason === 'storage') {
        return `Browser storage was full, so I deleted your oldest chats: ${notice.titles.map(quote).join(', ')}.`;
      }
      // Usually one, but a list grown past the limit (e.g. by another tab)
      // loses several at once.
      return notice.titles.length === 1
        ? `You can keep ${MAX_CHATS} chats, so I deleted the oldest one: ${quote(notice.titles[0])}.`
        : `You can keep ${MAX_CHATS} chats, so I deleted the oldest ones: ${notice.titles.map(quote).join(', ')}.`;
  }
}

// Above the composer, not in the list: on a phone the drawer is usually
// closed. The live region stays mounted, so a screen reader hears each new
// notice as it appears.
export function HistoryNotice({ notice, onDismiss }: HistoryNoticeProps) {
  const dismissKind =
    notice?.kind === 'unavailable' || notice?.kind === 'evicted' ? notice.kind : null;

  return (
    <div role="status" className="shrink-0">
      {notice && (
        <div className="mx-auto w-full max-w-2xl px-5 pt-3">
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low px-5 py-3 text-[13px] text-on-surface-variant">
            <p className="flex items-start gap-2">
              <Info size={16} className="mt-0.5 shrink-0" />
              {noticeText(notice)}
            </p>
            {dismissKind && (
              <button
                type="button"
                onClick={() => onDismiss(dismissKind)}
                className="shrink-0 font-semibold text-primary hover:opacity-70"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
