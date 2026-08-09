import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../data/constants';
import { CARDS } from '../data/cards';
import { MACRO_EVENTS } from '../data/events';
import { BOARD_SIZE, BOARD_TILES, GO_BONUS } from '../data/board';
import type {
  ActionPayload,
  Card,
  GameEvent,
  GameMode,
  GameState,
  MacroEvent,
  PendingReaction,
  Player,
  PlayCardTarget,
  PropertyColor,
  SpecialEffect,
} from '../types/game';
import { calculateEffectiveRent, getEffectiveActionLimit, getEffectiveDrawCount } from './modifierPipeline';
import { PRNG } from './prng';
import { checkWinner } from './winCondition';
import { tileCard, tileOwner } from './board';

const STARTING_HAND_SIZE = 5;
export const BASE_ACTION_LIMIT = 3;
const HAND_LIMIT = 7;
/** Chance, rolled at each TURN_START, that a new macro event is triggered. */
const MACRO_EVENT_TRIGGER_CHANCE = 0.3;

/** 收數 (DEBT_COLLECTOR) always demands this amount, independent of the card's own bank value. */
const DEBT_COLLECTOR_AMOUNT = 5;
/** 洋樓/酒店 (HOUSE/HOTEL) flat rent bonuses, matching classic Monopoly Deal values. */
const HOUSE_RENT_BONUS = 3;
const HOTEL_RENT_BONUS = 4;
/** No improvements on 交通基建 — mirrors the real game's railroad/utility restriction. */
const NO_IMPROVEMENT_COLOR: PropertyColor = 'TRANSPORT';
/** BOSS_RAID: the co-op win condition must be met by this turn or everyone loses together. */
const BOSS_RAID_TURN_LIMIT = 15;

function emptyField(): Record<PropertyColor, Card[]> {
  const field = {} as Record<PropertyColor, Card[]>;
  for (const color of PROPERTY_COLORS) {
    field[color] = [];
  }
  return field;
}

export function initGame(playerNames: string[], seed: number, mode: GameMode = 'CLASSIC'): GameState {
  const rng = new PRNG(seed);
  // REAL_BIG_DEAL: PROPERTY cards live on the board (see src/data/board.ts), not in the deck —
  // they're acquired by landing on their tile, never by drawing.
  const deckSource = mode === 'REAL_BIG_DEAL' ? CARDS.filter((c) => c.type !== 'PROPERTY') : CARDS;
  const deck = rng.shuffle(deckSource);

  const players: Player[] = playerNames.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    hand: [],
    field: emptyField(),
    bank: [],
    // Seat parity gives fixed 2-person teams (seats 1&3 vs 2&4) without needing explicit
    // team-selection UI — mirrors sitting across from your partner at a real table.
    ...(mode === 'SYNDICATE' ? { teamId: index % 2 } : {}),
    ...(mode === 'REAL_BIG_DEAL' ? { position: 0 } : {}),
  }));

  for (const player of players) {
    for (let i = 0; i < STARTING_HAND_SIZE; i++) {
      const card = deck.pop();
      if (card) player.hand.push(card);
    }
  }

  // AUCTION_DRAFT replaces the normal draw with a blind cash auction on the top 3 cards, open
  // from turn 1 — there's no TURN_START/draw step in this mode at all.
  const openingAuctionCards = mode === 'AUCTION_DRAFT' ? [deck.pop(), deck.pop(), deck.pop()].filter((c): c is Card => !!c) : [];

  return {
    mode,
    turn: 1,
    activePlayerIndex: 0,
    players,
    deck,
    discardPile: [],
    activeMacroEvents: [],
    rngSeed: rng.getState(),
    phase: mode === 'AUCTION_DRAFT' ? 'AUCTION' : mode === 'REAL_BIG_DEAL' ? 'ROLL' : 'TURN_START',
    actionsPlayedThisTurn: 0,
    ...(mode === 'AUCTION_DRAFT' ? { pendingAuction: { cards: openingAuctionCards, bids: {} } } : {}),
    ...(mode === 'BOSS_RAID' ? { turnLimit: BOSS_RAID_TURN_LIMIT } : {}),
  };
}

export function applyAction(state: GameState, action: ActionPayload): { nextState: GameState; events: GameEvent[] } {
  const nextState = structuredClone(state);
  const events: GameEvent[] = [];

  switch (action.type) {
    case 'DRAW':
      handleDraw(nextState, action, events);
      break;
    case 'PLAY_CARD':
      handlePlayCard(nextState, action, events);
      break;
    case 'RESPOND':
      handleRespond(nextState, action, events);
      break;
    case 'END_TURN':
      handleEndTurn(nextState, action, events);
      break;
    case 'GIFT_CARD':
      handleGiftCard(nextState, action, events);
      break;
    case 'SUBMIT_BID':
      handleSubmitBid(nextState, action, events);
      break;
    case 'ROLL_DICE':
      handleRollDice(nextState, action, events);
      break;
    case 'BUY_TILE':
      handleBuyTile(nextState, action, events);
      break;
    case 'DECLINE_TILE':
      handleDeclineTile(nextState, action, events);
      break;
    case 'TELEPORT_TRANSIT':
      handleTeleportTransit(nextState, action, events);
      break;
    case 'COLLECT_TRANSIT_RENT':
      handleCollectTransitRent(nextState, action, events);
      break;
    case 'SKIP_TILE_DECISION':
      handleSkipTileDecision(nextState, action, events);
      break;
  }

  // Centralized rather than sprinkled per-handler: BOSS_RAID's win condition (combined bank
  // total) can be reached by simply banking a card, which no handler used to re-check after.
  // checkAndRecordWinner is idempotent (no-ops once GAME_OVER), so calling it unconditionally
  // here is safe even though several handlers above also call it inline for the modes that need
  // to react to a win immediately mid-resolution (e.g. BATTLE_ROYALE elimination).
  checkAndRecordWinner(nextState, events);

  return { nextState, events };
}

function invalid(events: GameEvent[], reason: string): void {
  events.push({ type: 'INVALID_ACTION', reason });
}

function findPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((player) => player.id === playerId);
}

function findCardColor(player: Player, cardId: string): PropertyColor | undefined {
  return PROPERTY_COLORS.find((color) => player.field[color].some((card) => card.id === cardId));
}

function removeCardFromHand(player: Player, cardId: string): Card | undefined {
  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index === -1) return undefined;
  return player.hand.splice(index, 1)[0];
}

function removeCardFromField(player: Player, color: PropertyColor, cardId: string): Card | undefined {
  const list = player.field[color];
  const index = list.findIndex((card) => card.id === cardId);
  if (index === -1) return undefined;
  return list.splice(index, 1)[0];
}

/** 釘子戶 (NAIL_HOUSE) protects a whole color set from ever being taken away — Deal Breaker, Sly
 * Deal, Forced Deal, and 凶宅傳聞 all refuse to target it. It does NOT protect against 圍標天價維修
 * (only strips the House/Hotel attachment, not the underlying property, so a nail house still has
 * to pay a renovation bill like everyone else). */
function isNailHouseProtected(player: Player, color: PropertyColor): boolean {
  return player.field[color].some((card) => card.actionType === 'NAIL_HOUSE');
}

/** Actual property-card count for a color — NOT `field[color].length`. House/Hotel only ever
 * attach to an already-complete set, so they never inflated that raw length past 3 on their own,
 * but 釘子戶 can attach to an INCOMPLETE set — so field[color].length alone can no longer be
 * trusted to mean "3 properties" anywhere completeness is checked (win condition included). */
function propertyCount(player: Player, color: PropertyColor): number {
  return player.field[color].filter((card) => card.type === 'PROPERTY').length;
}

function drawCards(state: GameState, count: number): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      if (state.discardPile.length === 0) break;
      const rng = new PRNG(state.rngSeed);
      state.deck = rng.shuffle(state.discardPile);
      state.discardPile = [];
      state.rngSeed = rng.getState();
    }
    const card = state.deck.pop();
    if (card) drawn.push(card);
  }
  return drawn;
}

function grantMoney(state: GameState, player: Player, amount: number, events: GameEvent[]): void {
  const card: Card = { id: `grant-${state.turn}-${player.id}`, name: '派糖現金', type: 'MONEY', value: amount };
  player.bank.push(card);
  events.push({ type: 'CARD_BANKED', playerId: player.id, cardId: card.id, amount });
}

/** Cheapest-first, just enough cards to cover (or exhaust everything if it isn't enough). */
function autoPickPayment(available: Card[], amount: number): Card[] {
  const sorted = [...available].sort((a, b) => a.value - b.value);
  const picked: Card[] = [];
  let collected = 0;
  for (const card of sorted) {
    if (collected >= amount) break;
    picked.push(card);
    collected += card.value;
  }
  return picked;
}

/** Tiered rent (by same-color property count) plus any House/Hotel flat bonus for one color's
 * field slice — shared by hand-played RENT cards and REAL_BIG_DEAL's landing-triggered board rent. */
function computeSetRent(propertySet: Card[]): number {
  const propertyCards = propertySet.filter((c) => c.type === 'PROPERTY');
  const tiers = propertyCards[0]?.rentTiers;
  const tierRent = tiers?.[Math.min(propertyCards.length, tiers.length) - 1] ?? 0;
  const improvementBonus =
    (propertySet.some((c) => c.actionType === 'HOUSE') ? HOUSE_RENT_BONUS : 0) +
    (propertySet.some((c) => c.actionType === 'HOTEL') ? HOTEL_RENT_BONUS : 0);
  return tierRent + improvementBonus;
}

/** BATTLE_ROYALE doubles every rent/money-demand amount — applied once, at the point each such
 * amount is computed (playRentCard, DEBT_COLLECTOR, BIRTHDAY), never inside chargePlayer itself
 * (which also handles 炒家摸頂's already-resolved amount and must not double it a second time). */
function applyBattleRoyaleMultiplier(state: GameState, amount: number): number {
  return state.mode === 'BATTLE_ROYALE' ? amount * 2 : amount;
}

/**
 * In real Monopoly Deal the PAYER chooses which of their own cards to hand over — they might
 * give up a property they don't want rather than their cash. `chosenCardIds` carries that
 * choice (from a human's RESPOND); a bot (or a stale/invalid selection) falls back to
 * auto-picking the cheapest cards first, same as before this existed.
 */
function chargePlayer(
  state: GameState,
  payer: Player,
  receiver: Player,
  amount: number,
  chosenCardIds: string[] | undefined,
  events: GameEvent[],
): void {
  if (amount <= 0) {
    // Still tell the player something happened (e.g. 賣地流標 zeroed an incomplete set's rent) —
    // silently doing nothing here previously looked exactly like the game hadn't responded at all.
    events.push({ type: 'RENT_CHARGED', fromPlayerId: payer.id, toPlayerId: receiver.id, amount: 0 });
    return;
  }

  const available = [...payer.bank, ...payer.hand];
  const totalAvailable = available.reduce((sum, card) => sum + card.value, 0);

  if ((state.mode === 'BATTLE_ROYALE' || state.mode === 'REAL_BIG_DEAL') && totalAvailable < amount) {
    // Bankrupt: can't cover the charge even handing over everything. Bank, hand, and field all
    // transfer to the collector (including every board tile the payer owned), and the payer is
    // out of the game for good.
    receiver.bank.push(...payer.bank, ...payer.hand);
    payer.bank = [];
    payer.hand = [];
    for (const color of PROPERTY_COLORS) {
      receiver.field[color].push(...payer.field[color]);
      payer.field[color] = [];
    }
    payer.eliminated = true;
    events.push({ type: 'PLAYER_ELIMINATED', playerId: payer.id, collectorId: receiver.id });
    return;
  }

  const requiredMinimum = Math.min(amount, totalAvailable);

  let payable: Card[];
  if (chosenCardIds && chosenCardIds.length > 0) {
    const chosenSet = new Set(chosenCardIds);
    const chosen = available.filter((card) => chosenSet.has(card.id));
    const chosenTotal = chosen.reduce((sum, card) => sum + card.value, 0);
    payable = chosenTotal >= requiredMinimum ? chosen : autoPickPayment(available, amount);
  } else {
    payable = autoPickPayment(available, amount);
  }

  const paidIds = new Set(payable.map((card) => card.id));
  const collected = payable.reduce((sum, card) => sum + card.value, 0);

  payer.bank = payer.bank.filter((card) => !paidIds.has(card.id));
  payer.hand = payer.hand.filter((card) => !paidIds.has(card.id));
  receiver.bank.push(...payable);

  events.push({ type: 'RENT_CHARGED', fromPlayerId: payer.id, toPlayerId: receiver.id, amount: collected });
}

function checkAndRecordWinner(state: GameState, events: GameEvent[]): void {
  if (state.phase === 'GAME_OVER') return; // idempotent — safe to call after every action now
  const winnerId = checkWinner(state);
  if (winnerId) {
    state.winnerId = winnerId;
    state.phase = 'GAME_OVER';
    events.push({ type: 'GAME_WON', playerId: winnerId });
  }
}

function endTurn(state: GameState, events: GameEvent[]): void {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer) return;

  state.pendingRentMultiplier = undefined;

  if (activePlayer.hand.length > HAND_LIMIT) {
    const excess = activePlayer.hand.length - HAND_LIMIT;
    const discarded = activePlayer.hand.splice(HAND_LIMIT, excess);
    state.discardPile.push(...discarded);
    events.push({ type: 'HAND_DISCARDED', playerId: activePlayer.id, count: discarded.length });
  }

  events.push({ type: 'TURN_ENDED', playerId: activePlayer.id });

  // BATTLE_ROYALE: skip eliminated seats when handing the turn off. The loop guard (stop once
  // we've cycled back to where we started) means this can't spin forever even in a degenerate
  // all-eliminated-but-one state — the game should already be GAME_OVER by then regardless.
  let nextIndex = state.activePlayerIndex;
  do {
    nextIndex = (nextIndex + 1) % state.players.length;
  } while (state.players[nextIndex]?.eliminated && nextIndex !== state.activePlayerIndex);
  state.activePlayerIndex = nextIndex;

  state.turn += 1;
  state.actionsPlayedThisTurn = 0;

  // BOSS_RAID: a win on this exact turn still takes priority — checkWinner() here just decides
  // whether to declare failure; the actual win gets recorded normally by applyAction's
  // centralized checkAndRecordWinner call once this function returns.
  if (state.mode === 'BOSS_RAID' && state.turnLimit !== undefined && state.turn > state.turnLimit && !checkWinner(state)) {
    state.phase = 'GAME_OVER';
    state.raidFailed = true;
    events.push({ type: 'RAID_FAILED' });
    return;
  }

  if (state.mode === 'AUCTION_DRAFT') {
    startAuction(state, events);
  } else if (state.mode === 'REAL_BIG_DEAL') {
    state.phase = 'ROLL';
  } else {
    state.phase = 'TURN_START';
  }
}

// --- TURN_START -------------------------------------------------------

function expireMacroEvents(state: GameState, events: GameEvent[]): void {
  const remaining: MacroEvent[] = [];
  for (const event of state.activeMacroEvents) {
    const turnsLeft = event.durationTurns - 1;
    if (turnsLeft <= 0) {
      events.push({ type: 'MACRO_EVENT_EXPIRED', eventId: event.id });
    } else {
      remaining.push({ ...event, durationTurns: turnsLeft });
    }
  }
  state.activeMacroEvents = remaining;
}

/** Returns true if the drawn special effects require skipping straight to TURN_END (八號風球).
 * `forceTrigger` bypasses the 30% roll entirely — used by REAL_BIG_DEAL's STORM tile, which
 * guarantees a fresh disaster on landing, same idea as BOSS_RAID's guaranteed-every-turn rule. */
function maybeTriggerMacroEvent(state: GameState, events: GameEvent[], forceTrigger = false): boolean {
  // BOSS_RAID: the boss guarantees a fresh disaster every turn instead of the usual 30% roll —
  // no PRNG consumed for the roll itself, just for which event gets picked below.
  let shouldTrigger: boolean;
  if (state.mode === 'BOSS_RAID' || forceTrigger) {
    shouldTrigger = true;
  } else {
    const roll = new PRNG(state.rngSeed);
    shouldTrigger = roll.next() < MACRO_EVENT_TRIGGER_CHANCE;
    state.rngSeed = roll.getState();
  }
  if (!shouldTrigger) return false;

  const activeIds = new Set(state.activeMacroEvents.map((event) => event.id));
  const candidates = MACRO_EVENTS.filter((event) => !activeIds.has(event.id));
  if (candidates.length === 0) return false;

  const pick = new PRNG(state.rngSeed);
  const index = pick.nextInt(0, candidates.length - 1);
  state.rngSeed = pick.getState();

  const chosen = candidates[index];
  if (!chosen) return false;

  const instance: MacroEvent = { ...chosen };
  state.activeMacroEvents.push(instance);
  events.push({ type: 'MACRO_EVENT_TRIGGERED', event: instance });

  let skipTurn = false;
  for (const special of instance.specialEffects ?? []) {
    if (applySpecialEffect(state, special, events)) skipTurn = true;
  }
  return skipTurn;
}

/** Returns true if this effect should skip the active player's turn. */
function applySpecialEffect(state: GameState, special: SpecialEffect, events: GameEvent[]): boolean {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer) return false;

  switch (special.effect) {
    case 'SKIP_TURN':
      return true;
    case 'DRAW_DEFENSIVE_CARDS': {
      const drawn = drawCards(state, special.count);
      activePlayer.hand.push(...drawn);
      events.push({ type: 'CARDS_DRAWN', playerId: activePlayer.id, count: drawn.length });
      return false;
    }
    case 'GRANT_BANK_ALL':
      for (const player of state.players) {
        grantMoney(state, player, special.amount, events);
      }
      return false;
    case 'DISABLE_INCOMPLETE_SET_RENT':
      return false;
    case 'DISCARD_RANDOM_ALL': {
      const rng = new PRNG(state.rngSeed);
      for (const player of state.players) {
        if (player.hand.length === 0) continue;
        const index = rng.nextInt(0, player.hand.length - 1);
        const [discarded] = player.hand.splice(index, 1);
        if (discarded) {
          state.discardPile.push(discarded);
          events.push({ type: 'HAND_DISCARDED', playerId: player.id, count: 1 });
        }
      }
      state.rngSeed = rng.getState();
      return false;
    }
  }
}

function handleDraw(state: GameState, action: Extract<ActionPayload, { type: 'DRAW' }>, events: GameEvent[]): void {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || action.playerId !== activePlayer.id) {
    invalid(events, 'Only the active player may draw.');
    return;
  }
  if (state.phase !== 'TURN_START') {
    invalid(events, 'Cards can only be drawn at the start of a turn.');
    return;
  }

  expireMacroEvents(state, events);
  const skipTurn = maybeTriggerMacroEvent(state, events);

  const baseCount = activePlayer.hand.length === 0 ? 5 : 2;
  const drawCount = getEffectiveDrawCount(baseCount, state.activeMacroEvents);
  const drawn = drawCards(state, drawCount);
  activePlayer.hand.push(...drawn);
  events.push({ type: 'CARDS_DRAWN', playerId: activePlayer.id, count: drawn.length });

  if (skipTurn) {
    endTurn(state, events);
    return;
  }

  state.phase = 'ACTION';
}

// --- ACTION -------------------------------------------------------------

function handlePlayCard(
  state: GameState,
  action: Extract<ActionPayload, { type: 'PLAY_CARD' }>,
  events: GameEvent[],
): void {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || action.playerId !== activePlayer.id) {
    invalid(events, 'Only the active player may play a card.');
    return;
  }
  if (state.phase !== 'ACTION') {
    invalid(events, 'Cards can only be played during the action phase.');
    return;
  }

  const limit = getEffectiveActionLimit(BASE_ACTION_LIMIT, state.activeMacroEvents);
  if (state.actionsPlayedThisTurn >= limit) {
    invalid(events, 'No actions remaining this turn.');
    return;
  }

  const card = removeCardFromHand(activePlayer, action.cardId);
  if (!card) {
    invalid(events, 'Card not found in hand.');
    return;
  }

  if (action.asBank || card.type === 'MONEY') {
    activePlayer.bank.push(card);
    state.actionsPlayedThisTurn += 1;
    events.push({ type: 'CARD_BANKED', playerId: activePlayer.id, cardId: card.id, amount: card.value });
    return;
  }

  switch (card.type) {
    case 'PROPERTY':
      playProperty(state, activePlayer, card, events);
      break;
    case 'RENT':
      playRentCard(state, activePlayer, card, action.target, events);
      break;
    case 'ACTION':
      playActionCard(state, activePlayer, card, action.target, events);
      break;
    default:
      activePlayer.hand.push(card);
      invalid(events, 'Unsupported card type.');
  }
}

/** SYNDICATE only: hand a card straight to your teammate, no reaction window — it's a gift, not
 * an attack. Costs one of the turn's actions like any other play. */
function handleGiftCard(
  state: GameState,
  action: Extract<ActionPayload, { type: 'GIFT_CARD' }>,
  events: GameEvent[],
): void {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || action.playerId !== activePlayer.id) {
    invalid(events, 'Only the active player may gift a card.');
    return;
  }
  if (state.phase !== 'ACTION') {
    invalid(events, 'Cards can only be gifted during the action phase.');
    return;
  }
  if (state.mode !== 'SYNDICATE') {
    invalid(events, 'Gifting cards is only available in 2v2 Syndicate mode.');
    return;
  }

  const limit = getEffectiveActionLimit(BASE_ACTION_LIMIT, state.activeMacroEvents);
  if (state.actionsPlayedThisTurn >= limit) {
    invalid(events, 'No actions remaining this turn.');
    return;
  }

  const teammate = findPlayer(state, action.toPlayerId);
  if (!teammate || teammate.id === activePlayer.id || teammate.teamId !== activePlayer.teamId) {
    invalid(events, 'You can only gift a card to your own teammate.');
    return;
  }

  const card = removeCardFromHand(activePlayer, action.cardId);
  if (!card) {
    invalid(events, 'Card not found in hand.');
    return;
  }

  teammate.hand.push(card);
  state.actionsPlayedThisTurn += 1;
  events.push({ type: 'CARD_GIFTED', fromPlayerId: activePlayer.id, toPlayerId: teammate.id });
}

/** AUCTION_DRAFT: reveals the top 3 deck cards (reshuffling the discard pile in via drawCards if
 * the deck's dry) and opens the phase every player bids into. If there's truly nothing left to
 * auction, skips straight to the active player's ACTION phase instead of stalling on an empty lot. */
function startAuction(state: GameState, events: GameEvent[]): void {
  const revealed = drawCards(state, 3);
  if (revealed.length === 0) {
    state.phase = 'ACTION';
    return;
  }
  state.pendingAuction = { cards: revealed, bids: {} };
  state.phase = 'AUCTION';
  events.push({ type: 'AUCTION_STARTED', cards: revealed });
}

/** AUCTION_DRAFT: every player (not just the active one) submits one blind bid in bank cash; once
 * everyone has, the highest bid wins the lot into their hand and pays with bank cards (auto-picked
 * cheapest-first, discarded — no change-making, matching how every other charge in this game
 * works). Ties go to whoever's seated earliest, since that's the first entry `>` can ever beat. */
function handleSubmitBid(
  state: GameState,
  action: Extract<ActionPayload, { type: 'SUBMIT_BID' }>,
  events: GameEvent[],
): void {
  if (state.mode !== 'AUCTION_DRAFT') {
    invalid(events, 'Bidding is only available in Blind Auction Draft mode.');
    return;
  }
  const auction = state.pendingAuction;
  if (state.phase !== 'AUCTION' || !auction) {
    invalid(events, 'No auction is currently open.');
    return;
  }
  const player = findPlayer(state, action.playerId);
  if (!player || player.eliminated) {
    invalid(events, 'Unknown or eliminated player.');
    return;
  }
  if (auction.bids[player.id] !== undefined) {
    invalid(events, 'You already placed a bid this round.');
    return;
  }

  const bankTotal = player.bank.reduce((sum, c) => sum + c.value, 0);
  const amount = Math.max(0, Math.floor(action.amount));
  if (amount > bankTotal) {
    invalid(events, 'You cannot bid more than your bank total.');
    return;
  }

  auction.bids[player.id] = amount;
  events.push({ type: 'BID_SUBMITTED', playerId: player.id });

  const allBidded = state.players.every((p) => p.eliminated || auction.bids[p.id] !== undefined);
  if (allBidded) resolveAuction(state, events);
}

function resolveAuction(state: GameState, events: GameEvent[]): void {
  const auction = state.pendingAuction;
  if (!auction) return;

  let winnerId: string | undefined;
  let winningBid = -1;
  for (const player of state.players) {
    const bid = auction.bids[player.id];
    if (bid !== undefined && bid > winningBid) {
      winningBid = bid;
      winnerId = player.id;
    }
  }

  const winner = winnerId ? findPlayer(state, winnerId) : undefined;
  if (winner) {
    winner.hand.push(...auction.cards);
    if (winningBid > 0) {
      const payable = autoPickPayment(winner.bank, winningBid);
      const paidIds = new Set(payable.map((c) => c.id));
      winner.bank = winner.bank.filter((c) => !paidIds.has(c.id));
      state.discardPile.push(...payable);
    }
    events.push({ type: 'AUCTION_RESOLVED', winnerId: winner.id, winningBid: Math.max(winningBid, 0), bids: { ...auction.bids } });
  } else {
    // Defensive only — every non-eliminated player is required to bid, so this shouldn't happen.
    state.discardPile.push(...auction.cards);
  }

  state.pendingAuction = undefined;
  state.phase = 'ACTION';
}

// --- ROLL / TILE_DECISION (REAL_BIG_DEAL only) ---------------------------

function handleRollDice(
  state: GameState,
  action: Extract<ActionPayload, { type: 'ROLL_DICE' }>,
  events: GameEvent[],
): void {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || action.playerId !== activePlayer.id) {
    invalid(events, 'Only the active player may roll.');
    return;
  }
  if (state.phase !== 'ROLL') {
    invalid(events, 'The die can only be rolled at the start of a turn.');
    return;
  }

  const rng = new PRNG(state.rngSeed);
  const roll = rng.nextInt(1, 6);
  state.rngSeed = rng.getState();

  const from = activePlayer.position ?? 0;
  const passedGo = from + roll >= BOARD_SIZE;
  const to = (from + roll) % BOARD_SIZE;
  activePlayer.position = to;
  events.push({ type: 'DICE_ROLLED', playerId: activePlayer.id, roll, fromPosition: from, toPosition: to });

  if (passedGo) {
    grantMoney(state, activePlayer, GO_BONUS, events);
    events.push({ type: 'PASSED_GO', playerId: activePlayer.id, amount: GO_BONUS });
  }

  resolveLanding(state, activePlayer, events);
}

/** Dispatches on the tile the player just landed on. Property tiles either open a TILE_DECISION
 * (unowned — buy or decline) or a REACTION_WINDOW (owned by someone else — board rent, defendable
 * with 封區 exactly like a played RENT card); landing on your own tile is a no-op. */
function resolveLanding(state: GameState, player: Player, events: GameEvent[]): void {
  const tile = BOARD_TILES[player.position ?? 0];
  if (!tile) {
    state.phase = 'TURN_START';
    return;
  }

  if (tile.kind === 'GO' || tile.kind === 'FREE') {
    state.phase = 'TURN_START';
    return;
  }

  if (tile.kind === 'AUCTION') {
    startAuction(state, events);
    return;
  }

  if (tile.kind === 'STORM') {
    maybeTriggerMacroEvent(state, events, true);
    state.phase = 'TURN_START';
    return;
  }

  const card = tileCard(tile.position);
  const color = card?.color;
  if (!card || !color) {
    state.phase = 'TURN_START';
    return;
  }

  const owner = tileOwner(state, tile.position);
  if (!owner) {
    state.pendingTileDecision = { playerId: player.id, tileIndex: tile.position, kind: 'BUY_PROPERTY', price: card.value };
    state.phase = 'TILE_DECISION';
    return;
  }

  if (owner.id === player.id) {
    // Landing on your own tile is otherwise a no-op, except transit tiles still offer their
    // teleport/collect-rent perk even when you already own the one you're standing on.
    if (color === 'TRANSPORT') {
      state.pendingTileDecision = { playerId: player.id, tileIndex: tile.position, kind: 'TRANSIT' };
      state.phase = 'TILE_DECISION';
    } else {
      state.phase = 'TURN_START';
    }
    return;
  }

  // Owned by another player — board rent. Simplification: the transit teleport/collect-rent perk
  // is only offered when landing doesn't cost you rent (unowned or self-owned) — paying rent on
  // someone else's transit hub doesn't also grant you a free ride.
  const amount = computeSetRent(owner.field[color]);
  const boardRentCard: Card = {
    id: `board-rent-${state.turn}-${tile.position}`,
    name: `${card.name} 過路費`,
    type: 'RENT',
    value: 0,
    color,
  };
  openReactionWindow(
    state,
    { card: boardRentCard, sourcePlayerId: owner.id, targetQueue: [player.id], amount, returnPhase: 'TURN_START' },
    events,
  );
}

/** After a TILE_DECISION resolves (bought, declined, or a transit choice made), transit tiles get
 * one more chance to offer their teleport/collect-rent perk before finally moving on to the draw
 * step — everything else goes straight to TURN_START. */
function afterTileDecision(state: GameState, player: Player, resolvedTileIndex: number, alreadyOfferedTransit: boolean): void {
  const card = tileCard(resolvedTileIndex);
  if (!alreadyOfferedTransit && card?.color === 'TRANSPORT') {
    state.pendingTileDecision = { playerId: player.id, tileIndex: resolvedTileIndex, kind: 'TRANSIT' };
    state.phase = 'TILE_DECISION';
    return;
  }
  state.pendingTileDecision = undefined;
  state.phase = 'TURN_START';
}

function handleBuyTile(
  state: GameState,
  action: Extract<ActionPayload, { type: 'BUY_TILE' }>,
  events: GameEvent[],
): void {
  const activePlayer = state.players[state.activePlayerIndex];
  const pending = state.pendingTileDecision;
  if (!activePlayer || action.playerId !== activePlayer.id) {
    invalid(events, 'Only the active player may buy this tile.');
    return;
  }
  if (state.phase !== 'TILE_DECISION' || !pending || pending.kind !== 'BUY_PROPERTY') {
    invalid(events, 'No property purchase is currently pending.');
    return;
  }
  const card = tileCard(pending.tileIndex);
  const price = pending.price ?? 0;
  if (!card || !card.color) {
    invalid(events, 'That tile has no property to buy.');
    return;
  }
  const bankTotal = activePlayer.bank.reduce((sum, c) => sum + c.value, 0);
  if (bankTotal < price) {
    invalid(events, 'Not enough cash in the bank to buy this tile.');
    return;
  }

  const payable = autoPickPayment(activePlayer.bank, price);
  const paidIds = new Set(payable.map((c) => c.id));
  activePlayer.bank = activePlayer.bank.filter((c) => !paidIds.has(c.id));
  state.discardPile.push(...payable);
  activePlayer.field[card.color].push(card);
  events.push({ type: 'TILE_PURCHASED', playerId: activePlayer.id, tileIndex: pending.tileIndex, price });

  afterTileDecision(state, activePlayer, pending.tileIndex, false);
  checkAndRecordWinner(state, events);
}

function handleDeclineTile(
  state: GameState,
  action: Extract<ActionPayload, { type: 'DECLINE_TILE' }>,
  events: GameEvent[],
): void {
  const activePlayer = state.players[state.activePlayerIndex];
  const pending = state.pendingTileDecision;
  if (!activePlayer || action.playerId !== activePlayer.id) {
    invalid(events, 'Only the active player may decline this tile.');
    return;
  }
  if (state.phase !== 'TILE_DECISION' || !pending || pending.kind !== 'BUY_PROPERTY') {
    invalid(events, 'No property purchase is currently pending.');
    return;
  }

  events.push({ type: 'TILE_DECLINED', playerId: activePlayer.id, tileIndex: pending.tileIndex });
  afterTileDecision(state, activePlayer, pending.tileIndex, false);
}

function handleTeleportTransit(
  state: GameState,
  action: Extract<ActionPayload, { type: 'TELEPORT_TRANSIT' }>,
  events: GameEvent[],
): void {
  const activePlayer = state.players[state.activePlayerIndex];
  const pending = state.pendingTileDecision;
  if (!activePlayer || action.playerId !== activePlayer.id) {
    invalid(events, 'Only the active player may teleport.');
    return;
  }
  if (state.phase !== 'TILE_DECISION' || !pending || pending.kind !== 'TRANSIT') {
    invalid(events, 'No transit decision is currently pending.');
    return;
  }
  const destinationTile = BOARD_TILES[action.toPosition];
  const destinationCard = destinationTile ? tileCard(destinationTile.position) : undefined;
  if (!destinationTile || destinationCard?.color !== 'TRANSPORT' || destinationTile.position === activePlayer.position) {
    invalid(events, 'You must teleport to a different transit tile.');
    return;
  }

  activePlayer.position = destinationTile.position;
  events.push({ type: 'TRANSIT_TELEPORTED', playerId: activePlayer.id, toPosition: destinationTile.position });
  // Stays in TILE_DECISION — the player may still collect transit rent or skip to finish up.
}

function handleCollectTransitRent(
  state: GameState,
  action: Extract<ActionPayload, { type: 'COLLECT_TRANSIT_RENT' }>,
  events: GameEvent[],
): void {
  const activePlayer = state.players[state.activePlayerIndex];
  const pending = state.pendingTileDecision;
  if (!activePlayer || action.playerId !== activePlayer.id) {
    invalid(events, 'Only the active player may collect transit rent.');
    return;
  }
  if (state.phase !== 'TILE_DECISION' || !pending || pending.kind !== 'TRANSIT') {
    invalid(events, 'No transit decision is currently pending.');
    return;
  }
  const transitSet = activePlayer.field.TRANSPORT;
  if (!transitSet.some((c) => c.type === 'PROPERTY')) {
    invalid(events, 'You do not own any transit tiles to collect rent for.');
    return;
  }

  const amount = computeSetRent(transitSet);
  for (const opponent of state.players) {
    if (!isOpposingPlayer(state, activePlayer, opponent)) continue;
    chargePlayer(state, opponent, activePlayer, amount, undefined, events);
  }

  state.pendingTileDecision = undefined;
  state.phase = 'TURN_START';
  checkAndRecordWinner(state, events);
}

function handleSkipTileDecision(
  state: GameState,
  action: Extract<ActionPayload, { type: 'SKIP_TILE_DECISION' }>,
  events: GameEvent[],
): void {
  const activePlayer = state.players[state.activePlayerIndex];
  const pending = state.pendingTileDecision;
  if (!activePlayer || action.playerId !== activePlayer.id) {
    invalid(events, 'Only the active player may skip this decision.');
    return;
  }
  if (state.phase !== 'TILE_DECISION' || !pending || pending.kind !== 'TRANSIT') {
    invalid(events, 'No transit decision is currently pending.');
    return;
  }

  state.pendingTileDecision = undefined;
  state.phase = 'TURN_START';
}

function playProperty(state: GameState, player: Player, card: Card, events: GameEvent[]): void {
  const color = card.color;
  if (!color) {
    player.hand.push(card);
    invalid(events, 'Property card missing a color.');
    return;
  }

  player.field[color].push(card);
  state.actionsPlayedThisTurn += 1;
  events.push({ type: 'PROPERTY_BUILT', playerId: player.id, cardId: card.id, color });

  checkAndRecordWinner(state, events);
}

function playRentCard(
  state: GameState,
  player: Player,
  card: Card,
  target: PlayCardTarget | undefined,
  events: GameEvent[],
  // 洗黑錢 (MONEY_LAUNDERING) activates a rent card straight out of the bank instead of the hand —
  // if that turns out to be an invalid play, the card must bounce back to the bank it came from,
  // not the hand it was never in. Defaults to hand for every normal hand-played rent card.
  returnTo: Card[] = player.hand,
): void {
  // Single-color rent cards fix their color; wild rent cards (see cards.ts) print 2+ eligible
  // colors and let the player choose one via target.color when playing.
  const eligibleColors = card.color ? [card.color] : (card.wildColors ?? []);
  const color =
    eligibleColors.length === 1
      ? eligibleColors[0]
      : target?.color && eligibleColors.includes(target.color)
        ? target.color
        : undefined;
  if (!color) {
    returnTo.push(card);
    invalid(events, eligibleColors.length > 1 ? 'Choose which color to charge rent for.' : 'Rent card missing a color.');
    return;
  }

  const propertySet = player.field[color];
  const propertyCards = propertySet.filter((c) => c.type === 'PROPERTY');
  if (propertyCards.length === 0) {
    returnTo.push(card);
    invalid(events, 'You do not own any properties of that color.');
    return;
  }

  // Fully-wild rent cards (rentScope 'SINGLE') are stronger — any color, but only one victim —
  // so unlike normal/pair-wild rent they can't fall back to "charge everyone".
  let singleOpponent: Player | undefined;
  if (card.rentScope === 'SINGLE') {
    singleOpponent = resolveOpponent(state, player, target);
    if (!singleOpponent) {
      returnTo.push(card);
      invalid(events, 'This rent card must target a single opponent.');
      return;
    }
  }

  // 洋樓/酒店 attached to this set (see playActionCard's HOUSE/HOTEL cases) add a flat bonus on
  // top of the tiered property rent — they don't count as property cards for the tier lookup.
  // Owning more cards of a color than rentTiers has entries for (colors now print more than
  // COMPLETE_SET_SIZE copies) just reuses the top tier rather than reading past the array.
  const baseRent = computeSetRent(propertySet);
  // 孖展炒樓 (DOUBLE_RENT) boosts the printed rent before macro-event modifiers apply on top,
  // e.g. $3M base * DOUBLE_RENT * 突發加息 (x0.5) = $3M, not $2M.
  const boostedBaseRent = baseRent * (state.pendingRentMultiplier ?? 1);
  const amount = applyBattleRoyaleMultiplier(state, calculateEffectiveRent(boostedBaseRent, propertyCards, state.activeMacroEvents));
  state.pendingRentMultiplier = undefined;

  state.discardPile.push(card);
  state.actionsPlayedThisTurn += 1;

  const explicitRentTarget = target?.playerId ? findPlayer(state, target.playerId) : undefined;
  const targetQueue = singleOpponent
    ? [singleOpponent.id]
    : explicitRentTarget && isOpposingPlayer(state, player, explicitRentTarget)
      ? [explicitRentTarget.id]
      : state.players.filter((p) => isOpposingPlayer(state, player, p)).map((p) => p.id);

  openReactionWindow(state, { card, sourcePlayerId: player.id, targetQueue, amount }, events);
}

function playActionCard(
  state: GameState,
  player: Player,
  card: Card,
  target: PlayCardTarget | undefined,
  events: GameEvent[],
): void {
  switch (card.actionType) {
    case 'DOUBLE_RENT': {
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      state.pendingRentMultiplier = (state.pendingRentMultiplier ?? 1) * 2;
      events.push({ type: 'RENT_MULTIPLIED', playerId: player.id, multiplier: state.pendingRentMultiplier });
      return;
    }
    case 'JUST_SAY_NO': {
      player.hand.push(card);
      invalid(events, '封區 can only be played in response to another action.');
      return;
    }
    case 'DEAL_BREAKER': {
      const opponent = resolveOpponent(state, player, target);
      const color = target?.color;
      if (
        !opponent ||
        !color ||
        propertyCount(opponent, color) < COMPLETE_SET_SIZE ||
        isNailHouseProtected(opponent, color)
      ) {
        player.hand.push(card);
        invalid(events, 'Deal Breaker requires targeting a complete, unprotected property set.');
        return;
      }
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      openReactionWindow(
        state,
        { card, sourcePlayerId: player.id, targetQueue: [opponent.id], context: target },
        events,
      );
      return;
    }
    case 'SLY_DEAL': {
      const opponent = resolveOpponent(state, player, target);
      const cardId = target?.cardId;
      const color = cardId && opponent ? findCardColor(opponent, cardId) : undefined;
      if (
        !opponent ||
        !cardId ||
        !color ||
        propertyCount(opponent, color) >= COMPLETE_SET_SIZE ||
        isNailHouseProtected(opponent, color)
      ) {
        player.hand.push(card);
        invalid(events, 'Sly Deal requires targeting a single unprotected property outside a completed set.');
        return;
      }
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      openReactionWindow(
        state,
        { card, sourcePlayerId: player.id, targetQueue: [opponent.id], context: target },
        events,
      );
      return;
    }
    case 'FORCED_DEAL': {
      const opponent = resolveOpponent(state, player, target);
      const targetCardId = target?.cardId;
      const offeredCardId = target?.offeredCardId;
      const targetColor = targetCardId && opponent ? findCardColor(opponent, targetCardId) : undefined;
      const offeredColor = offeredCardId ? findCardColor(player, offeredCardId) : undefined;
      if (
        !opponent ||
        !targetCardId ||
        !offeredCardId ||
        !targetColor ||
        !offeredColor ||
        propertyCount(opponent, targetColor) >= COMPLETE_SET_SIZE ||
        isNailHouseProtected(opponent, targetColor)
      ) {
        player.hand.push(card);
        invalid(events, 'Forced Deal requires a valid, unprotected property to offer and receive, neither in a completed set.');
        return;
      }
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      openReactionWindow(
        state,
        { card, sourcePlayerId: player.id, targetQueue: [opponent.id], context: target },
        events,
      );
      return;
    }
    case 'BIRTHDAY': {
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      const targetQueue = state.players.filter((p) => isOpposingPlayer(state, player, p)).map((p) => p.id);
      const amount = applyBattleRoyaleMultiplier(state, card.value);
      openReactionWindow(state, { card, sourcePlayerId: player.id, targetQueue, amount }, events);
      return;
    }
    case 'DEBT_COLLECTOR': {
      const opponent = resolveOpponent(state, player, target);
      if (!opponent) {
        player.hand.push(card);
        invalid(events, 'Debt Collector requires targeting an opponent.');
        return;
      }
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      openReactionWindow(
        state,
        { card, sourcePlayerId: player.id, targetQueue: [opponent.id], amount: applyBattleRoyaleMultiplier(state, DEBT_COLLECTOR_AMOUNT) },
        events,
      );
      return;
    }
    case 'PICKPOCKET': {
      const opponent = resolveOpponent(state, player, target);
      if (!opponent) {
        player.hand.push(card);
        invalid(events, 'Pickpocket requires targeting an opponent.');
        return;
      }
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      openReactionWindow(state, { card, sourcePlayerId: player.id, targetQueue: [opponent.id] }, events);
      return;
    }
    case 'HOUSE': {
      const color = target?.color;
      const set = color ? player.field[color] : undefined;
      const isComplete = set ? set.filter((c) => c.type === 'PROPERTY').length >= COMPLETE_SET_SIZE : false;
      const hasHouse = set?.some((c) => c.actionType === 'HOUSE') ?? false;
      if (!color || color === NO_IMPROVEMENT_COLOR || !isComplete || hasHouse) {
        player.hand.push(card);
        invalid(events, 'House must go on one of your own complete sets (not 交通基建) without a house yet.');
        return;
      }
      player.field[color].push(card);
      state.actionsPlayedThisTurn += 1;
      events.push({ type: 'PROPERTY_BUILT', playerId: player.id, cardId: card.id, color });
      return;
    }
    case 'NAIL_HOUSE': {
      // Self-targeting and permanent, like House/Hotel — attaches immediately, no reaction window.
      const color = target?.color;
      const ownsProperty = color ? player.field[color].some((c) => c.type === 'PROPERTY') : false;
      const alreadyProtected = color ? isNailHouseProtected(player, color) : false;
      if (!color || !ownsProperty || alreadyProtected) {
        player.hand.push(card);
        invalid(events, 'Nail House must go on one of your own colors you already own a property in.');
        return;
      }
      player.field[color].push(card);
      state.actionsPlayedThisTurn += 1;
      events.push({ type: 'PROPERTY_PROTECTED', playerId: player.id, color });
      return;
    }
    case 'MARKET_TOP': {
      player.hand.push(card);
      invalid(events, '炒家摸頂 can only be played in response to a rent/money-demand card.');
      return;
    }
    case 'RENOVATION_SCAM': {
      const opponent = resolveOpponent(state, player, target);
      const color = target?.color;
      const improved = color && opponent ? opponent.field[color].some((c) => c.actionType === 'HOUSE' || c.actionType === 'HOTEL') : false;
      if (!opponent || !color || !improved) {
        player.hand.push(card);
        invalid(events, 'Renovation Scam requires targeting an opponent set with a House or Hotel.');
        return;
      }
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      openReactionWindow(
        state,
        { card, sourcePlayerId: player.id, targetQueue: [opponent.id], context: target },
        events,
      );
      return;
    }
    case 'HAUNTED_RUMOR': {
      const opponent = resolveOpponent(state, player, target);
      const cardId = target?.cardId;
      const color = cardId && opponent ? findCardColor(opponent, cardId) : undefined;
      const targetCard = color && opponent ? opponent.field[color].find((c) => c.id === cardId) : undefined;
      if (!opponent || !cardId || !color || !targetCard || targetCard.type !== 'PROPERTY' || isNailHouseProtected(opponent, color)) {
        player.hand.push(card);
        invalid(events, 'Haunted Rumor requires targeting one of an opponent’s unprotected property cards.');
        return;
      }
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      openReactionWindow(
        state,
        { card, sourcePlayerId: player.id, targetQueue: [opponent.id], context: target },
        events,
      );
      return;
    }
    case 'HOTEL': {
      const color = target?.color;
      const set = color ? player.field[color] : undefined;
      const hasHouse = set?.some((c) => c.actionType === 'HOUSE') ?? false;
      const hasHotel = set?.some((c) => c.actionType === 'HOTEL') ?? false;
      if (!color || color === NO_IMPROVEMENT_COLOR || !hasHouse || hasHotel) {
        player.hand.push(card);
        invalid(events, 'Hotel must go on one of your own sets that already has a house.');
        return;
      }
      player.field[color].push(card);
      state.actionsPlayedThisTurn += 1;
      events.push({ type: 'PROPERTY_BUILT', playerId: player.id, cardId: card.id, color });
      return;
    }
    case 'PASS_GO': {
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      const drawn = drawCards(state, 2);
      player.hand.push(...drawn);
      events.push({ type: 'CARDS_DRAWN', playerId: player.id, count: drawn.length });
      return;
    }
    // --- Bank reactivation: banking a card was previously a one-way trip. These five let a
    // player pull value back out of their own (or an opponent's) bank pile. ---
    case 'ASSET_REORG': {
      const cardId = target?.cardId;
      const bankCard = cardId ? player.bank.find((c) => c.id === cardId) : undefined;
      const buildable = bankCard && (bankCard.type === 'PROPERTY' || bankCard.actionType === 'HOUSE' || bankCard.actionType === 'HOTEL');
      if (!bankCard || !buildable) {
        player.hand.push(card);
        invalid(events, 'Asset Reorganization requires choosing a property, House, or Hotel card from your own bank.');
        return;
      }

      let color: PropertyColor | undefined;
      if (bankCard.type === 'PROPERTY') {
        color = bankCard.color;
      } else {
        const candidate = target?.color;
        const set = candidate ? player.field[candidate] : undefined;
        const propertyCount = set ? set.filter((c) => c.type === 'PROPERTY').length : 0;
        const hasHouse = set?.some((c) => c.actionType === 'HOUSE') ?? false;
        const hasHotel = set?.some((c) => c.actionType === 'HOTEL') ?? false;
        const legal =
          !!candidate &&
          candidate !== NO_IMPROVEMENT_COLOR &&
          (bankCard.actionType === 'HOUSE' ? propertyCount >= COMPLETE_SET_SIZE && !hasHouse : hasHouse && !hasHotel);
        color = legal ? candidate : undefined;
      }
      if (!color) {
        player.hand.push(card);
        invalid(events, 'That bank card cannot legally be built right now.');
        return;
      }

      player.bank = player.bank.filter((c) => c.id !== bankCard.id);
      player.field[color].push(bankCard);
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      events.push({ type: 'PROPERTY_BUILT', playerId: player.id, cardId: bankCard.id, color });
      return;
    }
    case 'ATM_WITHDRAWAL': {
      const ids = target?.cardIds ?? [];
      const chosen = player.bank.filter((c) => ids.includes(c.id) && c.type !== 'MONEY');
      if (chosen.length === 0 || chosen.length > 2) {
        player.hand.push(card);
        invalid(events, 'ATM Withdrawal requires choosing 1-2 non-cash cards from your own bank.');
        return;
      }
      const chosenIds = new Set(chosen.map((c) => c.id));
      player.bank = player.bank.filter((c) => !chosenIds.has(c.id));
      player.hand.push(...chosen);
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      events.push({ type: 'BANK_WITHDRAWN', playerId: player.id, count: chosen.length });
      return;
    }
    case 'MONEY_LAUNDERING': {
      const cardId = target?.cardId;
      const bankCard = cardId ? player.bank.find((c) => c.id === cardId && c.type === 'RENT') : undefined;
      if (!bankCard) {
        player.hand.push(card);
        invalid(events, 'Money Laundering requires choosing a rent card from your own bank.');
        return;
      }
      // 洗黑錢 itself is spent the moment it's played, whether or not the rent card underneath
      // turns out playable — but if that rent play is invalid, IT bounces back to the bank (not
      // the hand it was never in) via playRentCard's returnTo parameter.
      player.bank = player.bank.filter((c) => c.id !== bankCard.id);
      state.discardPile.push(card);
      events.push({ type: 'BANK_RENT_LAUNDERED', playerId: player.id, cardId: bankCard.id });
      playRentCard(state, player, bankCard, target, events, player.bank);
      return;
    }
    case 'LIQUIDATOR_TAKEOVER': {
      const opponent = resolveOpponent(state, player, target);
      const cardId = target?.cardId;
      const bankCard = cardId && opponent ? opponent.bank.find((c) => c.id === cardId && c.type !== 'MONEY') : undefined;
      if (!opponent || !target || !bankCard) {
        player.hand.push(card);
        invalid(events, 'Liquidator Takeover requires targeting a non-cash card in an opponent’s bank.');
        return;
      }
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      openReactionWindow(
        state,
        { card, sourcePlayerId: player.id, targetQueue: [opponent.id], context: target },
        events,
      );
      return;
    }
    case 'REVERSE_MORTGAGE': {
      const cardId = target?.cardId;
      const bankCard = cardId ? player.bank.find((c) => c.id === cardId && c.type !== 'MONEY') : undefined;
      if (!bankCard) {
        player.hand.push(card);
        invalid(events, 'Reverse Mortgage requires choosing a non-cash card from your own bank.');
        return;
      }
      player.bank = player.bank.filter((c) => c.id !== bankCard.id);
      state.deck.unshift(bankCard);
      state.discardPile.push(card);
      state.actionsPlayedThisTurn += 1;
      events.push({ type: 'CARD_BURIED', playerId: player.id, cardId: bankCard.id });
      const drawn = drawCards(state, 3);
      player.hand.push(...drawn);
      events.push({ type: 'CARDS_DRAWN', playerId: player.id, count: drawn.length });
      return;
    }
    default:
      player.hand.push(card);
      invalid(events, 'Unsupported action card.');
  }
}

/** True if `other` is a legal target for `player`'s aggressive cards: not themselves, not
 * eliminated (BATTLE_ROYALE — they own nothing), and not a teammate (SYNDICATE — 秘密轉贈
 * (GIFT_CARD) is the only sanctioned way to hand a teammate something). */
function isOpposingPlayer(state: GameState, player: Player, other: Player): boolean {
  if (other.id === player.id || other.eliminated) return false;
  if (state.mode === 'SYNDICATE' && other.teamId !== undefined && other.teamId === player.teamId) return false;
  // BOSS_RAID: everyone's on one team against the deck — no PvP, so nobody is ever "opposing."
  if (state.mode === 'BOSS_RAID') return false;
  return true;
}

function resolveOpponent(state: GameState, player: Player, target: PlayCardTarget | undefined): Player | undefined {
  if (!target?.playerId) return undefined;
  const opponent = findPlayer(state, target.playerId);
  if (!opponent || !isOpposingPlayer(state, player, opponent)) return undefined;
  return opponent;
}

type NewPendingReaction = Omit<PendingReaction, 'currentResponderId' | 'cancelled'>;

function openReactionWindow(state: GameState, pending: NewPendingReaction, events: GameEvent[]): void {
  const firstTarget = pending.targetQueue[0];
  // An empty queue (e.g. BATTLE_ROYALE eliminated every other player in one stroke) has nothing
  // to react to — stay in ACTION rather than opening a window nobody can ever legally respond to.
  // The caller already counted this as one of the turn's actions before calling in.
  if (!firstTarget) return;
  state.pendingReaction = { ...pending, currentResponderId: firstTarget, cancelled: false };
  state.phase = 'REACTION_WINDOW';
  events.push({ type: 'REACTION_REQUESTED', playerId: firstTarget, card: pending.card });
}

// --- REACTION_WINDOW -----------------------------------------------------

/**
 * 封區 (Just Say No) can chain indefinitely: the target may cancel the action, the source may
 * counter with their own 封區 to un-cancel it, the target may counter that, and so on for as
 * long as either side keeps producing 封區 cards. `currentResponderId` alternates between the
 * target and the source each time 封區 is played; `cancelled` flips each time too. Whoever is
 * currently asked can instead ACCEPT, which locks in the current cancelled/live state and
 * resolves (or skips) the effect for targetQueue[0].
 */
function handleRespond(
  state: GameState,
  action: Extract<ActionPayload, { type: 'RESPOND' }>,
  events: GameEvent[],
): void {
  const pending = state.pendingReaction;
  if (!pending) {
    invalid(events, 'No reaction is pending.');
    return;
  }

  const currentTargetId = pending.targetQueue[0];
  if (!currentTargetId || action.playerId !== pending.currentResponderId) {
    invalid(events, 'It is not your turn to respond.');
    return;
  }

  const responder = findPlayer(state, action.playerId);
  if (!responder) {
    invalid(events, 'Unknown responder.');
    return;
  }

  if (action.response === 'JUST_SAY_NO') {
    const cardIndex = responder.hand.findIndex(
      (card) => card.actionType === 'JUST_SAY_NO' && (!action.cardId || card.id === action.cardId),
    );
    if (cardIndex === -1) {
      invalid(events, 'You do not have a 封區 (Just Say No) card to play.');
      return;
    }
    const [justSayNo] = responder.hand.splice(cardIndex, 1);
    if (justSayNo) state.discardPile.push(justSayNo);

    pending.cancelled = !pending.cancelled;
    pending.currentResponderId = responder.id === pending.sourcePlayerId ? currentTargetId : pending.sourcePlayerId;
    events.push({ type: 'REACTION_RESOLVED', playerId: responder.id, response: 'JUST_SAY_NO' });
    events.push({ type: 'REACTION_REQUESTED', playerId: pending.currentResponderId, card: pending.card });
    return;
  }

  if (action.response === 'COUNTER') {
    // 炒家摸頂 is a one-shot reversal, not a chainable cancel like 封區 — only the actual target of
    // a money demand can play it (not the source mid-封區-exchange), and only while the demand is
    // still live (a 封區'd charge has nothing left to reverse).
    const isMoneyDemand =
      pending.card.type === 'RENT' || pending.card.actionType === 'BIRTHDAY' || pending.card.actionType === 'DEBT_COLLECTOR';
    const counterIndex = responder.hand.findIndex((c) => c.actionType === 'MARKET_TOP');
    if (!isMoneyDemand || pending.cancelled || responder.id !== currentTargetId || counterIndex === -1) {
      invalid(events, 'You cannot counter this with 炒家摸頂.');
      return;
    }
    const [marketTop] = responder.hand.splice(counterIndex, 1);
    if (marketTop) state.discardPile.push(marketTop);

    const source = findPlayer(state, pending.sourcePlayerId);
    if (source) chargePlayer(state, source, responder, pending.amount ?? pending.card.value, undefined, events);
    events.push({ type: 'REACTION_RESOLVED', playerId: responder.id, response: 'COUNTER' });

    pending.targetQueue = pending.targetQueue.slice(1);
    pending.cancelled = false;
    if (pending.targetQueue.length === 0) {
      state.phase = pending.returnPhase ?? 'ACTION';
      state.pendingReaction = undefined;
    } else {
      const nextTarget = pending.targetQueue[0];
      if (nextTarget) {
        pending.currentResponderId = nextTarget;
        events.push({ type: 'REACTION_REQUESTED', playerId: nextTarget, card: pending.card });
      }
    }
    checkAndRecordWinner(state, events);
    return;
  }

  if (!pending.cancelled) {
    const target = findPlayer(state, currentTargetId);
    if (target) resolvePendingEffectForTarget(state, pending, target, action.paymentCardIds, events);
  }
  events.push({ type: 'REACTION_RESOLVED', playerId: responder.id, response: 'ACCEPT' });

  pending.targetQueue = pending.targetQueue.slice(1);
  pending.cancelled = false;
  if (pending.targetQueue.length === 0) {
    state.phase = pending.returnPhase ?? 'ACTION';
    state.pendingReaction = undefined;
  } else {
    const nextTarget = pending.targetQueue[0];
    if (nextTarget) {
      pending.currentResponderId = nextTarget;
      events.push({ type: 'REACTION_REQUESTED', playerId: nextTarget, card: pending.card });
    }
  }

  checkAndRecordWinner(state, events);
}

function resolvePendingEffectForTarget(
  state: GameState,
  pending: PendingReaction,
  target: Player,
  paymentCardIds: string[] | undefined,
  events: GameEvent[],
): void {
  const source = findPlayer(state, pending.sourcePlayerId);
  if (!source) return;

  if (pending.card.type === 'RENT') {
    chargePlayer(state, target, source, pending.amount ?? 0, paymentCardIds, events);
    return;
  }

  switch (pending.card.actionType) {
    case 'BIRTHDAY':
    case 'DEBT_COLLECTOR':
      chargePlayer(state, target, source, pending.amount ?? pending.card.value, paymentCardIds, events);
      return;
    case 'PICKPOCKET': {
      if (target.hand.length === 0) {
        events.push({ type: 'HAND_CARD_STOLEN', fromPlayerId: target.id, toPlayerId: source.id, success: false });
        return;
      }
      const rng = new PRNG(state.rngSeed);
      const index = rng.nextInt(0, target.hand.length - 1);
      state.rngSeed = rng.getState();
      const [stolen] = target.hand.splice(index, 1);
      if (stolen) source.hand.push(stolen);
      events.push({ type: 'HAND_CARD_STOLEN', fromPlayerId: target.id, toPlayerId: source.id, success: true });
      return;
    }
    case 'DEAL_BREAKER': {
      const color = pending.context?.color;
      if (!color) return;
      const stolen = target.field[color].splice(0, target.field[color].length);
      source.field[color].push(...stolen);
      events.push({ type: 'SET_STOLEN', fromPlayerId: target.id, toPlayerId: source.id, color });
      return;
    }
    case 'SLY_DEAL': {
      const cardId = pending.context?.cardId;
      const color = cardId ? findCardColor(target, cardId) : undefined;
      if (!cardId || !color) return;
      const stolen = removeCardFromField(target, color, cardId);
      if (!stolen) return;
      source.field[color].push(stolen);
      events.push({ type: 'PROPERTY_STOLEN', fromPlayerId: target.id, toPlayerId: source.id, cardId });
      return;
    }
    case 'FORCED_DEAL': {
      const targetCardId = pending.context?.cardId;
      const offeredCardId = pending.context?.offeredCardId;
      if (!targetCardId || !offeredCardId) return;
      const targetColor = findCardColor(target, targetCardId);
      const sourceColor = findCardColor(source, offeredCardId);
      if (!targetColor || !sourceColor) return;
      const targetCard = removeCardFromField(target, targetColor, targetCardId);
      const offeredCard = removeCardFromField(source, sourceColor, offeredCardId);
      if (!targetCard || !offeredCard) return;
      source.field[targetColor].push(targetCard);
      target.field[sourceColor].push(offeredCard);
      events.push({
        type: 'PROPERTY_SWAPPED',
        playerAId: source.id,
        playerBId: target.id,
        cardAId: offeredCard.id,
        cardBId: targetCard.id,
      });
      return;
    }
    case 'RENOVATION_SCAM': {
      const color = pending.context?.color;
      if (!color) return;
      const stripped = target.field[color].filter((c) => c.actionType === 'HOUSE' || c.actionType === 'HOTEL');
      if (stripped.length === 0) return;
      target.field[color] = target.field[color].filter((c) => c.actionType !== 'HOUSE' && c.actionType !== 'HOTEL');
      state.discardPile.push(...stripped);
      events.push({ type: 'IMPROVEMENT_STRIPPED', fromPlayerId: target.id, toPlayerId: source.id, color });
      return;
    }
    case 'HAUNTED_RUMOR': {
      const cardId = pending.context?.cardId;
      const color = cardId ? findCardColor(target, cardId) : undefined;
      if (!cardId || !color) return;
      const discarded = removeCardFromField(target, color, cardId);
      if (!discarded) return;
      state.discardPile.push(discarded);
      events.push({ type: 'PROPERTY_STIGMATIZED', fromPlayerId: target.id, toPlayerId: source.id, cardId });
      return;
    }
    case 'LIQUIDATOR_TAKEOVER': {
      const cardId = pending.context?.cardId;
      if (!cardId) return;
      const index = target.bank.findIndex((c) => c.id === cardId);
      if (index === -1) return;
      const [seized] = target.bank.splice(index, 1);
      if (!seized) return;
      source.hand.push(seized);
      events.push({ type: 'BANK_CARD_SEIZED', fromPlayerId: target.id, toPlayerId: source.id, cardId });
      return;
    }
    default:
      return;
  }
}

// --- TURN_END -------------------------------------------------------------

function handleEndTurn(
  state: GameState,
  action: Extract<ActionPayload, { type: 'END_TURN' }>,
  events: GameEvent[],
): void {
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || action.playerId !== activePlayer.id) {
    invalid(events, 'Only the active player may end the turn.');
    return;
  }
  if (state.phase !== 'ACTION') {
    invalid(events, 'The turn cannot be ended right now.');
    return;
  }

  endTurn(state, events);
}
