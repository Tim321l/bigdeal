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
  | 'HAUNTED_RUMOR'
  | 'ASSET_REORG'
  | 'ATM_WITHDRAWAL'
  | 'MONEY_LAUNDERING'
  | 'LIQUIDATOR_TAKEOVER'
  | 'REVERSE_MORTGAGE';

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
  /** BATTLE_ROYALE only: set once a charge they can't cover strips them of everything. Turn
   * rotation skips eliminated players; CLASSIC mode never sets this. */
  eliminated?: boolean;
  /** SYNDICATE only: 0 or 1, assigned by seat parity at initGame. Teammates can't be targeted by
   * aggressive cards and their complete-set counts pool together for the win condition. */
  teamId?: number;
}

/** CLASSIC: first to 3 complete sets wins. BATTLE_ROYALE: rent/money-demand amounts are doubled
 * and a payer who can't cover a charge is eliminated (everything they own transfers to the
 * collector) — last player standing wins. SYNDICATE: exactly 4 players in 2 teams of 2 (seat
 * parity); a team wins once its members' properties pool to 4 complete sets combined; teammates
 * can gift a hand card to each other and can't target each other with aggressive cards. */
export type GameMode = 'CLASSIC' | 'BATTLE_ROYALE' | 'SYNDICATE';

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
  /** The specific field/bank card being targeted (SLY_DEAL, FORCED_DEAL, and the bank-reactivation cards). */
  cardId?: string;
  /** The active player's own field card offered in exchange (FORCED_DEAL). */
  offeredCardId?: string;
  /** Multiple own-bank cards at once (提款機壞咗 pulls up to 2). */
  cardIds?: string[];
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
  mode: GameMode;
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
  | { type: 'END_TURN'; playerId: string }
  | { type: 'GIFT_CARD'; playerId: string; cardId: string; toPlayerId: string };

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
  | { type: 'BANK_WITHDRAWN'; playerId: string; count: number }
  | { type: 'BANK_RENT_LAUNDERED'; playerId: string; cardId: string }
  | { type: 'BANK_CARD_SEIZED'; fromPlayerId: string; toPlayerId: string; cardId: string }
  | { type: 'CARD_BURIED'; playerId: string; cardId: string }
  | { type: 'PLAYER_ELIMINATED'; playerId: string; collectorId: string }
  /** cardId deliberately omitted — a gift moves between two hands, and even the identity of
   * "which card" is otherwise-hidden information that no third player should see in the log. */
  | { type: 'CARD_GIFTED'; fromPlayerId: string; toPlayerId: string }
  | { type: 'TURN_ENDED'; playerId: string }
  | { type: 'GAME_WON'; playerId: string }
  | { type: 'INVALID_ACTION'; reason: string };
