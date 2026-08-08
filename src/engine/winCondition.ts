import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../data/constants';
import type { GameState, Player } from '../types/game';

export function countCompleteSets(player: Player): number {
  return PROPERTY_COLORS.filter((color) => player.field[color].length >= COMPLETE_SET_SIZE).length;
}

export function hasWon(player: Player): boolean {
  return countCompleteSets(player) >= 3;
}

export function checkWinner(state: GameState): string | undefined {
  return state.players.find((player) => hasWon(player))?.id;
}
