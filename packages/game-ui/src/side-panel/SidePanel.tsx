import {
  ArrowDown,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  ScrollText,
  Send,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameChat } from '../chat/index';
import { useGameLog } from '../log/index';
import type { LogEntry } from '../log/types';

const STORAGE_KEY = 'sidepanel.expanded';

type TabId = 'log' | 'chat';

function readInitialExpanded(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  return false;
}

function LogList({ entries }: { entries: LogEntry[] }) {
  const { t } = useTranslation('game-ui');
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-8">
        <ScrollText className="w-12 h-12 text-foreground/30" strokeWidth={1.5} />
        <div className="text-xs text-center text-muted-foreground">{t('sidepanel.log.empty')}</div>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 text-xs">
      {entries.map((e) => (
        <LogRow key={e.id} entry={e} />
      ))}
    </div>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const { t } = useTranslation();
  const { playerNames } = useGameLog();
  const message = t(entry.messageKey, { defaultValue: entry.messageKey, ...entry.messageParams });
  const actorDisplay = entry.actorId ? (playerNames[entry.actorId] ?? entry.actorId) : null;
  const containerClass =
    entry.kind === 'system'
      ? 'bg-muted/40 border-l-2 border-border/60 text-muted-foreground'
      : entry.kind === 'action'
        ? 'bg-card border-l-2 border-warning/70 text-foreground'
        : 'bg-transparent border-l-2 border-border/30 text-muted-foreground italic';
  return (
    <div
      data-kind={entry.kind}
      className={`leading-snug break-words rounded-r-[6px] px-2 py-1.5 ${containerClass}`}
    >
      {actorDisplay ? <span className="font-semibold mr-1">{actorDisplay}</span> : null}
      <span>{message}</span>
    </div>
  );
}

function ChatPane() {
  const { t } = useTranslation('game-ui');
  const { messages, send, myId } = useGameChat();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [newIncoming, setNewIncoming] = useState(false);

  function scrollToBottom() {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setNewIncoming(false);
  }

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    atBottomRef.current = atBottom;
    if (atBottom) setNewIncoming(false);
  }

  // On new message: auto-scroll only if user is already near the bottom.
  // Otherwise show a "new messages" pill so scrollback isn't yanked away.
  // biome-ignore lint/correctness/useExhaustiveDependencies: depend on count, not the ref
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setNewIncoming(true);
    }
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    send(text);
    setText('');
    // Sending pins you to the bottom so you see your own message.
    requestAnimationFrame(scrollToBottom);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 text-xs"
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-8">
            <MessageCircle className="w-12 h-12 text-foreground/30" strokeWidth={1.5} />
            <div className="text-xs text-center text-muted-foreground">
              {t('sidepanel.chat.empty')}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.from === myId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                {!mine && (
                  <div className="text-[10px] text-muted-foreground mb-0.5 px-1">{m.fromName}</div>
                )}
                <div
                  className={`max-w-[85%] rounded-[10px] px-3 py-1.5 break-words leading-snug ${
                    mine
                      ? 'bg-[#fef3e0] border-2 border-warning text-[#7a4006]'
                      : 'bg-card border-2 border-foreground text-foreground'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {newIncoming && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-14 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1 border-2 border-warning bg-[#fef3e0] text-[#7a4006] shadow-[2px_2px_0px_0px_#d97706] hover:-translate-y-[calc(-50%+1px)] transition-all"
        >
          <ArrowDown className="w-3 h-3" />
          {t('sidepanel.chat.newMessages')}
        </button>
      )}

      <form onSubmit={handleSubmit} className="border-t border-border p-2 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={t('sidepanel.chat.placeholder')}
          className="flex-1 text-xs px-3 py-2 rounded-[8px] border-2 border-foreground bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-warning/30"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label={t('sidepanel.chat.send')}
          className="flex items-center justify-center w-9 rounded-[8px] border-2 border-foreground bg-[#fef3e0] text-[#7a4006] shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 transition-all"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}

function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
  badge,
}: {
  active: boolean;
  label: string;
  icon: typeof ScrollText;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold border-2 transition-all ${
        active
          ? 'bg-[#fef3e0] border-warning text-[#7a4006] shadow-button'
          : 'bg-card border-foreground text-muted-foreground shadow-[#3d2e1e_-2px_2px_0px] hover:-translate-y-0.5'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-1 inline-flex items-center justify-center rounded-full bg-destructive text-white text-[10px] font-bold border border-foreground leading-none">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function RailIcon({
  label,
  icon: Icon,
  onClick,
  badge,
}: {
  label: string;
  icon: typeof ScrollText;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative flex items-center justify-center size-8 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
    >
      <Icon className="w-4 h-4" />
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-0.5 right-0.5 min-w-[0.9rem] h-[0.9rem] px-0.5 inline-flex items-center justify-center rounded-full bg-destructive text-white text-[9px] font-bold leading-none border border-card">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

interface PanelBodyProps {
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
  entries: LogEntry[];
  unreadChat: number;
  onCollapse: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}

function PanelBody({
  activeTab,
  setActiveTab,
  entries,
  unreadChat,
  onCollapse,
  t,
}: PanelBodyProps) {
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 border-b-2 border-foreground bg-secondary/60">
        <TabButton
          active={activeTab === 'log'}
          label={t('sidepanel.tab.log')}
          icon={ScrollText}
          onClick={() => setActiveTab('log')}
        />
        <TabButton
          active={activeTab === 'chat'}
          label={t('sidepanel.tab.chat')}
          icon={MessageCircle}
          onClick={() => setActiveTab('chat')}
          badge={activeTab === 'chat' ? 0 : unreadChat}
        />
        <button
          type="button"
          onClick={onCollapse}
          aria-label={t('sidepanel.collapse')}
          title={t('sidepanel.collapse')}
          className="ml-auto flex items-center justify-center size-7 rounded-[8px] border-2 border-foreground bg-card text-foreground shadow-[#3d2e1e_-2px_2px_0px] hover:-translate-y-0.5 transition-all"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        {activeTab === 'log' ? <LogList entries={entries} /> : <ChatPane />}
      </div>
    </>
  );
}

export function SidePanel() {
  const { t } = useTranslation('game-ui');
  const [expanded, setExpanded] = useState<boolean>(readInitialExpanded);
  const [activeTab, setActiveTab] = useState<TabId>('log');
  const { entries } = useGameLog();
  const { messages, myId } = useGameChat();

  // Track the id of the last chat message that was "seen" (chat tab was
  // active and panel expanded when it arrived). Everything after that id
  // from other players counts as unread.
  const [lastReadId, setLastReadId] = useState<string | null>(null);

  // Initial mount: start already caught up — history messages aren't "unread".
  useEffect(() => {
    if (lastReadId === null && messages.length > 0) {
      setLastReadId(messages[messages.length - 1].id);
    }
  }, [messages, lastReadId]);

  // Viewing chat: mark whatever arrives as read.
  useEffect(() => {
    if (activeTab === 'chat' && expanded && messages.length > 0) {
      setLastReadId(messages[messages.length - 1].id);
    }
  }, [activeTab, expanded, messages]);

  const unreadChat = useMemo(() => {
    if (lastReadId === null) return 0;
    const idx = messages.findIndex((m) => m.id === lastReadId);
    const after = idx === -1 ? messages : messages.slice(idx + 1);
    return after.filter((m) => m.from !== myId).length;
  }, [messages, lastReadId, myId]);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(expanded));
    }
  }, [expanded]);

  const sortedEntries = useMemo(() => entries, [entries]);

  function openToTab(tab: TabId) {
    setActiveTab(tab);
    setExpanded(true);
  }

  return (
    <>
      {/* Rail - always visible on desktop when collapsed; hidden on mobile */}
      {!expanded && (
        <aside
          data-testid="side-panel-rail"
          className="hidden md:flex flex-col items-center gap-1 w-11 py-2 border-l-2 border-border bg-card/60 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t('sidepanel.expand')}
            title={t('sidepanel.expand')}
            className="flex items-center justify-center size-8 rounded-[8px] border-2 border-foreground bg-card text-foreground shadow-[#3d2e1e_-2px_2px_0px] hover:-translate-y-0.5 hover:shadow-button transition-all"
          >
            <PanelRightOpen className="w-3.5 h-3.5" />
          </button>
          <RailIcon
            label={t('sidepanel.tab.log')}
            icon={ScrollText}
            onClick={() => openToTab('log')}
          />
          <RailIcon
            label={t('sidepanel.tab.chat')}
            icon={MessageCircle}
            onClick={() => openToTab('chat')}
            badge={unreadChat}
          />
        </aside>
      )}

      {/* Desktop expanded - inline column */}
      {expanded && (
        <aside
          data-testid="side-panel-desktop"
          className="hidden md:flex flex-col w-64 lg:w-72 border-l-2 border-border bg-card/90 backdrop-blur-sm"
        >
          <PanelBody
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            entries={sortedEntries}
            unreadChat={unreadChat}
            onCollapse={() => setExpanded(false)}
            t={t}
          />
        </aside>
      )}

      {/* Mobile FAB - shown when collapsed on small screens */}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={t('sidepanel.expand')}
          className="md:hidden fixed right-4 bottom-4 z-40 w-12 h-12 rounded-[14px] bg-card border-2 border-foreground shadow-button hover:-translate-y-0.5 hover:shadow-button-hover active:translate-y-px active:shadow-button-active flex items-center justify-center text-foreground transition-all"
        >
          <ScrollText className="w-5 h-5" />
          {unreadChat > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-[1.25rem] px-1 inline-flex items-center justify-center rounded-full bg-destructive text-white text-[10px] font-bold border-2 border-card leading-none">
              {unreadChat > 9 ? '9+' : unreadChat}
            </span>
          )}
        </button>
      )}

      {/* Mobile drawer overlay */}
      {expanded && (
        <>
          <button
            type="button"
            aria-label={t('sidepanel.collapse')}
            onClick={() => setExpanded(false)}
            className="md:hidden fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
          />
          <aside
            data-testid="side-panel-mobile"
            className="md:hidden fixed right-0 top-0 bottom-0 z-50 w-[85vw] max-w-sm bg-card border-l-2 border-foreground flex flex-col shadow-card"
          >
            <PanelBody
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              entries={sortedEntries}
              unreadChat={unreadChat}
              onCollapse={() => setExpanded(false)}
              t={t}
            />
          </aside>
        </>
      )}
    </>
  );
}
