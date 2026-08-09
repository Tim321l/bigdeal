import { COMPLETE_SET_SIZE, PROPERTY_COLORS } from '../data/constants';
import type { Card, GameState, Player, PropertyColor } from '../types/game';

/** SYNDICATE teams need more combined sets than a solo CLASSIC win — pooling two players'
 * property makes 3 too easy to hit accidentally along the way. BOSS_RAID pools all 2-4 players,
 * so it needs the same headroom for the same reason. */
const SYNDICATE_SETS_TO_WIN = 4;
const BOSS_RAID_SETS_TO_WIN = 4;
const BOSS_RAID_BANK_TARGET = 30;

export function countCompleteSets(player: Player): number {
  // NOT field[color].length — 釘子戶 (NAIL_HOUSE) can attach to an incomplete set, so the raw
  // array can include a non-property card without 3 actual properties being present.
  return PROPERTY_COLORS.filter(
    (color) => player.field[color].filter((card) => card.type === 'PROPERTY').length >= COMPLETE_SET_SIZE,
  ).length;
}

/** How many colors reach COMPLETE_SET_SIZE once `players`' PROPERTY cards for that color are
 * pooled together — even if no single one of them individually owns a full set. Used by both
 * SYNDICATE (pool = one team) and BOSS_RAID (pool = the whole table), and by the client to
 * render BOSS_RAID's co-op progress readout — hence the narrower `field`-only parameter type,
 * which SanitizedPlayer (no required `hand`) can satisfy too. */
export function countPooledCompleteSets(players: { field: Record<PropertyColor, Card[]> }[]): number {
  return PROPERTY_COLORS.filter((color) => {
    const combined = players.reduce((sum, p) => sum + p.field[color].filter((card) => card.type === 'PROPERTY').length, 0);
    return combined >= COMPLETE_SET_SIZE;
  }).length;
}

/** SYNDICATE: a color counts for the team once its members' PROPERTY cards for that color, added
 * together, reach COMPLETE_SET_SIZE — even if neither teammate individually owns a full set. */
export function countTeamCompleteSets(state: GameState, teamId: number): number {
  return countPooledCompleteSets(state.players.filter((p) => p.teamId === teamId));
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
  if (state.mode === 'BOSS_RAID') {
    const totalBank = state.players.reduce((sum, p) => sum + p.bank.reduce((s, c) => s + c.value, 0), 0);
    const combinedSets = countPooledCompleteSets(state.players);
    if (totalBank >= BOSS_RAID_BANK_TARGET || combinedSets >= BOSS_RAID_SETS_TO_WIN) {
      // Whole table wins together — report whoever's currently active as the representative id.
      return state.players[state.activePlayerIndex]?.id ?? state.players[0]?.id;
    }
    return undefined;
  }
  return state.players.find((player) => hasWon(player))?.id;
}
