import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/stateManager';
import { cardById, makeField, makePlayer, makeState } from './testUtils';

describe('物業重組 (ASSET_REORG)', () => {
  it('moves a plain property card from bank straight to the field', () => {
    const reorg = cardById('action-asset-reorg');
    const bankedProperty = cardById('estate-taikoo-shing');

    const alice = makePlayer('player-1', 'Alice', { hand: [reorg], bank: [bankedProperty] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: reorg.id,
      target: { playerId: 'player-1', cardId: bankedProperty.id, color: 'ESTATE' },
    });

    expect(nextState.players[0]?.bank).toHaveLength(0);
    expect(nextState.players[0]?.field.ESTATE).toContainEqual(bankedProperty);
    expect(events).toContainEqual({ type: 'PROPERTY_BUILT', playerId: 'player-1', cardId: bankedProperty.id, color: 'ESTATE' });
  });

  it('moves a banked House card onto an eligible complete set', () => {
    const reorg = cardById('action-asset-reorg');
    const bankedHouse = cardById('action-house');
    const complete = ['estate-taikoo-shing', 'estate-mei-foo-sun-chuen', 'estate-city-one'].map(cardById);

    const alice = makePlayer('player-1', 'Alice', {
      hand: [reorg],
      bank: [bankedHouse],
      field: { ...makeField(), ESTATE: complete },
    });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: reorg.id,
      target: { playerId: 'player-1', cardId: bankedHouse.id, color: 'ESTATE' },
    });

    expect(nextState.players[0]?.bank).toHaveLength(0);
    expect(nextState.players[0]?.field.ESTATE).toContainEqual(bankedHouse);
  });

  it('rejects a banked House with no complete set to attach to', () => {
    const reorg = cardById('action-asset-reorg');
    const bankedHouse = cardById('action-house');

    const alice = makePlayer('player-1', 'Alice', { hand: [reorg], bank: [bankedHouse] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: reorg.id,
      target: { playerId: 'player-1', cardId: bankedHouse.id, color: 'ESTATE' },
    });

    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.bank).toContainEqual(bankedHouse);
    expect(nextState.players[0]?.hand).toContainEqual(reorg);
  });
});

describe('提款機壞咗 (ATM_WITHDRAWAL)', () => {
  it('pulls up to 2 chosen non-cash cards from bank back to hand', () => {
    const atm = cardById('action-atm-withdrawal');
    const rentCard = cardById('rent-estate');
    const actionCard = cardById('action-birthday');
    const moneyCard = cardById('money-1m-a');

    const alice = makePlayer('player-1', 'Alice', { hand: [atm], bank: [rentCard, actionCard, moneyCard] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: atm.id,
      target: { playerId: 'player-1', cardIds: [rentCard.id, actionCard.id] },
    });

    expect(nextState.players[0]?.hand).toContainEqual(rentCard);
    expect(nextState.players[0]?.hand).toContainEqual(actionCard);
    expect(nextState.players[0]?.bank).toEqual([moneyCard]);
    expect(events).toContainEqual({ type: 'BANK_WITHDRAWN', playerId: 'player-1', count: 2 });
  });

  it('filters out any chosen MONEY card rather than withdrawing it', () => {
    const atm = cardById('action-atm-withdrawal');
    const rentCard = cardById('rent-estate');
    const moneyCard = cardById('money-1m-a');

    const alice = makePlayer('player-1', 'Alice', { hand: [atm], bank: [rentCard, moneyCard] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: atm.id,
      target: { playerId: 'player-1', cardIds: [rentCard.id, moneyCard.id] },
    });

    expect(nextState.players[0]?.hand).toContainEqual(rentCard);
    expect(nextState.players[0]?.bank).toContainEqual(moneyCard);
  });

  it('rejects an empty selection', () => {
    const atm = cardById('action-atm-withdrawal');
    const alice = makePlayer('player-1', 'Alice', { hand: [atm], bank: [cardById('money-1m-a')] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { events, nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: atm.id,
      target: { playerId: 'player-1', cardIds: [] },
    });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(atm);
  });
});

describe('洗黑錢 (MONEY_LAUNDERING)', () => {
  it('activates a rent card straight out of the bank, opening a reaction window', () => {
    const laundering = cardById('action-money-laundering');
    const bankedRent = cardById('rent-estate');
    const propCard = cardById('estate-taikoo-shing');

    const alice = makePlayer('player-1', 'Alice', {
      hand: [laundering],
      bank: [bankedRent],
      field: { ...makeField(), ESTATE: [propCard] },
    });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: laundering.id,
      target: { playerId: 'player-1', cardId: bankedRent.id },
    });

    expect(nextState.players[0]?.bank).toHaveLength(0);
    expect(nextState.phase).toBe('REACTION_WINDOW');
    expect(nextState.pendingReaction?.amount).toBe(2);
    expect(events).toContainEqual({ type: 'BANK_RENT_LAUNDERED', playerId: 'player-1', cardId: bankedRent.id });
  });

  it('returns an unusable banked rent card to the bank, not the hand, while still discarding 洗黑錢 itself', () => {
    const laundering = cardById('action-money-laundering');
    const bankedRent = cardById('rent-estate'); // no ESTATE property owned

    const alice = makePlayer('player-1', 'Alice', { hand: [laundering], bank: [bankedRent] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: laundering.id,
      target: { playerId: 'player-1', cardId: bankedRent.id },
    });

    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.bank).toContainEqual(bankedRent);
    expect(nextState.players[0]?.hand).not.toContainEqual(bankedRent);
    expect(nextState.discardPile).toContainEqual(laundering);
  });

  it('rejects choosing a non-rent card from the bank', () => {
    const laundering = cardById('action-money-laundering');
    const bankedAction = cardById('action-birthday');

    const alice = makePlayer('player-1', 'Alice', { hand: [laundering], bank: [bankedAction] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { events, nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: laundering.id,
      target: { playerId: 'player-1', cardId: bankedAction.id },
    });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(laundering);
    expect(nextState.players[0]?.bank).toContainEqual(bankedAction);
  });
});

describe('接管清盤人 (LIQUIDATOR_TAKEOVER)', () => {
  it('seizes a non-cash card from an opponent bank into the seizer’s hand', () => {
    const takeover = cardById('action-liquidator-takeover');
    const bankedRent = cardById('rent-estate');

    const alice = makePlayer('player-1', 'Alice', { hand: [takeover] });
    const bob = makePlayer('player-2', 'Bob', { bank: [bankedRent, cardById('money-1m-a')] });
    const state = makeState({ players: [alice, bob] });

    const afterPlay = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: takeover.id,
      target: { playerId: 'player-2', cardId: bankedRent.id },
    });
    expect(afterPlay.nextState.phase).toBe('REACTION_WINDOW');

    const afterAccept = applyAction(afterPlay.nextState, { type: 'RESPOND', playerId: 'player-2', response: 'ACCEPT' });

    expect(afterAccept.nextState.players[0]?.hand).toContainEqual(bankedRent);
    expect(afterAccept.nextState.players[1]?.bank).not.toContainEqual(bankedRent);
    expect(afterAccept.events).toContainEqual({
      type: 'BANK_CARD_SEIZED',
      fromPlayerId: 'player-2',
      toPlayerId: 'player-1',
      cardId: bankedRent.id,
    });
  });

  it('can be cancelled with Just Say No', () => {
    const takeover = cardById('action-liquidator-takeover');
    const justSayNo = cardById('action-just-say-no');
    const bankedRent = cardById('rent-estate');

    const alice = makePlayer('player-1', 'Alice', { hand: [takeover] });
    const bob = makePlayer('player-2', 'Bob', { hand: [justSayNo], bank: [bankedRent] });
    const state = makeState({ players: [alice, bob] });

    const afterPlay = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: takeover.id,
      target: { playerId: 'player-2', cardId: bankedRent.id },
    });
    const afterCancel = applyAction(afterPlay.nextState, {
      type: 'RESPOND',
      playerId: 'player-2',
      response: 'JUST_SAY_NO',
      cardId: justSayNo.id,
    });
    const afterFinal = applyAction(afterCancel.nextState, { type: 'RESPOND', playerId: 'player-1', response: 'ACCEPT' });

    expect(afterFinal.nextState.players[1]?.bank).toContainEqual(bankedRent);
    expect(afterFinal.nextState.players[0]?.hand).not.toContainEqual(bankedRent);
  });

  it('rejects targeting a MONEY card in the bank', () => {
    const takeover = cardById('action-liquidator-takeover');
    const moneyCard = cardById('money-1m-a');

    const alice = makePlayer('player-1', 'Alice', { hand: [takeover] });
    const bob = makePlayer('player-2', 'Bob', { bank: [moneyCard] });
    const state = makeState({ players: [alice, bob] });

    const { events, nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: takeover.id,
      target: { playerId: 'player-2', cardId: moneyCard.id },
    });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(takeover);
  });
});

describe('逆按揭 (REVERSE_MORTGAGE)', () => {
  it('buries a non-cash bank card at the bottom of the deck and draws 3', () => {
    const mortgage = cardById('action-reverse-mortgage');
    const bankedAction = cardById('action-birthday');
    // 3 filler cards above the buried one, so drawing 3 doesn't immediately redraw it back out —
    // drawCards pops from the end, and burying unshifts to the front (the "bottom").
    const deckCards = ['money-2m-a', 'money-2m-b', 'money-2m-c'].map(cardById);

    const alice = makePlayer('player-1', 'Alice', { hand: [mortgage], bank: [bankedAction] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob], deck: deckCards });

    const { nextState, events } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: mortgage.id,
      target: { playerId: 'player-1', cardId: bankedAction.id },
    });

    expect(nextState.players[0]?.bank).toHaveLength(0);
    expect(nextState.deck).toEqual([bankedAction]);
    expect(nextState.players[0]?.hand).toEqual(expect.arrayContaining(deckCards));
    expect(events).toContainEqual({ type: 'CARD_BURIED', playerId: 'player-1', cardId: bankedAction.id });
  });

  it('rejects targeting a MONEY card', () => {
    const mortgage = cardById('action-reverse-mortgage');
    const moneyCard = cardById('money-1m-a');

    const alice = makePlayer('player-1', 'Alice', { hand: [mortgage], bank: [moneyCard] });
    const bob = makePlayer('player-2', 'Bob');
    const state = makeState({ players: [alice, bob] });

    const { events, nextState } = applyAction(state, {
      type: 'PLAY_CARD',
      playerId: 'player-1',
      cardId: mortgage.id,
      target: { playerId: 'player-1', cardId: moneyCard.id },
    });
    expect(events.some((e) => e.type === 'INVALID_ACTION')).toBe(true);
    expect(nextState.players[0]?.hand).toContainEqual(mortgage);
  });
});
