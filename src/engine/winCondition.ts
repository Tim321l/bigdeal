import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../data/constants';
import type { GameState, Player } from '../types/game';

/** SYNDICATE teams need more combined sets than a solo CLASSIC win — pooling two players'
 * property makes 3 too easy to hit accidentally along the way. */
const SYNDICATE_SETS_TO_WIN = 4;

export function countCompleteSets(player: Player): number {
  // NOT field[color].length — 釘子戶 (NAIL_HOUSE) can attach to an incomplete set, so the raw
  // array can include a non-property card without 3 actual properties being present.
  return PROPERTY_COLORS.filter(
    (color) => player.field[color].filter((card) => card.type === 'PROPERTY').length >= COMPLETE_SET_SIZE,
  ).length;
}

/** SYNDICATE: a color counts for the team once its members' PROPERTY cards for that color, added
 * together, reach COMPLETE_SET_SIZE — even if neither teammate individually owns a full set. */
export function countTeamCompleteSets(state: GameState, teamId: number): number {
  const teammates = state.players.filter((p) => p.teamId === teamId);
  return PROPERTY_COLORS.filter((color) => {
    const combined = teammates.reduce(
      (sum, p) => sum + p.field[color].filter((card) => card.type === 'PROPERTY').length,
      0,
    );
    return combined >= COMPLETE_SET_SIZE;
  }).length;
}

export function hasWon(player: Player): boolean {
  return countCompleteSets(player) >= 3;
}

export function checkWinner(state: GameState): string | undefined {
  if (state.mode === 'BATTLE_ROYALE') {
    const survivors = state.players.filter((player) => !player.eliminated);
    return survivors.length === 1 ? survivors[0]?.id : undefined;
  }
  if (state.mode === 'SYNDICATE') {
    const teamIds = [...new Set(state.players.map((p) => p.teamId).filter((id): id is number => id !== undefined))];
    for (const teamId of teamIds) {
      if (countTeamCompleteSets(state, teamId) >= SYNDICATE_SETS_TO_WIN) {
        // No single "winner" in a team game — report the lowest-seated teammate as the
        // representative id; the client cross-references teamId to show it as a team win.
        return state.players.find((p) => p.teamId === teamId)?.id;
      }
    }
    return undefined;
  }
  return state.players.find((player) => hasWon(player))?.id;
}
