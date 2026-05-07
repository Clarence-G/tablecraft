import { useGameHeaderStatus } from '@repo/game-ui';
import { GameOverModal } from '@repo/game-ui/feedback';
import { PlayerBadge } from '@repo/game-ui/player';
import type { BoardProps } from '@repo/shared';
import { Coins, Crown, Gem, ShoppingCart, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import {
  type Action,
  type Card,
  GEMS,
  type Gem as GemColor,
  type GemCount,
  MAX_GEMS,
  MAX_RESERVED,
  type Noble,
  type PlayerView,
  type Token,
  type TokenCount,
  WIN_POINTS,
  emptyGemCount,
  emptyTokenCount,
} from './shared';

// ---- Gem color palette (matches DESIGN.md 六色 where possible) ----
//
// Canonical game-mechanic palette: a ruby IS red, an emerald IS green, etc.
// These hexes intentionally bypass semantic tokens (--destructive, --success,
// --warning, --foreground) so that gem identity survives theme changes.
// Consumed as inline style values, not Tailwind classes.

const GEM_BG: Record<Token, string> = {
  white: '#faf5eb',
  blue: '#2563eb',
  green: '#16a34a',
  red: '#d94040',
  black: '#1a1108',
  gold: '#d97706',
};

const GEM_FG: Record<Token, string> = {
  white: '#1a1108',
  blue: '#ffffff',
  green: '#ffffff',
  red: '#ffffff',
  black: '#faf5eb',
  gold: '#ffffff',
};

// ---- Presentational components ----

function GemToken({
  color,
  count,
  size = 'md',
  onClick,
  disabled,
  selected,
}: {
  color: Token;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const { t } = useTranslation('splendor');
  const dims =
    size === 'sm'
      ? 'w-7 h-7 text-[10px]'
      : size === 'lg'
        ? 'w-12 h-12 text-base'
        : 'w-10 h-10 text-sm';
  const Elem = onClick ? 'button' : 'div';
  return (
    <Elem
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`${dims} inline-flex items-center justify-center rounded-full border-2 font-bold transition-all select-none
        ${selected ? 'ring-2 ring-warning -translate-y-0.5' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''}
      `}
      style={{
        background: GEM_BG[color],
        color: GEM_FG[color],
        borderColor: 'hsl(var(--shadow))',
      }}
    >
      {count === undefined ? t(`gem.${color}`) : count}
    </Elem>
  );
}

function CostRow({ cost, bonuses }: { cost: GemCount; bonuses?: GemCount }) {
  const { t } = useTranslation('splendor');
  const nonZero = GEMS.filter((g) => cost[g] > 0);
  if (nonZero.length === 0)
    return <span className="text-xs text-muted-foreground">{t('card.noCost')}</span>;
  return (
    <div className="flex gap-1 flex-wrap">
      {nonZero.map((g) => {
        const discounted = bonuses ? Math.max(0, cost[g] - bonuses[g]) : cost[g];
        const hasDiscount = bonuses && cost[g] > discounted;
        return (
          <span
            key={g}
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              background: GEM_BG[g],
              color: GEM_FG[g],
              border: '1.5px solid hsl(var(--shadow))',
            }}
          >
            {hasDiscount ? (
              <>
                <span className="line-through opacity-60">{cost[g]}</span>
                <span>{discounted}</span>
              </>
            ) : (
              <span>{cost[g]}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function CardFace({
  card,
  bonuses,
  onClick,
  disabled,
  compact,
}: {
  card: Card;
  bonuses?: GemCount;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const Elem = onClick ? 'button' : 'div';
  const sizeClass = compact ? 'w-20 h-28 p-1.5' : 'w-24 h-32 p-2';
  return (
    <Elem
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`${sizeClass} flex flex-col justify-between rounded-[10px] bg-card border-2 border-foreground transition-all shadow-[3px_3px_0px_0px_hsl(var(--foreground))]
        ${disabled ? 'opacity-50 cursor-not-allowed' : onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''}
      `}
    >
      <div className="flex justify-between items-start">
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
          style={{
            background: GEM_BG[card.bonus],
            color: GEM_FG[card.bonus],
            border: '2px solid hsl(var(--shadow))',
          }}
        >
          +1
        </span>
        {card.points > 0 && (
          <span className="text-lg font-black text-foreground leading-none">{card.points}</span>
        )}
      </div>
      <div>
        <CostRow cost={card.cost} bonuses={bonuses} />
      </div>
    </Elem>
  );
}

function CardBack({ level, count }: { level: 1 | 2 | 3; count: number }) {
  const { t } = useTranslation('splendor');
  const levelColor =
    level === 1
      ? 'var(--color-jade)'
      : level === 2
        ? 'var(--color-royal-blue)'
        : 'var(--color-crown)';
  return (
    <div
      className="w-20 h-28 sm:w-24 sm:h-32 flex flex-col items-center justify-center rounded-[10px] border-2 border-foreground shadow-[3px_3px_0px_0px_hsl(var(--foreground))] text-white"
      style={{ background: levelColor }}
    >
      <span className="text-xs font-semibold uppercase tracking-wide opacity-90">
        {t('card.tierLabel')}
      </span>
      <span className="text-3xl font-black">{level}</span>
      <span className="text-[10px] opacity-75 mt-1">{t('card.remaining', { count })}</span>
    </div>
  );
}

function NobleCard({
  noble,
  onClick,
  highlighted,
  disabled,
}: {
  noble: Noble;
  onClick?: () => void;
  highlighted?: boolean;
  disabled?: boolean;
}) {
  const Elem = onClick ? 'button' : 'div';
  return (
    <Elem
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`w-20 h-20 sm:w-24 sm:h-24 flex flex-col items-center justify-between p-1.5 rounded-[10px] border-2 border-foreground shadow-[3px_3px_0px_0px_hsl(var(--foreground))] transition-all
        ${highlighted ? 'ring-2 ring-warning -translate-y-0.5' : ''}
        ${disabled ? 'opacity-40' : ''}
      `}
      style={{ background: '#f0e8fe' }}
    >
      <div className="flex items-center gap-1 text-[var(--color-crown)]">
        <Crown className="w-3 h-3" />
        <span className="text-xs font-black">{noble.points}</span>
      </div>
      <CostRow cost={noble.requires} />
    </Elem>
  );
}

// ---- Helpers ----

function tokenSum(tc: TokenCount): number {
  return GEMS.reduce((n, g) => n + tc[g], 0) + tc.gold;
}

function eligibleNobles(nobles: Noble[], bonuses: GemCount): Noble[] {
  return nobles.filter((n) => GEMS.every((g) => bonuses[g] >= n.requires[g]));
}

interface AffordCheck {
  affordable: boolean;
  shortfall: GemCount;
  totalShortfall: number;
  goldSpend: Partial<GemCount>;
  gemsSpent: GemCount;
  goldUsed: number;
}

function checkAfford(card: Card, playerGems: TokenCount, bonuses: GemCount): AffordCheck {
  const shortfall = emptyGemCount();
  const gemsSpent = emptyGemCount();
  const goldSpend: Partial<GemCount> = {};
  let goldUsed = 0;
  let goldAvailable = playerGems.gold;
  let totalShortfall = 0;

  for (const g of GEMS) {
    const netCost = Math.max(0, card.cost[g] - bonuses[g]);
    const have = playerGems[g];
    const useGem = Math.min(netCost, have);
    const need = netCost - useGem;
    gemsSpent[g] = useGem;
    if (need > 0) {
      const useGold = Math.min(need, goldAvailable);
      goldAvailable -= useGold;
      goldUsed += useGold;
      if (useGold > 0) goldSpend[g] = useGold;
      const uncovered = need - useGold;
      if (uncovered > 0) {
        shortfall[g] = uncovered;
        totalShortfall += uncovered;
      }
    }
  }
  return {
    affordable: totalShortfall === 0,
    shortfall,
    totalShortfall,
    goldSpend,
    gemsSpent,
    goldUsed,
  };
}

// ---- Card Dialog ----

function CardDialog({
  card,
  source,
  playerGems,
  bonuses,
  reservedCount,
  supplyGold,
  afford,
  eligibleNobleList,
  claimNoble,
  setClaimNoble,
  onClose,
  onBuy,
  onReserve,
}: {
  card: Card;
  source: 'visible' | 'reserved' | 'deck';
  playerGems: TokenCount;
  bonuses: GemCount;
  reservedCount: number;
  supplyGold: number;
  afford: AffordCheck;
  eligibleNobleList: Noble[];
  claimNoble: string | null;
  setClaimNoble: (id: string | null) => void;
  onClose: () => void;
  onBuy: () => void;
  onReserve: () => void;
}) {
  const { t } = useTranslation('splendor');
  const canReserve = source === 'visible' && reservedCount < MAX_RESERVED;
  const needsNobleChoice = eligibleNobleList.length > 1;
  const buyDisabled = !afford.affordable || (needsNobleChoice && !claimNoble);

  return (
    <div
      className="fixed inset-0 bg-shadow/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      // biome-ignore lint/a11y/useSemanticElements: native <dialog> has conflicting open/modal semantics with our controlled render
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <div
        className="bg-card border-2 border-foreground rounded-[12px] shadow-[4px_4px_0px_0px_hsl(var(--foreground))] p-4 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-xs text-muted-foreground">
              {t('card.detailTitle', { level: card.level })}
            </div>
            <div className="text-sm font-semibold">
              <Trans
                i18nKey="card.discount"
                t={t}
                values={{ gem: t(`gem.${card.bonus}`) }}
                components={{
                  g: <span style={{ color: GEM_BG[card.bonus] }} />,
                }}
              />
              {card.points > 0 && (
                <span className="ml-2">
                  · <Sparkles className="inline w-3 h-3" />{' '}
                  {t('card.prestige', { count: card.points })}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-3 items-start mb-4">
          <CardFace card={card} bonuses={bonuses} />
          <div className="flex-1 text-xs space-y-1">
            <div className="text-muted-foreground">{t('card.netCost')}</div>
            <CostRow cost={afford.gemsSpent} />
            {afford.goldUsed > 0 && (
              <div className="flex items-center gap-1 text-warning">
                <Coins className="w-3 h-3" />
                {t('card.goldCover', { count: afford.goldUsed })}
              </div>
            )}
            {!afford.affordable && (
              <div className="text-destructive text-xs">
                {t('card.shortfall', { count: afford.totalShortfall })}
              </div>
            )}
          </div>
        </div>

        {needsNobleChoice && afford.affordable && (
          <div className="mb-3 p-2 bg-[#f0e8fe] rounded-[8px] border-2 border-[var(--color-crown)]">
            <div className="text-xs font-semibold mb-1 text-[var(--color-crown)]">
              {t('action.nobleSelect')}
            </div>
            <div className="flex gap-2 flex-wrap">
              {eligibleNobleList.map((n) => (
                <NobleCard
                  key={n.id}
                  noble={n}
                  onClick={() => setClaimNoble(n.id)}
                  highlighted={claimNoble === n.id}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {source === 'visible' || source === 'reserved' ? (
            <button
              type="button"
              disabled={buyDisabled}
              onClick={onBuy}
              className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-[10px] border-2 border-shadow font-semibold text-sm transition-all
                ${
                  buyDisabled
                    ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
                    : 'bg-primary text-primary-foreground shadow-[3px_3px_0px_0px_hsl(var(--shadow))] hover:-translate-y-0.5'
                }
              `}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              {t('action.buy')}
            </button>
          ) : null}
          {canReserve && (
            <button
              type="button"
              onClick={onReserve}
              disabled={reservedCount >= MAX_RESERVED}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-[10px] border-2 border-foreground bg-card font-semibold text-sm hover:-translate-y-0.5 transition-all shadow-[3px_3px_0px_0px_hsl(var(--foreground))]"
            >
              <Coins className="w-3.5 h-3.5" />
              {supplyGold > 0 ? t('action.reserveWithGold') : t('action.reserve')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main Board ----

export function Board({
  state,
  myId,
  players,
  sendAction: rawSendAction,
  isSending,
  lastReject,
}: BoardProps<PlayerView, Action>) {
  const { t } = useTranslation('splendor');
  const sendAction = isSending ? () => {} : rawSendAction;
  const isMyTurn = state.currentPlayer === myId;
  const gameOver = !!state.winner;
  useGameHeaderStatus(gameOver ? undefined : state.currentPlayer);
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const me = state.players.find((p) => p.id === myId);

  // Gem selection cart
  const [cart, setCart] = useState<TokenCount>(emptyTokenCount());
  // Discard selection (when overflow)
  const [discard, setDiscard] = useState<TokenCount>(emptyTokenCount());
  // Active card dialog
  const [activeCard, setActiveCard] = useState<{
    card: Card;
    source: 'visible' | 'reserved' | 'deck';
  } | null>(null);
  const [claimNoble, setClaimNoble] = useState<string | null>(null);

  function resetAll() {
    setCart(emptyTokenCount());
    setDiscard(emptyTokenCount());
    setActiveCard(null);
    setClaimNoble(null);
  }

  // ---- Cart handling ----

  const cartTotal = GEMS.reduce((n, g) => n + cart[g], 0);
  const myGemTotal = me ? tokenSum(me.gems) : 0;
  const postTakeTotal = myGemTotal + cartTotal;
  const overflow = Math.max(0, postTakeTotal - MAX_GEMS);
  const discardTotal = GEMS.reduce((n, g) => n + discard[g], 0) + discard.gold;

  function addGemToCart(color: GemColor) {
    if (!isMyTurn) return;
    const currentCartCount = cart[color];
    const cartColors = GEMS.filter((g) => cart[g] > 0);

    // Rules:
    // - Max 3 gems total.
    // - If any color already has 2 (take_two), no other colors allowed.
    // - If 2 of same color desired: supply[color] must be >= 4, and nothing else in cart.
    // - Otherwise up to 3 unique colors.
    if (currentCartCount >= 2) return;
    const hasTwoOfSame = cartColors.some((c) => cart[c] === 2);
    if (hasTwoOfSame) return;

    if (currentCartCount === 1) {
      // Trying to bump to 2 — only if this is the only color AND supply >= 4
      if (cartColors.length === 1 && state.supply[color] >= 4) {
        setCart({ ...cart, [color]: 2 });
      }
      return;
    }
    // currentCartCount === 0 — add if room and supply available
    if (cartTotal >= 3) return;
    if (state.supply[color] <= 0) return;
    setCart({ ...cart, [color]: 1 });
  }

  function clearCart() {
    setCart(emptyTokenCount());
    setDiscard(emptyTokenCount());
  }

  function handleDiscardToggle(t: Token) {
    // The combined total gems the player would have + cart
    const currentDiscard = discard[t];
    const availableAfterTake = (me?.gems[t] ?? 0) + (t === 'gold' ? 0 : (cart[t as GemColor] ?? 0));
    if (currentDiscard + 1 > availableAfterTake) return;
    if (discardTotal >= overflow) return;
    setDiscard({ ...discard, [t]: currentDiscard + 1 });
  }

  function handleDiscardClear() {
    setDiscard(emptyTokenCount());
  }

  function handleConfirmTake() {
    if (!isMyTurn || cartTotal === 0) return;
    if (overflow > 0 && discardTotal !== overflow) return;
    const cartColors = GEMS.filter((g) => cart[g] > 0);
    const isTakeTwo = cartColors.length === 1 && cart[cartColors[0]] === 2;
    const discardPayload: Partial<TokenCount> = {};
    for (const t of [...GEMS, 'gold' as Token]) {
      if (discard[t] > 0) discardPayload[t] = discard[t];
    }
    const action: Action = isTakeTwo
      ? {
          type: 'take_two',
          color: cartColors[0],
          discard: overflow > 0 ? discardPayload : undefined,
        }
      : {
          type: 'take_three',
          colors: cartColors,
          discard: overflow > 0 ? discardPayload : undefined,
        };
    sendAction(action);
    resetAll();
  }

  // ---- Card dialog handlers ----

  const afford = useMemo(() => {
    if (!activeCard || !me) return null;
    return checkAfford(activeCard.card, me.gems, me.bonuses);
  }, [activeCard, me]);

  const eligibleList = useMemo(() => {
    if (!activeCard || !me) return [];
    if (!afford?.affordable) return [];
    const simulatedBonuses = { ...me.bonuses };
    simulatedBonuses[activeCard.card.bonus] += 1;
    return eligibleNobles(state.nobles, simulatedBonuses);
  }, [activeCard, me, afford, state.nobles]);

  function handleBuy() {
    if (!activeCard || !afford || !afford.affordable || !me) return;
    const needsChoice = eligibleList.length > 1;
    if (needsChoice && !claimNoble) return;
    sendAction({
      type: 'buy',
      source: activeCard.source === 'reserved' ? 'reserved' : 'visible',
      cardId: activeCard.card.id,
      gold: Object.keys(afford.goldSpend).length > 0 ? afford.goldSpend : undefined,
      claimNoble: eligibleList.length === 1 ? undefined : (claimNoble ?? undefined),
    });
    resetAll();
  }

  function handleReserve() {
    if (!activeCard || !me) return;
    const postGems = myGemTotal + (state.supply.gold > 0 && tokenSum(me.gems) < MAX_GEMS ? 1 : 0);
    if (postGems > MAX_GEMS) {
      // Simplification: auto-discard is not supported in the dialog.
      // User must first play a take action to reduce gems or accept the overflow reject.
    }
    sendAction({
      type: 'reserve',
      source: 'visible',
      level: activeCard.card.level,
      cardId: activeCard.card.id,
    });
    resetAll();
  }

  function handleReserveDeck(level: 1 | 2 | 3) {
    if (!isMyTurn) return;
    if ((me?.reservedCount ?? 0) >= MAX_RESERVED) return;
    if (state.deckCounts[level] === 0) return;
    sendAction({ type: 'reserve', source: 'deck', level });
  }

  // ---- Derived UI state ----

  const rankingOrder = useMemo(() => {
    if (!gameOver) return [];
    const ids = state.players.map((p) => p.id);
    const byId = new Map(state.players.map((p) => [p.id, p]));
    return ids.sort((a, b) => {
      const pa = byId.get(a);
      const pb = byId.get(b);
      if (!pa || !pb) return 0;
      if (pb.points !== pa.points) return pb.points - pa.points;
      return pa.cardCount - pb.cardCount;
    });
  }, [gameOver, state.players]);

  return (
    <div
      className="flex-1 text-foreground p-3 sm:p-4 max-w-5xl mx-auto w-full flex flex-col gap-3"
      data-testid="game-board"
    >
      {/* Header: players + status */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2 items-center justify-center">
          {players.map((p) => {
            const info = state.players.find((sp) => sp.id === p.id);
            return (
              <div key={p.id} className="flex flex-col items-center gap-1">
                <PlayerBadge
                  player={p}
                  isCurrentTurn={state.currentPlayer === p.id}
                  isMe={p.id === myId}
                />
                {info && (
                  <div className="text-xs font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-warning" />
                    {info.points}
                    {info.points >= WIN_POINTS && (
                      <span className="ml-1 text-[10px] uppercase text-warning">
                        {t('status.target')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-center text-sm text-muted-foreground">
          {gameOver
            ? t('status.winner', {
                winner: playerNames[state.winner ?? ''] ?? state.winner,
              })
            : isMyTurn
              ? t('status.yourTurn')
              : t('status.waitingFor', {
                  name: playerNames[state.currentPlayer] ?? state.currentPlayer,
                })}
          {state.lastRoundStartedBy && !gameOver && (
            <span className="ml-2 text-warning">{t('status.lastRound')}</span>
          )}
        </div>
        {lastReject && (
          <div className="text-center text-xs text-destructive bg-destructive/10 rounded-[8px] px-2 py-1 mx-auto border-2 border-destructive">
            {lastReject}
          </div>
        )}
      </div>

      {/* Nobles row */}
      {state.nobles.length > 0 && (
        <div className="flex flex-col items-center gap-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('section.nobles')}
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {state.nobles.map((n) => (
              <NobleCard
                key={n.id}
                noble={n}
                highlighted={me ? GEMS.every((g) => me.bonuses[g] >= n.requires[g]) : false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Gem supply & cart */}
      <div className="bg-card border-2 border-foreground rounded-[12px] shadow-[4px_4px_0px_0px_hsl(var(--foreground))] p-3">
        <div className="flex justify-between items-center mb-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Gem className="w-3 h-3" />
            {t('section.gemSupply')}
          </div>
          {cartTotal > 0 && (
            <button
              type="button"
              onClick={clearCart}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t('action.clearSelection')}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-center items-center">
          {GEMS.map((g) => {
            const supply = state.supply[g];
            const inCart = cart[g];
            return (
              <div key={g} className="flex flex-col items-center gap-0.5">
                <GemToken
                  color={g}
                  size="lg"
                  onClick={() => addGemToCart(g)}
                  disabled={!isMyTurn || supply === 0}
                  selected={inCart > 0}
                />
                <div className="text-[10px] text-muted-foreground">
                  {supply}
                  {inCart > 0 && <span className="ml-0.5 text-warning">+{inCart}</span>}
                </div>
              </div>
            );
          })}
          <div className="flex flex-col items-center gap-0.5">
            <GemToken color="gold" size="lg" />
            <div className="text-[10px] text-muted-foreground">{state.supply.gold}</div>
          </div>
        </div>

        {cartTotal > 0 && (
          <div className="mt-3 pt-3 border-t-2 border-dashed border-border">
            {overflow > 0 && (
              <div className="mb-2">
                <div className="text-xs font-semibold text-destructive mb-1">
                  {t('label.overflow', { overflow, selected: discardTotal })}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {([...GEMS, 'gold'] as Token[]).map((tok) => {
                    const have =
                      (me?.gems[tok] ?? 0) + (tok === 'gold' ? 0 : (cart[tok as GemColor] ?? 0));
                    if (have === 0) return null;
                    return (
                      <button
                        key={tok}
                        type="button"
                        onClick={() => handleDiscardToggle(tok)}
                        className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-border bg-background"
                      >
                        <GemToken color={tok} size="sm" />
                        <span>
                          {have - discard[tok]}
                          {discard[tok] > 0 && (
                            <span className="text-destructive">-{discard[tok]}</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  {discardTotal > 0 && (
                    <button
                      type="button"
                      onClick={handleDiscardClear}
                      className="text-xs text-muted-foreground ml-1"
                    >
                      {t('action.reset')}
                    </button>
                  )}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleConfirmTake}
              disabled={!isMyTurn || (overflow > 0 && discardTotal !== overflow)}
              className="w-full px-4 py-2 rounded-[10px] border-2 border-shadow bg-primary text-primary-foreground font-semibold text-sm shadow-[3px_3px_0px_0px_hsl(var(--shadow))] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {t('action.confirmTakeGems')}
              {cartTotal > 0 && (
                <span className="ml-2 text-xs opacity-80">
                  {t('label.cartSummary', {
                    items: GEMS.filter((g) => cart[g] > 0)
                      .map((g) => t('label.gemCountItem', { count: cart[g], gem: t(`gem.${g}`) }))
                      .join(' + '),
                  })}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Card levels */}
      <div className="flex flex-col gap-2">
        {[3, 2, 1].map((lvl) => {
          const level = lvl as 1 | 2 | 3;
          return (
            <div key={level} className="relative">
              <div className="flex gap-2 items-center overflow-x-auto">
                <button
                  type="button"
                  onClick={() => handleReserveDeck(level)}
                  disabled={
                    !isMyTurn ||
                    state.deckCounts[level] === 0 ||
                    (me?.reservedCount ?? 0) >= MAX_RESERVED
                  }
                  className="shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:-translate-y-0.5 transition-transform"
                  aria-label={t('action.reserveFromDeck', { level })}
                >
                  <CardBack level={level} count={state.deckCounts[level]} />
                </button>
                <div className="flex gap-2">
                  {Array.from({ length: 4 }, (_, idx) => idx).map((slot) => {
                    const card = state.visible[level][slot];
                    return card ? (
                      <CardFace
                        key={card.id}
                        card={card}
                        bonuses={me?.bonuses}
                        onClick={() => isMyTurn && setActiveCard({ card, source: 'visible' })}
                        disabled={!isMyTurn}
                      />
                    ) : (
                      <div
                        key={`empty-${level}-${slot}`}
                        className="w-24 h-32 rounded-[10px] border-2 border-dashed border-border opacity-40"
                      />
                    );
                  })}
                </div>
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-card to-transparent sm:hidden"
              />
            </div>
          );
        })}
      </div>

      {/* My panel */}
      {me && (
        <div className="bg-card border-2 border-foreground rounded-[12px] shadow-[4px_4px_0px_0px_hsl(var(--foreground))] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('section.myRealm')}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('label.myStats', {
                gems: myGemTotal,
                max: MAX_GEMS,
                cards: me.cardCount,
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-start">
            <div className="flex flex-col gap-1">
              <div className="text-[10px] text-muted-foreground">{t('section.gems')}</div>
              <div className="flex gap-1">
                {([...GEMS, 'gold'] as Token[]).map((tok) => (
                  <div key={tok} className="flex flex-col items-center">
                    <GemToken color={tok} size="md" count={me.gems[tok]} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[10px] text-muted-foreground">{t('section.discount')}</div>
              <div className="flex gap-1">
                {GEMS.map((g) => (
                  <GemToken key={g} color={g} size="md" count={me.bonuses[g]} />
                ))}
              </div>
            </div>
          </div>

          {state.myReserved.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-[10px] text-muted-foreground mb-1">
                {t('label.reserved', { count: state.myReserved.length, max: MAX_RESERVED })}
              </div>
              <div className="flex gap-2 flex-wrap">
                {state.myReserved.map((card) => (
                  <CardFace
                    key={card.id}
                    card={card}
                    bonuses={me.bonuses}
                    onClick={() => isMyTurn && setActiveCard({ card, source: 'reserved' })}
                    disabled={!isMyTurn}
                    compact
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Other players compact */}
      {state.players.filter((p) => p.id !== myId).length > 0 && (
        <div className="bg-card border-2 border-foreground rounded-[12px] p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t('section.opponent')}
          </div>
          <div className="flex flex-col gap-2">
            {state.players
              .filter((p) => p.id !== myId)
              .map((p) => (
                <div key={p.id} className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm w-20 truncate">
                    {playerNames[p.id] ?? p.id}
                  </span>
                  <span className="text-xs font-bold flex items-center gap-0.5">
                    <Sparkles className="w-3 h-3 text-warning" />
                    {p.points}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t('label.opponentStats', {
                      cards: p.cardCount,
                      reserved: p.reservedCount,
                    })}
                  </span>
                  <div className="flex gap-0.5 ml-auto">
                    {GEMS.map((g) => (
                      <GemToken key={g} color={g} size="sm" count={p.bonuses[g]} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Card dialog */}
      {activeCard && afford && me && (
        <CardDialog
          card={activeCard.card}
          source={activeCard.source}
          playerGems={me.gems}
          bonuses={me.bonuses}
          reservedCount={me.reservedCount}
          supplyGold={state.supply.gold}
          afford={afford}
          eligibleNobleList={eligibleList}
          claimNoble={claimNoble}
          setClaimNoble={setClaimNoble}
          onClose={() => {
            setActiveCard(null);
            setClaimNoble(null);
          }}
          onBuy={handleBuy}
          onReserve={handleReserve}
        />
      )}

      {/* Game over */}
      {gameOver && <GameOverModal rankings={rankingOrder} playerNames={playerNames} myId={myId} />}
    </div>
  );
}
