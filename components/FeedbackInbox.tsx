import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bug,
  Check,
  ChevronRight,
  Clock3,
  Inbox,
  Lightbulb,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getMyFeedbackThread,
  listMyFeedback,
  replyToFeedback,
  type FeedbackThread,
  type MyFeedbackItem,
} from "@/lib/supabase/resources/feedback";
import { cn } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  pending: "Modtaget",
  review: "Under gennemgang",
  planned: "Planlagt",
  in_progress: "Vi arbejder på det",
  completed: "Udgivet",
  declined: "Ikke planlagt",
  duplicate: "Samlet med en anden sag",
};

const conversationCopy: Record<
  string,
  { label: string; icon: typeof Clock3 }
> = {
  awaiting_staff: {
    label: "Afventer BetterLectio",
    icon: Clock3,
  },
  awaiting_user: {
    label: "Dit svar mangler",
    icon: MessageCircle,
  },
  resolved: {
    label: "Samtalen er afsluttet",
    icon: Check,
  },
};

const categoryMeta = {
  bug: { icon: Bug },
  idea: { icon: Lightbulb },
  other: { icon: MoreHorizontal },
} as const;

function title(item: MyFeedbackItem) {
  const value =
    item.title?.trim() || item.message.trim().split("\n")[0] || "Feedback";
  return value.length > 64 ? `${value.slice(0, 61)}…` : value;
}

function formatDate(value: string, includeTime = false) {
  return new Date(value).toLocaleString("da-DK", {
    day: "numeric",
    month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function formatListDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("da-DK", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

function InboxLoading() {
  return (
    <div className="flex flex-col gap-1 p-2" aria-label="Henter samtaler">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-3 rounded-xl p-3">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminAvatar() {
  return (
    <div
      className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[10px] font-bold tracking-[-0.03em] text-primary-foreground"
      aria-hidden="true"
    >
      BL
    </div>
  );
}

export function FeedbackInbox({
  onCompose,
  onClose,
  onUnreadCountChange,
}: {
  onCompose: () => void;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<MyFeedbackItem[]>([]);
  const [thread, setThread] = useState<FeedbackThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listMyFeedback());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente feedback");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  useEffect(() => {
    if (!loading) {
      onUnreadCountChange?.(items.filter((item) => item.is_unread).length);
    }
  }, [items, loading, onUnreadCountChange]);

  useEffect(() => {
    if (!thread) return;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [thread?.item.id, thread?.comments.length]);

  useEffect(() => {
    const textarea = replyRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [reply]);

  const openThread = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      setThread(await getMyFeedbackThread(id));
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, is_unread: false } : item,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente beskeden");
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async () => {
    const body = reply.trim();
    if (!thread || !body || sending) return;

    const activeThread = thread;
    const optimisticId = `pending-${Date.now()}`;
    const now = new Date().toISOString();
    setReply("");
    setSending(true);
    setError(null);
    setThread({
      ...activeThread,
      comments: [
        ...activeThread.comments,
        {
          id: optimisticId,
          created_at: now,
          updated_at: now,
          author_kind: "user",
          body,
        },
      ],
    });

    try {
      await replyToFeedback(activeThread.item.id, body);
      setThread(await getMyFeedbackThread(activeThread.item.id));
    } catch (e) {
      setThread(activeThread);
      setReply(body);
      setError(e instanceof Error ? e.message : "Kunne ikke sende svaret");
    } finally {
      setSending(false);
      requestAnimationFrame(() => replyRef.current?.focus());
    }
  };

  const unreadCount = useMemo(
    () => items.filter((item) => item.is_unread).length,
    [items],
  );

  if (thread) {
    const state =
      conversationCopy[thread.item.conversation_state] ??
      conversationCopy.awaiting_staff;
    const StateIcon = state.icon;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border/60 px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setThread(null);
              setReply("");
              void loadItems();
            }}
            aria-label="Tilbage til samtaler"
          >
            <ArrowLeft />
          </Button>
          <AdminAvatar />
          <div className="min-w-0 flex-1">
            <p
              id="bl-feedback-title"
              className="m-0 truncate text-sm font-semibold leading-tight"
            >
              {title(thread.item)}
            </p>
            <p className="m-0 mt-1 text-[11px] leading-none text-muted-foreground">
              Samtale med BetterLectio
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Luk"
          >
            <X />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted/20">
          <div className="mx-auto flex w-full max-w-[38rem] flex-col gap-5 px-4 py-5">
            <div className="flex items-center justify-center gap-1.5">
              <Badge
                variant={
                  thread.item.conversation_state === "awaiting_user"
                    ? "default"
                    : "secondary"
                }
                className="gap-1.5 px-2.5 py-1"
              >
                <StateIcon />
                {state.label}
              </Badge>
              <Badge variant="outline">
                {statusLabel[thread.item.status] ?? thread.item.status}
              </Badge>
            </div>

            <div className="flex justify-end gap-2 pl-12">
              <div className="flex max-w-[88%] flex-col items-end gap-1">
                <div className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-xs">
                  <p className="m-0 whitespace-pre-wrap break-words">
                    {thread.item.message}
                  </p>
                </div>
                <time className="px-1 text-[10px] tabular-nums text-muted-foreground">
                  {formatDate(thread.item.created_at, true)}
                </time>
              </div>
            </div>

            {thread.comments.map((comment) => {
              const fromUser = comment.author_kind === "user";
              const pending = comment.id.startsWith("pending-");
              return (
                <div
                  key={comment.id}
                  className={cn(
                    "flex items-end gap-2",
                    fromUser ? "justify-end pl-12" : "pr-10",
                  )}
                >
                  {!fromUser ? <AdminAvatar /> : null}
                  <div
                    className={cn(
                      "flex max-w-[88%] flex-col gap-1",
                      fromUser ? "items-end" : "items-start",
                    )}
                  >
                    {!fromUser ? (
                      <span className="px-1 text-[10px] font-semibold text-muted-foreground">
                        BetterLectio
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-xs",
                        fromUser
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md border border-border/70 bg-background text-foreground",
                        pending && "opacity-70",
                      )}
                    >
                      <p className="m-0 whitespace-pre-wrap break-words">
                        {comment.body}
                      </p>
                    </div>
                    <time className="px-1 text-[10px] tabular-nums text-muted-foreground">
                      {pending
                        ? "Sender…"
                        : formatDate(comment.created_at, true)}
                    </time>
                  </div>
                </div>
              );
            })}

            {thread.status_events.length > 1 ? (
              <details className="group self-center text-center text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none rounded-md px-2 py-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  Vis sagens historik
                </summary>
                <div className="mt-2 flex min-w-52 flex-col gap-2 rounded-xl border border-border/70 bg-background p-3 text-left shadow-xs">
                  {thread.status_events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between gap-4"
                    >
                      <span>
                        {statusLabel[event.to_status] ?? event.to_status}
                      </span>
                      <time className="shrink-0 tabular-nums">
                        {formatDate(event.created_at)}
                      </time>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-border/60 bg-background p-3">
          <div className="mx-auto flex max-w-[38rem] items-end gap-2 rounded-2xl border border-input bg-muted/25 p-1.5 pl-3 transition-[border-color,box-shadow] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
            <textarea
              ref={replyRef}
              value={reply}
              onInput={(event) => setReply(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.isComposing
                ) {
                  event.preventDefault();
                  void sendReply();
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Skriv et svar…"
              aria-label="Svar til BetterLectio"
              className="min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground"
            />
            <Button
              type="button"
              size="icon"
              disabled={!reply.trim() || sending}
              onClick={() => void sendReply()}
              aria-label={sending ? "Sender svar" : "Send svar"}
              className="rounded-xl"
            >
              <Send />
            </Button>
          </div>
          <div className="mx-auto mt-1.5 flex max-w-[38rem] items-center justify-between px-1">
            <p className="m-0 text-[10px] text-muted-foreground">
              Enter sender · Shift+Enter laver ny linje
            </p>
            {reply.length > 3600 ? (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {reply.length}/4000
              </span>
            ) : null}
          </div>
          {error ? (
            <p
              role="alert"
              className="mx-auto mt-2 max-w-[38rem] rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
        </footer>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border/60 px-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageCircle className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 id="bl-feedback-title" className="m-0 text-sm font-semibold">
              Dine samtaler
            </h2>
            {unreadCount > 0 ? (
              <Badge className="min-w-5 px-1.5">{unreadCount}</Badge>
            ) : null}
          </div>
          <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">
            Skriv direkte med BetterLectio
          </p>
        </div>
        <Button type="button" size="sm" onClick={onCompose}>
          <Plus data-icon="inline-start" />
          Ny besked
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Luk"
        >
          <X />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <InboxLoading />
        ) : error && items.length === 0 ? (
          <div className="flex h-full min-h-80 flex-col items-center justify-center px-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <X className="size-5" />
            </div>
            <h3 className="m-0 mt-4 text-sm font-semibold">
              Samtalerne kunne ikke hentes
            </h3>
            <p className="m-0 mt-1.5 max-w-64 text-xs leading-relaxed text-muted-foreground">
              Prøv igen om et øjeblik. Din eksisterende feedback er ikke væk.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => void loadItems()}
            >
              Prøv igen
            </Button>
          </div>
        ) : items.length ? (
          <div className="flex flex-col gap-1 p-2">
            {items.map((item) => {
              const meta = categoryMeta[item.category] ?? categoryMeta.other;
              const Icon = meta.icon;
              const preview = item.last_reply?.trim() || item.message.trim();
              const state =
                conversationCopy[item.conversation_state] ??
                conversationCopy.awaiting_staff;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openThread(item.id)}
                  className={cn(
                    "group flex min-h-20 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors",
                    "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                    item.is_unread && "bg-primary/[0.06]",
                  )}
                >
                  <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
                    <Icon className="size-4" />
                    {item.is_unread ? (
                      <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-primary" />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          item.is_unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {title(item)}
                      </span>
                      <time className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {formatListDate(item.last_public_activity_at)}
                      </time>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {preview}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        item.conversation_state === "awaiting_user"
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {state.label} · {statusLabel[item.status] ?? item.status}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-80 flex-col items-center justify-center px-8 text-center">
            <div className="relative mb-5">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Inbox className="size-6" />
              </div>
              <Sparkles className="absolute -right-3 -top-2 size-4 text-primary" />
            </div>
            <h3 className="m-0 text-base font-semibold">Start en samtale</h3>
            <p className="m-0 mt-2 max-w-64 text-sm leading-relaxed text-muted-foreground">
              Fortæl os om en fejl eller en idé. Når vi svarer, fortsætter
              samtalen lige her.
            </p>
            <Button type="button" className="mt-5" onClick={onCompose}>
              <MessageCircle data-icon="inline-start" />
              Skriv til os
            </Button>
          </div>
        )}
      </div>

      {!loading ? (
        <footer className="shrink-0 border-t border-border/60 px-4 py-3 text-center">
          <p className="m-0 text-[11px] text-muted-foreground">
            Beskederne er private mellem dig og BetterLectio.
          </p>
        </footer>
      ) : null}

      {error && items.length > 0 ? (
        <div className="shrink-0 px-3 pb-3">
          <p
            role="alert"
            className="m-0 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        </div>
      ) : null}
    </div>
  );
}
