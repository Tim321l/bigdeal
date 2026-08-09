import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../data/constants';
import type { GameState, Player } from '../types/game';

export function countCompleteSets(player: Player): number {
  // NOT field[color].length — 釘子戶 (NAIL_HOUSE) can attach to an incomplete set, so the raw
  // array can include a non-property card without 3 actual properties being present.
  return PROPERTY_COLORS.filter(
    (color) => player.field[color].filter((card) => card.type === 'PROPERTY').length >= COMPLETE_SET_SIZE,
  ).length;
}

export function hasWon(player: Player): boolean {
  return countCompleteSets(player) >= 3;
}

export function checkWinner(state: GameState): string | undefined {
  if (state.mode === 'BATTLE_ROYALE') {
    const survivors = state.players.filter((player) => !player.eliminated);
    return survivors.length === 1 ? survivors[0]?.id : undefined;
  }
  return state.players.find((player) => hasWon(player))?.id;
}
