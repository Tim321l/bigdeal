import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../data/constants';
import { BASE_ACTION_LIMIT } from './stateManager';
import { getEffectiveActionLimit } from './modifierPipeline';
import type { ActionPayload, Card, GameState, Player, PlayCardTarget, PropertyColor } from '../types/game';

export type BotLevel = 1 | 2 | 3;

const NO_IMPROVEMENT_COLOR: PropertyColor = 'TRANSPORT';

function countCompleteSets(player: Player): number {
  return PROPERTY_COLORS.filter((color) => player.field[color].filter((c) => c.type === 'PROPERTY').length >= COMPLETE_SET_SIZE)
    .length;
}

function fieldValue(player: Player): number {
  return PROPERTY_COLORS.reduce((sum, color) => sum + player.field[color].reduce((s, card) => s + card.value, 0), 0);
}

/** The bot's preferred target: whoever is closest to winning, breaking ties by total field value. */
function findLeader(state: GameState, excludeId: string): Player | undefined {
  return state.players
    .filter((p) => p.id !== excludeId)
    .slice()
    .sort((a, b) => countCompleteSets(b) - countCompleteSets(a) || fieldValue(b) - fieldValue(a))[0];
}

function buildableProperty(hand: Card[], field: Record<PropertyColor, Card[]>): Card | undefined {
  return hand.find(
    (c) => c.type === 'PROPERTY' && c.color && field[c.color].filter((f) => f.type === 'PROPERTY').length < COMPLETE_SET_SIZE,
  );
}

function playableRent(hand: Card[], field: Record<PropertyColor, Card[]>): Card | undefined {
  return hand.find((c) => c.type === 'RENT' && c.color && field[c.color].some((f) => f.type === 'PROPERTY'));
}

function heldJustSayNo(hand: Card[]): Card | undefined {
  return hand.find((c) => c.actionType === 'JUST_SAY_NO');
}

function stealableCard(target: Player): { color: PropertyColor; card: Card } | undefined {
  for (const color of PROPERTY_COLORS) {
    const properties = target.field[color].filter((c) => c.type === 'PROPERTY');
    if (properties.length > 0 && properties.length < COMPLETE_SET_SIZE) {
      const card = properties[0];
      if (card) return { color, card };
    }
  }
  return undefined;
}

function completeSetColor(target: Player): PropertyColor | undefined {
  return PROPERTY_COLORS.find((color) => target.field[color].filter((c) => c.type === 'PROPERTY').length >= COMPLETE_SET_SIZE);
}

function eligibleHouseColor(player: Player): PropertyColor | undefined {
  return PROPERTY_COLORS.find((color) => {
    if (color === NO_IMPROVEMENT_COLOR) return false;
    const set = player.field[color];
    return set.filter((c) => c.type === 'PROPERTY').length >= COMPLETE_SET_SIZE && !set.some((c) => c.actionType === 'HOUSE');
  });
}

function eligibleHotelColor(player: Player): PropertyColor | undefined {
  return PROPERTY_COLORS.find((color) => {
    if (color === NO_IMPROVEMENT_COLOR) return false;
    const set = player.field[color];
    return set.some((c) => c.actionType === 'HOUSE') && !set.some((c) => c.actionType === 'HOTEL');
  });
}

/**
 * Picks the bot's next move for the current phase. Level 1 is a passive baseline (build if it
 * can, otherwise bank, never defends). Level 2 adds income cards, improvements, and situational
 * defense. Level 3 adds aggressive targeting of whoever is winning and near-total defense.
 * Decisions are otherwise deterministic given the state — no PRNG — so bot behavior is testable
 * and replayable like everything else in the engine.
 */
export function decideBotAction(state: GameState, botPlayerId: string, level: BotLevel): ActionPayload {
  const bot = state.players.find((p) => p.id === botPlayerId);
  if (!bot) return { type: 'END_TURN', playerId: botPlayerId };

  if (state.phase === 'TURN_START') {
    return { type: 'DRAW', playerId: botPlayerId };
  }

  if (state.phase === 'REACTION_WINDOW' && state.pendingReaction?.currentResponderId === botPlayerId) {
    return decideReaction(state, bot, level);
  }

  if (state.phase === 'ACTION') {
    return decideActionPhase(state, bot, level);
  }

  return { type: 'END_TURN', playerId: botPlayerId };
}

function decideReaction(state: GameState, bot: Player, level: BotLevel): ActionPayload {
  const pending = state.pendingReaction;
  const justSayNo = heldJustSayNo(bot.hand);

  if (level === 1 || !pending || !justSayNo) {
    return { type: 'RESPOND', playerId: bot.id, response: 'ACCEPT' };
  }

  if (level === 3) {
    return { type: 'RESPOND', playerId: bot.id, response: 'JUST_SAY_NO', cardId: justSayNo.id };
  }

  // Level 2 only burns its 封區 on genuinely painful threats.
  const isSevere =
    pending.card.actionType === 'DEAL_BREAKER' ||
    (pending.card.type === 'RENT' && (pending.amount ?? 0) >= 3) ||
    ((pending.card.actionType === 'BIRTHDAY' || pending.card.actionType === 'DEBT_COLLECTOR') && (pending.amount ?? 0) >= 4);

  return isSevere
    ? { type: 'RESPOND', playerId: bot.id, response: 'JUST_SAY_NO', cardId: justSayNo.id }
    : { type: 'RESPOND', playerId: bot.id, response: 'ACCEPT' };
}

function decideActionPhase(state: GameState, bot: Player, level: BotLevel): ActionPayload {
  const hand = bot.hand;
  if (hand.length === 0) return { type: 'END_TURN', playerId: bot.id };

  const actionLimit = getEffectiveActionLimit(BASE_ACTION_LIMIT, state.activeMacroEvents);
  if (state.actionsPlayedThisTurn >= actionLimit) {
    return { type: 'END_TURN', playerId: bot.id };
  }

  const buildable = buildableProperty(hand, bot.field);
  if (buildable) {
    return { type: 'PLAY_CARD', playerId: bot.id, cardId: buildable.id };
  }

  if (level >= 2) {
    const doubleRent = hand.find((c) => c.actionType === 'DOUBLE_RENT');
    const rent = playableRent(hand, bot.field);
    if (doubleRent && rent && !state.pendingRentMultiplier) {
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: doubleRent.id };
    }
    if (rent) {
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: rent.id };
    }

    const birthday = hand.find((c) => c.actionType === 'BIRTHDAY');
    if (birthday) {
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: birthday.id };
    }

    const houseCard = hand.find((c) => c.actionType === 'HOUSE');
    const houseColor = houseCard ? eligibleHouseColor(bot) : undefined;
    if (houseCard && houseColor) {
      const target: PlayCardTarget = { playerId: bot.id, color: houseColor };
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: houseCard.id, target };
    }

    const hotelCard = hand.find((c) => c.actionType === 'HOTEL');
    const hotelColor = hotelCard ? eligibleHotelColor(bot) : undefined;
    if (hotelCard && hotelColor) {
      const target: PlayCardTarget = { playerId: bot.id, color: hotelColor };
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: hotelCard.id, target };
    }

    const passGo = hand.find((c) => c.actionType === 'PASS_GO');
    if (passGo) {
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: passGo.id };
    }

    const leader = findLeader(state, bot.id);
    if (leader) {
      const dealBreaker = hand.find((c) => c.actionType === 'DEAL_BREAKER');
      const dealBreakerColor = dealBreaker ? completeSetColor(leader) : undefined;
      if (dealBreaker && dealBreakerColor) {
        const target: PlayCardTarget = { playerId: leader.id, color: dealBreakerColor };
        return { type: 'PLAY_CARD', playerId: bot.id, cardId: dealBreaker.id, target };
      }

      if (level === 3) {
        const slyDeal = hand.find((c) => c.actionType === 'SLY_DEAL');
        const steal = slyDeal ? stealableCard(leader) : undefined;
        if (slyDeal && steal) {
          const target: PlayCardTarget = { playerId: leader.id, cardId: steal.card.id };
          return { type: 'PLAY_CARD', playerId: bot.id, cardId: slyDeal.id, target };
        }

        const debtCollector = hand.find((c) => c.actionType === 'DEBT_COLLECTOR');
        if (debtCollector) {
          const target: PlayCardTarget = { playerId: leader.id };
          return { type: 'PLAY_CARD', playerId: bot.id, cardId: debtCollector.id, target };
        }
      }
    }
  }

  // Nothing productive left to play — bank the first bankable card, but hold onto 封區 for
  // defense rather than spending it as cash.
  const bankable = hand.find((c) => c.actionType !== 'JUST_SAY_NO');
  if (bankable) {
    return { type: 'PLAY_CARD', playerId: bot.id, cardId: bankable.id, asBank: true };
  }

  return { type: 'END_TURN', playerId: bot.id };
}
