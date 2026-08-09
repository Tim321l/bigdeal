import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../data/constants';
import { CARDS } from '../data/cards';
import { MACRO_EVENTS } from '../data/events';
import type {
  ActionPayload,
  Card,
  GameEvent,
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

function emptyField(): Record<PropertyColor, Card[]> {
  const field = {} as Record<PropertyColor, Card[]>;
  for (const color of PROPERTY_COLORS) {
    field[color] = [];
  }
  return field;
}

export function initGame(playerNames: string[], seed: number): GameState {
  const rng = new PRNG(seed);
  const deck = rng.shuffle(CARDS);

  const players: Player[] = playerNames.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    hand: [],
    field: emptyField(),
    bank: [],
  }));

  for (const player of players) {
    for (let i = 0; i < STARTING_HAND_SIZE; i++) {
      const card = deck.pop();
      if (card) player.hand.push(card);
    }
  }

  return {
    turn: 1,
    activePlayerIndex: 0,
    players,
    deck,
    discardPile: [],
    activeMacroEvents: [],
    rngSeed: rng.getState(),
    phase: 'TURN_START',
    actionsPlayedThisTurn: 0,
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
  }

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

/**
 * In real Monopoly Deal the PAYER chooses which of their own cards to hand over — they might
 * give up a property they don't want rather than their cash. `chosenCardIds` carries that
 * choice (from a human's RESPOND); a bot (or a stale/invalid selection) falls back to
 * auto-picking the cheapest cards first, same as before this existed.
 */
function chargePlayer(
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

  state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  state.turn += 1;
  state.actionsPlayedThisTurn = 0;
  state.phase = 'TURN_START';
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

/** Returns true if the drawn special effects require skipping straight to TURN_END (八號風球). */
function maybeTriggerMacroEvent(state: GameState, events: GameEvent[]): boolean {
  const roll = new PRNG(state.rngSeed);
  const shouldTrigger = roll.next() < MACRO_EVENT_TRIGGER_CHANCE;
  state.rngSeed = roll.getState();
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
    player.hand.push(card);
    invalid(events, eligibleColors.length > 1 ? 'Choose which color to charge rent for.' : 'Rent card missing a color.');
    return;
  }

  const propertySet = player.field[color];
  const propertyCards = propertySet.filter((c) => c.type === 'PROPERTY');
  if (propertyCards.length === 0) {
    player.hand.push(card);
    invalid(events, 'You do not own any properties of that color.');
    return;
  }

  // Fully-wild rent cards (rentScope 'SINGLE') are stronger — any color, but only one victim —
  // so unlike normal/pair-wild rent they can't fall back to "charge everyone".
  let singleOpponent: Player | undefined;
  if (card.rentScope === 'SINGLE') {
    singleOpponent = resolveOpponent(state, player, target);
    if (!singleOpponent) {
      player.hand.push(card);
      invalid(events, 'This rent card must target a single opponent.');
      return;
    }
  }

  // 洋樓/酒店 attached to this set (see playActionCard's HOUSE/HOTEL cases) add a flat bonus on
  // top of the tiered property rent — they don't count as property cards for the tier lookup.
  // Owning more cards of a color than rentTiers has entries for (colors now print more than
  // COMPLETE_SET_SIZE copies) just reuses the top tier rather than reading past the array.
  const tiers = propertyCards[0]?.rentTiers;
  const tierRent = tiers?.[Math.min(propertyCards.length, tiers.length) - 1] ?? 0;
  const improvementBonus =
    (propertySet.some((c) => c.actionType === 'HOUSE') ? HOUSE_RENT_BONUS : 0) +
    (propertySet.some((c) => c.actionType === 'HOTEL') ? HOTEL_RENT_BONUS : 0);
  const baseRent = tierRent + improvementBonus;
  // 孖展炒樓 (DOUBLE_RENT) boosts the printed rent before macro-event modifiers apply on top,
  // e.g. $3M base * DOUBLE_RENT * 突發加息 (x0.5) = $3M, not $2M.
  const boostedBaseRent = baseRent * (state.pendingRentMultiplier ?? 1);
  const amount = calculateEffectiveRent(boostedBaseRent, propertyCards, state.activeMacroEvents);
  state.pendingRentMultiplier = undefined;

  state.discardPile.push(card);
  state.actionsPlayedThisTurn += 1;

  const targetQueue = singleOpponent
    ? [singleOpponent.id]
    : target?.playerId && target.playerId !== player.id
      ? [target.playerId]
      : state.players.filter((p) => p.id !== player.id).map((p) => p.id);

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
        opponent.field[color].length < COMPLETE_SET_SIZE ||
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
        opponent.field[color].length >= COMPLETE_SET_SIZE ||
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
        opponent.field[targetColor].length >= COMPLETE_SET_SIZE ||
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
      const targetQueue = state.players.filter((p) => p.id !== player.id).map((p) => p.id);
      openReactionWindow(state, { card, sourcePlayerId: player.id, targetQueue, amount: card.value }, events);
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
        { card, sourcePlayerId: player.id, targetQueue: [opponent.id], amount: DEBT_COLLECTOR_AMOUNT },
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
    default:
      player.hand.push(card);
      invalid(events, 'Unsupported action card.');
  }
}

function resolveOpponent(state: GameState, player: Player, target: PlayCardTarget | undefined): Player | undefined {
  if (!target?.playerId || target.playerId === player.id) return undefined;
  return findPlayer(state, target.playerId);
}

type NewPendingReaction = Omit<PendingReaction, 'currentResponderId' | 'cancelled'>;

function openReactionWindow(state: GameState, pending: NewPendingReaction, events: GameEvent[]): void {
  const firstTarget = pending.targetQueue[0];
  state.pendingReaction = { ...pending, currentResponderId: firstTarget ?? pending.sourcePlayerId, cancelled: false };
  state.phase = 'REACTION_WINDOW';
  if (firstTarget) {
    events.push({ type: 'REACTION_REQUESTED', playerId: firstTarget, card: pending.card });
  }
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
    if (source) chargePlayer(source, responder, pending.amount ?? pending.card.value, undefined, events);
    events.push({ type: 'REACTION_RESOLVED', playerId: responder.id, response: 'COUNTER' });

    pending.targetQueue = pending.targetQueue.slice(1);
    pending.cancelled = false;
    if (pending.targetQueue.length === 0) {
      state.pendingReaction = undefined;
      state.phase = 'ACTION';
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
    state.pendingReaction = undefined;
    state.phase = 'ACTION';
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
    chargePlayer(target, source, pending.amount ?? 0, paymentCardIds, events);
    return;
  }

  switch (pending.card.actionType) {
    case 'BIRTHDAY':
    case 'DEBT_COLLECTOR':
      chargePlayer(target, source, pending.amount ?? pending.card.value, paymentCardIds, events);
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
