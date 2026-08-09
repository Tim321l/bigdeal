export type BoardTileKind = 'GO' | 'FREE' | 'AUCTION' | 'STORM' | 'RENOVATION' | 'PROPERTY';

export interface BoardTile {
  position: number;
  kind: BoardTileKind;
  /** PROPERTY tiles only — references a `src/data/cards.ts` PROPERTY card id. Value/color/
   * rentTiers are looked up from there, never duplicated here. */
  cardId?: string;
}

/** REAL_BIG_DEAL mode only — a fixed 32-tile square loop (4 corners + 7 tiles/side), canonical
 * across every game (only *ownership* varies, not layout — like a real Monopoly board). The 28
 * edge tiles hold all 25 existing PROPERTY cards (5 colors x 5 each), plus an extra AUCTION tile
 * and two 維修中 (RENOVATION) tiles — a Jail-equivalent that skips the landing player's next
 * roll — so those trigger more than once per lap around the board. Most colors still run in
 * contiguous blocks per side, except TRANSPORT: its 5 tiles are deliberately spread one-per-side
 * (plus a 5th alongside another) rather than clustered on one side, like real Monopoly's
 * railroads — positions 7, 13, 19, 27, 28. */
export const BOARD_TILES: BoardTile[] = [
  { position: 0, kind: 'GO' },
  { position: 1, kind: 'PROPERTY', cardId: 'public-housing-tin-shing-yuen' },
  { position: 2, kind: 'PROPERTY', cardId: 'public-housing-yau-oi-estate' },
  { position: 3, kind: 'PROPERTY', cardId: 'public-housing-ngau-tau-kok-lower-estate' },
  { position: 4, kind: 'RENOVATION' },
  { position: 5, kind: 'PROPERTY', cardId: 'public-housing-shek-lei-estate' },
  { position: 6, kind: 'PROPERTY', cardId: 'public-housing-choi-hung-estate' },
  { position: 7, kind: 'PROPERTY', cardId: 'transport-third-runway' },
  { position: 8, kind: 'AUCTION' },
  { position: 9, kind: 'PROPERTY', cardId: 'tong-lau-ladies-market' },
  { position: 10, kind: 'PROPERTY', cardId: 'tong-lau-nga-tsin-wai-road' },
  { position: 11, kind: 'PROPERTY', cardId: 'tong-lau-wan-chai-blue-house' },
  { position: 12, kind: 'AUCTION' },
  { position: 13, kind: 'PROPERTY', cardId: 'transport-high-speed-rail' },
  { position: 14, kind: 'PROPERTY', cardId: 'estate-taikoo-shing' },
  { position: 15, kind: 'PROPERTY', cardId: 'estate-mei-foo-sun-chuen' },
  { position: 16, kind: 'STORM' },
  { position: 17, kind: 'PROPERTY', cardId: 'estate-city-one' },
  { position: 18, kind: 'PROPERTY', cardId: 'estate-south-horizons' },
  { position: 19, kind: 'PROPERTY', cardId: 'transport-tsing-ma-bridge' },
  { position: 20, kind: 'RENOVATION' },
  { position: 21, kind: 'PROPERTY', cardId: 'commercial-ifc' },
  { position: 22, kind: 'PROPERTY', cardId: 'commercial-k11' },
  { position: 23, kind: 'PROPERTY', cardId: 'commercial-sze-fan-road' },
  { position: 24, kind: 'FREE' },
  { position: 25, kind: 'PROPERTY', cardId: 'commercial-pacific-place' },
  { position: 26, kind: 'PROPERTY', cardId: 'commercial-the-center' },
  { position: 27, kind: 'PROPERTY', cardId: 'transport-island-line' },
  { position: 28, kind: 'PROPERTY', cardId: 'transport-interchange-station' },
  { position: 29, kind: 'PROPERTY', cardId: 'tong-lau-apliu-street' },
  { position: 30, kind: 'PROPERTY', cardId: 'tong-lau-ki-lung-street' },
  { position: 31, kind: 'PROPERTY', cardId: 'estate-kingswood-villas' },
];

export const BOARD_SIZE = BOARD_TILES.length;

/** $2M, granted on landing on or passing GO. */
export const GO_BONUS = 2;
