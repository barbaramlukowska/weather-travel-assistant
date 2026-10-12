interface ChatFullNoticeProps {
  onNewChat: () => void;
}

// Takes the composer's place: the chat stays readable, but nothing more can
// be sent — the route would answer 413, and every try costs paid requests.
export function ChatFullNotice({ onNewChat }: ChatFullNoticeProps) {
  return (
    <div className="shrink-0 pt-6">
      <div className="mx-auto w-full max-w-2xl px-5 pb-5">
        <div
          role="status"
          className="flex flex-col items-start gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container-low px-5 py-4 text-[14px] sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            This chat is full. Start a new one to keep going. This one stays here to read, and your
            saved preferences carry over.
          </p>
          <button
            type="button"
            onClick={onNewChat}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            Start a new chat
          </button>
        </div>
      </div>
    </div>
  );
}
