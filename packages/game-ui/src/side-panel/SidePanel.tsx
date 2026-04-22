import { MessageCircle, PanelRightClose, PanelRightOpen, ScrollText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const message = t(entry.messageKey, { defaultValue: entry.messageKey, ...entry.messageParams });
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
      {entry.actorId ? <span className="font-semibold mr-1">{entry.actorId}</span> : null}
      <span>{message}</span>
    </div>
  );
}

function ChatPlaceholder() {
  const { t } = useTranslation('game-ui');
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 text-xs text-muted-foreground text-center">
        {t('sidepanel.chat.comingSoon')}
      </div>
      <div className="border-t border-border p-2">
        <input
          type="text"
          disabled
          placeholder={t('sidepanel.chat.placeholder')}
          className="w-full text-xs px-3 py-2 rounded-[8px] border-2 border-border bg-muted/50 placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof ScrollText;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold border-2 transition-all ${
        active
          ? 'bg-[#fef3e0] border-warning text-[#7a4006] shadow-button'
          : 'bg-card border-foreground text-muted-foreground shadow-[#3d2e1e_-2px_2px_0px] hover:-translate-y-0.5'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function RailIcon({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof ScrollText;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex items-center justify-center size-8 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

interface PanelBodyProps {
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
  entries: LogEntry[];
  onCollapse: () => void;
  t: ReturnType<typeof useTranslation>['t'];
}

function PanelBody({ activeTab, setActiveTab, entries, onCollapse, t }: PanelBodyProps) {
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
        {activeTab === 'log' ? <LogList entries={entries} /> : <ChatPlaceholder />}
      </div>
    </>
  );
}

export function SidePanel() {
  const { t } = useTranslation('game-ui');
  const [expanded, setExpanded] = useState<boolean>(readInitialExpanded);
  const [activeTab, setActiveTab] = useState<TabId>('log');
  const { entries } = useGameLog();

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
              onCollapse={() => setExpanded(false)}
              t={t}
            />
          </aside>
        </>
      )}
    </>
  );
}
