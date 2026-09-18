import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Inbox, Loader2, Send, X } from 'lucide-react';

import {
  getMyFeedbackThread,
  listMyFeedback,
  replyToFeedback,
  type FeedbackThread,
  type MyFeedbackItem,
} from '@/lib/supabase/resources/feedback';

const statusLabel: Record<string, string> = {
  pending: 'Modtaget',
  review: 'Vi undersøger det',
  planned: 'Planlagt',
  in_progress: 'I gang',
  completed: 'Udgivet',
  declined: 'Ikke planlagt',
  duplicate: 'Knyttet til anden sag',
};
const conversationLabel: Record<string, string> = {
  awaiting_staff: 'Venter på BetterLectio',
  awaiting_user: 'Venter på dig',
  resolved: 'Løst',
};

function title(item: MyFeedbackItem) {
  const value =
    item.title?.trim() || item.message.trim().split('\n')[0] || 'Feedback';
  return value.length > 55 ? `${value.slice(0, 52)}…` : value;
}

export function FeedbackInbox({
  onCompose,
  onClose,
}: {
  onCompose: () => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MyFeedbackItem[]>([]);
  const [thread, setThread] = useState<FeedbackThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listMyFeedback());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke hente feedback');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadItems();
  }, []);

  const openThread = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setThread(await getMyFeedbackThread(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke hente beskeden');
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async () => {
    if (!thread || !reply.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await replyToFeedback(thread.item.id, reply);
      setReply('');
      setThread(await getMyFeedbackThread(thread.item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke sende');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex max-h-[min(70vh,560px)] flex-col">
      <div className="flex min-h-12 items-center gap-2 border-b border-border/60 px-3">
        {thread ? (
          <button
            type="button"
            onClick={() => {
              setThread(null);
              void loadItems();
            }}
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Tilbage"
          >
            <ArrowLeft className="size-4" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-sm font-semibold">
            {thread ? title(thread.item) : 'Min feedback'}
          </h2>
        </div>
        {!thread ? (
          <button
            type="button"
            onClick={onCompose}
            className="min-h-10 rounded-lg px-2.5 text-xs font-medium text-primary hover:bg-primary/10"
          >
            Ny besked
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Luk"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : thread ? (
          <div className="space-y-3 p-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full bg-background px-2 py-1">
                  {conversationLabel[thread.item.conversation_state] ??
                    thread.item.conversation_state}
                </span>
                <span className="rounded-full bg-background px-2 py-1">
                  {statusLabel[thread.item.status] ?? thread.item.status}
                </span>
              </div>
              <p className="m-0 whitespace-pre-wrap text-sm text-foreground">
                {thread.item.message}
              </p>
            </div>
            {thread.status_events.length > 1 ? (
              <div className="rounded-xl border border-border/70 px-3 py-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Forløb
                </p>
                {thread.status_events.map((event) => (
                  <div
                    key={event.id}
                    className="mt-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <span>
                      {statusLabel[event.to_status] ?? event.to_status}
                    </span>
                    <time className="shrink-0 text-muted-foreground tabular-nums">
                      {new Date(event.created_at).toLocaleDateString('da-DK', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </time>
                  </div>
                ))}
              </div>
            ) : null}
            {thread.comments.map((comment) => (
              <div
                key={comment.id}
                className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${comment.author_kind === 'user' ? 'ml-auto rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border border-border bg-background'}`}
              >
                <p className="m-0 whitespace-pre-wrap">{comment.body}</p>
                <time className="mt-1 block text-xs opacity-60">
                  {new Date(comment.created_at).toLocaleString('da-DK', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            ))}
          </div>
        ) : items.length ? (
          <div>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void openThread(item.id)}
                className="flex min-h-20 w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left hover:bg-muted/40"
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${item.is_unread ? 'bg-primary' : 'bg-border'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {title(item)}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {conversationLabel[item.conversation_state] ??
                      item.conversation_state}{' '}
                    · {statusLabel[item.status] ?? item.status}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="mt-3 mb-0 text-sm font-medium">
              Ingen beskeder endnu
            </p>
            <button
              type="button"
              onClick={onCompose}
              className="mt-3 min-h-10 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground"
            >
              Send feedback
            </button>
          </div>
        )}
      </div>

      {thread ? (
        <div className="border-t border-border p-3">
          <textarea
            value={reply}
            onInput={(event) => setReply(event.currentTarget.value)}
            rows={3}
            maxLength={4000}
            placeholder="Skriv et svar…"
            className="w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={!reply.trim() || sending}
              onClick={() => void sendReply()}
              className="flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-45"
            >
              <Send className="size-3.5" />
              {sending ? 'Sender…' : 'Send svar'}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="m-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
