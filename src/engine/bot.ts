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

/** The bot's preferred target: whoever is closest to winning, breaking ties by total field value.
 * Eliminated players (BATTLE_ROYALE) own nothing and can't be targeted — never worth picking.
 * SYNDICATE: a bot's own teammate is never a valid attack target either. BOSS_RAID: nobody is —
 * it's pure co-op, no PvP at all, so there's no "leader" to attack (mirrors isOpposingPlayer in
 * stateManager.ts; if this ever disagreed with the engine, a bot would deterministically retry
 * the same illegal target forever, since invalid plays don't consume the turn's action budget). */
function findLeader(state: GameState, excludeId: string): Player | undefined {
  if (state.mode === 'BOSS_RAID') return undefined;
  const self = state.players.find((p) => p.id === excludeId);
  return state.players
    .filter((p) => p.id !== excludeId && !p.eliminated && !(self && p.teamId !== undefined && p.teamId === self.teamId))
    .slice()
    .sort((a, b) => countCompleteSets(b) - countCompleteSets(a) || fieldValue(b) - fieldValue(a))[0];
}

function buildableProperty(hand: Card[], field: Record<PropertyColor, Card[]>): Card | undefined {
  return hand.find(
    (c) => c.type === 'PROPERTY' && c.color && field[c.color].filter((f) => f.type === 'PROPERTY').length < COMPLETE_SET_SIZE,
  );
}

/** For a RENT card (single-color or wild), the first color it could charge for that the bot
 * actually owns a property of — undefined if the bot can't use this card at all right now. */
function playableRentColor(card: Card, field: Record<PropertyColor, Card[]>): PropertyColor | undefined {
  const eligible = card.color ? [card.color] : (card.wildColors ?? []);
  return eligible.find((color) => field[color].some((f) => f.type === 'PROPERTY'));
}

function playableRent(hand: Card[], field: Record<PropertyColor, Card[]>): { card: Card; color: PropertyColor } | undefined {
  for (const card of hand) {
    if (card.type !== 'RENT') continue;
    const color = playableRentColor(card, field);
    if (color) return { card, color };
  }
  return undefined;
}

function heldJustSayNo(hand: Card[]): Card | undefined {
  return hand.find((c) => c.actionType === 'JUST_SAY_NO');
}

function isProtected(target: Player, color: PropertyColor): boolean {
  return target.field[color].some((c) => c.actionType === 'NAIL_HOUSE');
}

// Deterministic bots must never pick a 釘子戶-protected target: an invalid PLAY_CARD doesn't
// consume the turn's action budget, so re-evaluating the same deterministic logic next step
// would just propose the exact same illegal move forever.
function stealableCard(target: Player): { color: PropertyColor; card: Card } | undefined {
  for (const color of PROPERTY_COLORS) {
    if (isProtected(target, color)) continue;
    const properties = target.field[color].filter((c) => c.type === 'PROPERTY');
    if (properties.length > 0 && properties.length < COMPLETE_SET_SIZE) {
      const card = properties[0];
      if (card) return { color, card };
    }
  }
  return undefined;
}

function completeSetColor(target: Player): PropertyColor | undefined {
  return PROPERTY_COLORS.find(
    (color) => target.field[color].filter((c) => c.type === 'PROPERTY').length >= COMPLETE_SET_SIZE && !isProtected(target, color),
  );
}

/** Any opponent property card (property only, not a House/Hotel attachment) that isn't
 * 釘子戶-protected — 凶宅傳聞 can target complete sets too, unlike Sly Deal. */
function stigmatizableCard(target: Player): { color: PropertyColor; card: Card } | undefined {
  for (const color of PROPERTY_COLORS) {
    if (isProtected(target, color)) continue;
    const card = target.field[color].find((c) => c.type === 'PROPERTY');
    if (card) return { color, card };
  }
  return undefined;
}

/** A color with a House and/or Hotel attached, for 圍標天價維修 to strip. */
function improvedColor(target: Player): PropertyColor | undefined {
  return PROPERTY_COLORS.find((color) => target.field[color].some((c) => c.actionType === 'HOUSE' || c.actionType === 'HOTEL'));
}

/** Prefer protecting a complete set (the bot's most valuable asset); fall back to any owned,
 * unprotected color. */
function eligibleNailHouseColor(player: Player): PropertyColor | undefined {
  const owned = PROPERTY_COLORS.filter(
    (color) => player.field[color].some((c) => c.type === 'PROPERTY') && !isProtected(player, color),
  );
  return owned.find((color) => player.field[color].filter((c) => c.type === 'PROPERTY').length >= COMPLETE_SET_SIZE) ?? owned[0];
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

/** 物業重組: the first bank card that could legally be built onto the field right now. */
function reorganizableBankCard(player: Player): { card: Card; color: PropertyColor } | undefined {
  for (const bankCard of player.bank) {
    if (bankCard.type === 'PROPERTY' && bankCard.color) {
      return { card: bankCard, color: bankCard.color };
    }
    if (bankCard.actionType === 'HOUSE') {
      const color = eligibleHouseColor(player);
      if (color) return { card: bankCard, color };
    }
    if (bankCard.actionType === 'HOTEL') {
      const color = eligibleHotelColor(player);
      if (color) return { card: bankCard, color };
    }
  }
  return undefined;
}

/** 洗黑錢: a RENT card sitting unused in the bank that the bot could actually charge with. */
function launderableBankRent(player: Player): { card: Card; color: PropertyColor } | undefined {
  for (const bankCard of player.bank) {
    if (bankCard.type !== 'RENT') continue;
    const color = playableRentColor(bankCard, player.field);
    if (color) return { card: bankCard, color };
  }
  return undefined;
}

/** 接管清盤人: the first non-cash card in an opponent's bank (bank contents are always public). */
function seizableBankCard(target: Player): Card | undefined {
  return target.bank.find((c) => c.type !== 'MONEY');
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

  if (state.phase === 'ROLL') {
    return { type: 'ROLL_DICE', playerId: botPlayerId };
  }

  if (state.phase === 'REACTION_WINDOW' && state.pendingReaction?.currentResponderId === botPlayerId) {
    return decideReaction(state, bot, level);
  }

  if (state.phase === 'ACTION') {
    return decideActionPhase(state, bot, level);
  }

  if (state.phase === 'AUCTION' && state.pendingAuction) {
    return decideBid(state, bot, level);
  }

  if (state.phase === 'TILE_DECISION' && state.pendingTileDecision?.playerId === botPlayerId) {
    return decideTileDecision(state, bot);
  }

  return { type: 'END_TURN', playerId: botPlayerId };
}

/** REAL_BIG_DEAL: buy an unowned tile if it won't leave the bank below a small safety reserve
 * (so the bot isn't immediately unable to pay the next rent/debt it owes); for a transit tile,
 * always collect free rent if eligible, never bother teleporting (keeps behavior predictable). */
function decideTileDecision(state: GameState, bot: Player): ActionPayload {
  const pending = state.pendingTileDecision;
  if (!pending) return { type: 'SKIP_TILE_DECISION', playerId: bot.id };

  if (pending.kind === 'BUY_PROPERTY') {
    const price = pending.price ?? 0;
    const bankTotal = bot.bank.reduce((sum, c) => sum + c.value, 0);
    const reserve = 2;
    if (bankTotal - price >= reserve) {
      return { type: 'BUY_TILE', playerId: bot.id };
    }
    return { type: 'DECLINE_TILE', playerId: bot.id };
  }

  const ownsTransit = bot.field.TRANSPORT.some((c) => c.type === 'PROPERTY');
  if (ownsTransit) {
    return { type: 'COLLECT_TRANSIT_RENT', playerId: bot.id };
  }
  return { type: 'SKIP_TILE_DECISION', playerId: bot.id };
}

/** AUCTION_DRAFT: bid a level-scaled fraction of the bot's bank cash — deterministic, no card
 * evaluation (every lot is 3 unseen-until-revealed cards, so there's little to differentiate on
 * beyond "how much am I willing to risk this round"). */
function decideBid(state: GameState, bot: Player, level: BotLevel): ActionPayload {
  const bankTotal = bot.bank.reduce((sum, c) => sum + c.value, 0);
  const fraction = level === 3 ? 0.5 : level === 2 ? 0.35 : 0.15;
  const amount = Math.floor(bankTotal * fraction);
  return { type: 'SUBMIT_BID', playerId: bot.id, amount };
}

function decideReaction(state: GameState, bot: Player, level: BotLevel): ActionPayload {
  const pending = state.pendingReaction;

  if (level === 1 || !pending) {
    return { type: 'RESPOND', playerId: bot.id, response: 'ACCEPT' };
  }

  // 炒家摸頂 nets a bigger swing than 封區 on a money demand (you go from paying to receiving,
  // not just avoiding the payment), so prefer it whenever it's actually usable — only the real
  // target can play it, and only while the charge is still live (not already 封區'd away).
  const marketTop = bot.hand.find((c) => c.actionType === 'MARKET_TOP');
  const isMoneyDemand =
    pending.card.type === 'RENT' || pending.card.actionType === 'BIRTHDAY' || pending.card.actionType === 'DEBT_COLLECTOR';
  const isActualTarget = pending.targetQueue[0] === bot.id;
  if (marketTop && isMoneyDemand && isActualTarget && !pending.cancelled) {
    return { type: 'RESPOND', playerId: bot.id, response: 'COUNTER' };
  }

  const justSayNo = heldJustSayNo(bot.hand);
  if (!justSayNo) {
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

  const leader = findLeader(state, bot.id);

  if (level >= 2) {
    const doubleRent = hand.find((c) => c.actionType === 'DOUBLE_RENT');
    const rent = playableRent(hand, bot.field);
    if (doubleRent && rent && !state.pendingRentMultiplier) {
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: doubleRent.id };
    }
    if (rent && rent.card.color) {
      // Single-color rent card: no target needed, charges every opponent automatically.
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: rent.card.id };
    }
    if (rent && rent.card.rentScope === 'SINGLE') {
      // Fully-wild rent only hits one opponent — aim it at whoever's winning. BOSS_RAID has no
      // valid victim at all (no PvP — see findLeader), so this card just can't be played there;
      // falls through to being banked like any other unusable card instead.
      const victim = state.mode === 'BOSS_RAID' ? undefined : (leader ?? state.players.find((p) => p.id !== bot.id));
      if (victim) {
        const target: PlayCardTarget = { playerId: victim.id, color: rent.color };
        return { type: 'PLAY_CARD', playerId: bot.id, cardId: rent.card.id, target };
      }
    }
    if (rent) {
      // 2-color wild rent still charges every opponent — target carries the chosen color only.
      const target: PlayCardTarget = { playerId: bot.id, color: rent.color };
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: rent.card.id, target };
    }

    const birthday = hand.find((c) => c.actionType === 'BIRTHDAY');
    if (birthday) {
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: birthday.id };
    }

    // 世紀特大暴雨 blocks House/Hotel plays entirely — same reasoning as the 釘子戶 guards above:
    // an invalid play doesn't consume the action budget, so a deterministic bot would otherwise
    // propose the exact same illegal move forever while this event is active.
    const improvementsDisabled = state.activeMacroEvents.some((event) =>
      event.specialEffects?.some((effect) => effect.effect === 'DISABLE_IMPROVEMENTS'),
    );

    const houseCard = improvementsDisabled ? undefined : hand.find((c) => c.actionType === 'HOUSE');
    const houseColor = houseCard ? eligibleHouseColor(bot) : undefined;
    if (houseCard && houseColor) {
      const target: PlayCardTarget = { playerId: bot.id, color: houseColor };
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: houseCard.id, target };
    }

    const hotelCard = improvementsDisabled ? undefined : hand.find((c) => c.actionType === 'HOTEL');
    const hotelColor = hotelCard ? eligibleHotelColor(bot) : undefined;
    if (hotelCard && hotelColor) {
      const target: PlayCardTarget = { playerId: bot.id, color: hotelColor };
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: hotelCard.id, target };
    }

    const assetReorg = hand.find((c) => c.actionType === 'ASSET_REORG');
    const reorg = assetReorg ? reorganizableBankCard(bot) : undefined;
    if (assetReorg && reorg) {
      const target: PlayCardTarget = { playerId: bot.id, cardId: reorg.card.id, color: reorg.color };
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: assetReorg.id, target };
    }

    const moneyLaundering = hand.find((c) => c.actionType === 'MONEY_LAUNDERING');
    const laundered = moneyLaundering ? launderableBankRent(bot) : undefined;
    if (moneyLaundering && laundered && laundered.card.wildColors) {
      const target: PlayCardTarget = { playerId: bot.id, cardId: laundered.card.id, color: laundered.color };
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: moneyLaundering.id, target };
    }
    if (moneyLaundering && laundered) {
      const target: PlayCardTarget = { playerId: bot.id, cardId: laundered.card.id };
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: moneyLaundering.id, target };
    }

    const nailHouseCard = hand.find((c) => c.actionType === 'NAIL_HOUSE');
    const nailHouseColor = nailHouseCard ? eligibleNailHouseColor(bot) : undefined;
    if (nailHouseCard && nailHouseColor) {
      const target: PlayCardTarget = { playerId: bot.id, color: nailHouseColor };
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: nailHouseCard.id, target };
    }

    const passGo = hand.find((c) => c.actionType === 'PASS_GO');
    if (passGo) {
      return { type: 'PLAY_CARD', playerId: bot.id, cardId: passGo.id };
    }

    if (leader) {
      const dealBreaker = hand.find((c) => c.actionType === 'DEAL_BREAKER');
      const dealBreakerColor = dealBreaker ? completeSetColor(leader) : undefined;
      if (dealBreaker && dealBreakerColor) {
        const target: PlayCardTarget = { playerId: leader.id, color: dealBreakerColor };
        return { type: 'PLAY_CARD', playerId: bot.id, cardId: dealBreaker.id, target };
      }

      const renovationScam = hand.find((c) => c.actionType === 'RENOVATION_SCAM');
      const scamColor = renovationScam ? improvedColor(leader) : undefined;
      if (renovationScam && scamColor) {
        const target: PlayCardTarget = { playerId: leader.id, color: scamColor };
        return { type: 'PLAY_CARD', playerId: bot.id, cardId: renovationScam.id, target };
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

        const pickpocket = hand.find((c) => c.actionType === 'PICKPOCKET');
        if (pickpocket) {
          const target: PlayCardTarget = { playerId: leader.id };
          return { type: 'PLAY_CARD', playerId: bot.id, cardId: pickpocket.id, target };
        }

        const hauntedRumor = hand.find((c) => c.actionType === 'HAUNTED_RUMOR');
        const stigma = hauntedRumor ? stigmatizableCard(leader) : undefined;
        if (hauntedRumor && stigma) {
          const target: PlayCardTarget = { playerId: leader.id, cardId: stigma.card.id };
          return { type: 'PLAY_CARD', playerId: bot.id, cardId: hauntedRumor.id, target };
        }

        const liquidatorTakeover = hand.find((c) => c.actionType === 'LIQUIDATOR_TAKEOVER');
        const seizable = liquidatorTakeover ? seizableBankCard(leader) : undefined;
        if (liquidatorTakeover && seizable) {
          const target: PlayCardTarget = { playerId: leader.id, cardId: seizable.id };
          return { type: 'PLAY_CARD', playerId: bot.id, cardId: liquidatorTakeover.id, target };
        }
      }
    }
  }

  // Nothing productive left to play — bank the first bankable card, but hold onto 封區/炒家摸頂 for
  // defense rather than spending them as cash (both are reactive-only, so decideActionPhase can
  // never play them itself anyway).
  const bankable = hand.find((c) => c.actionType !== 'JUST_SAY_NO' && c.actionType !== 'MARKET_TOP');
  if (bankable) {
    return { type: 'PLAY_CARD', playerId: bot.id, cardId: bankable.id, asBank: true };
  }

  return { type: 'END_TURN', playerId: bot.id };
}
