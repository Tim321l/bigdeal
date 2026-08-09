export type CardType = 'PROPERTY' | 'ACTION' | 'RENT' | 'MONEY' | 'EVENT';

export type PropertyColor =
  | 'PUBLIC_HOUSING'
  | 'OLD_TONG_LAU'
  | 'ESTATE'
  | 'COMMERCIAL_LUXURY'
  | 'TRANSPORT';

export type ActionType =
  | 'DEAL_BREAKER'
  | 'JUST_SAY_NO'
  | 'SLY_DEAL'
  | 'FORCED_DEAL'
  | 'DEBT_COLLECTOR'
  | 'BIRTHDAY'
  | 'PASS_GO'
  | 'HOUSE'
  | 'HOTEL'
  | 'DOUBLE_RENT'
  | 'PICKPOCKET'
  | 'NAIL_HOUSE'
  | 'MARKET_TOP'
  | 'RENOVATION_SCAM'
  | 'HAUNTED_RUMOR';

export interface Card {
  id: string;
  name: string;
  type: CardType;
  value: number;
  /** PROPERTY: the color group this card belongs to. RENT (single-color): the color it charges rent for. */
  color?: PropertyColor;
  /** RENT (wild): the colors this card may charge rent for — the player picks one when playing it. */
  wildColors?: PropertyColor[];
  /** RENT (wild, defaults to 'ALL'): 'SINGLE' restricts a wild rent card to one chosen opponent
   * instead of charging every opponent, matching the real game's fully-wild rent card. */
  rentScope?: 'ALL' | 'SINGLE';
  /** Rent by count of same-color properties owned, indexed from 0 (tier for owning 1 card). */
  rentTiers?: number[];
  actionType?: ActionType;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  field: Record<PropertyColor, Card[]>;
  bank: Card[];
}

export type ModifierTarget = 'RENT' | 'ACTION_LIMIT' | 'DRAW_COUNT';
export type ModifierOperator = 'ADD' | 'MULTIPLY' | 'OVERRIDE';

export interface Modifier {
  target: ModifierTarget;
  operator: ModifierOperator;
  value: number;
}

export type SpecialEffect =
  | { effect: 'SKIP_TURN' }
  | { effect: 'DRAW_DEFENSIVE_CARDS'; count: number }
  | { effect: 'GRANT_BANK_ALL'; amount: number }
  | { effect: 'DISABLE_INCOMPLETE_SET_RENT' }
  | { effect: 'DISCARD_RANDOM_ALL' };

export interface MacroEvent {
  id: string;
  name: string;
  description: string;
  durationTurns: number;
  modifiers: Modifier[];
  /** One-off or rule-override effects that don't fit the numeric Modifier shape. */
  specialEffects?: SpecialEffect[];
}

export type TurnPhase = 'TURN_START' | 'ACTION' | 'REACTION_WINDOW' | 'TURN_END' | 'GAME_OVER';

export interface PlayCardTarget {
  playerId: string;
  color?: PropertyColor;
  /** The specific field card being targeted (SLY_DEAL, FORCED_DEAL). */
  cardId?: string;
  /** The active player's own field card offered in exchange (FORCED_DEAL). */
  offeredCardId?: string;
}

export interface PendingReaction {
  /** The action/rent card that triggered this reaction window. */
  card: Card;
  sourcePlayerId: string;
  /** Player ids still needing to respond, in order; the first is the current target. */
  targetQueue: string[];
  context?: PlayCardTarget;
  /** Resolved amount owed per target, for RENT and BIRTHDAY. */
  amount?: number;
  /** Whose response is needed right now — alternates between the target and the source as 封區 chains. */
  currentResponderId: string;
  /** Whether the effect is currently cancelled for targetQueue[0] (flips with each 封區 played). */
  cancelled: boolean;
}

export interface GameState {
  turn: number;
  activePlayerIndex: number;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  activeMacroEvents: MacroEvent[];
  rngSeed: number;
  phase: TurnPhase;
  /** Plays used out of the effective per-turn action limit (base 3, before ACTION_LIMIT modifiers). */
  actionsPlayedThisTurn: number;
  pendingReaction?: PendingReaction | undefined;
  /** Set by 孖展炒樓 (DOUBLE_RENT); consumed by the next RENT card played this turn. */
  pendingRentMultiplier?: number | undefined;
  winnerId?: string;
}

export type ActionPayload =
  | { type: 'DRAW'; playerId: string }
  | { type: 'PLAY_CARD'; playerId: string; cardId: string; asBank?: boolean; target?: PlayCardTarget }
  | {
      type: 'RESPOND';
      playerId: string;
      cardId?: string;
      response: 'ACCEPT' | 'JUST_SAY_NO' | 'COUNTER';
      /** Which of the responder's own bank/hand cards to pay a debt with, if any is owed.
       * Omitted (e.g. by bots) falls back to auto-picking the cheapest cards first. */
      paymentCardIds?: string[] | undefined;
    }
  | { type: 'END_TURN'; playerId: string };

export type GameEvent =
  | { type: 'CARDS_DRAWN'; playerId: string; count: number }
  | { type: 'MACRO_EVENT_TRIGGERED'; event: MacroEvent }
  | { type: 'MACRO_EVENT_EXPIRED'; eventId: string }
  | { type: 'CARD_BANKED'; playerId: string; cardId: string; amount: number }
  | { type: 'PROPERTY_BUILT'; playerId: string; cardId: string; color: PropertyColor }
  | { type: 'REACTION_REQUESTED'; playerId: string; card: Card }
  | { type: 'REACTION_RESOLVED'; playerId: string; response: 'ACCEPT' | 'JUST_SAY_NO' | 'COUNTER' }
  | { type: 'RENT_CHARGED'; fromPlayerId: string; toPlayerId: string; amount: number }
  | { type: 'RENT_MULTIPLIED'; playerId: string; multiplier: number }
  | { type: 'PROPERTY_STOLEN'; fromPlayerId: string; toPlayerId: string; cardId: string }
  | { type: 'SET_STOLEN'; fromPlayerId: string; toPlayerId: string; color: PropertyColor }
  | { type: 'PROPERTY_SWAPPED'; playerAId: string; playerBId: string; cardAId: string; cardBId: string }
  | { type: 'HAND_DISCARDED'; playerId: string; count: number }
  | { type: 'HAND_CARD_STOLEN'; fromPlayerId: string; toPlayerId: string; success: boolean }
  | { type: 'PROPERTY_PROTECTED'; playerId: string; color: PropertyColor }
  | { type: 'IMPROVEMENT_STRIPPED'; fromPlayerId: string; toPlayerId: string; color: PropertyColor }
  | { type: 'PROPERTY_STIGMATIZED'; fromPlayerId: string; toPlayerId: string; cardId: string }
  | { type: 'TURN_ENDED'; playerId: string }
  | { type: 'GAME_WON'; playerId: string }
  | { type: 'INVALID_ACTION'; reason: string };
