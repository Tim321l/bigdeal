import { BOARD_TILES } from '../../../src/data/board';
import { tileCard } from '../../../src/engine/board';
import type { PropertyColor, SanitizedGameState } from '../types';
import { PropertyColorIcon } from './CardIcons';

/** Up to 5 seats (MAX_PLAYERS) — cycles if somehow exceeded, but never will. */
const SEAT_COLORS = ['#c8102e', '#2f9e8f', '#7c4dbd', '#b8860b', '#3b6fd6'];

const SPECIAL_TILE_INFO: Record<'GO' | 'FREE' | 'AUCTION' | 'STORM' | 'RENOVATION', { icon: string; name: string }> = {
  GO: { icon: '🏁', name: '起點' },
  AUCTION: { icon: '🔨', name: '拍賣行' },
  STORM: { icon: '⛈️', name: '突發風暴區' },
  FREE: { icon: '🅿️', name: '自由地' },
  RENOVATION: { icon: '🚧', name: '維修中' },
};

/** Places all 32 tiles around a 9x9 CSS grid loop: corners at (9,9)=GO, (9,1)=AUCTION,
 * (1,1)=STORM, (1,9)=FREE, edges running between them — the center 7x7 stays free for the dice
 * control and turn readout. */
function gridPosition(tileIndex: number): { row: number; col: number } {
  if (tileIndex <= 8) return { row: 9, col: 9 - tileIndex };
  if (tileIndex <= 16) return { row: 9 - (tileIndex - 8), col: 1 };
  if (tileIndex <= 24) return { row: 1, col: 1 + (tileIndex - 16) };
  return { row: 1 + (tileIndex - 24), col: 9 };
}

interface BoardMapProps {
  game: SanitizedGameState;
  myGamePlayerId: string;
}

export function BoardMap({ game, myGamePlayerId }: BoardMapProps) {
  const activePlayer = game.players[game.activePlayerIndex];

  const ownerOf = (color: PropertyColor, cardId: string) =>
    game.players.find((p) => p.field[color].some((c) => c.id === cardId));

  return (
    <div className="board-wrap">
      <div className="board-map">
        {BOARD_TILES.map((tile) => {
          const { row, col } = gridPosition(tile.position);
          const card = tile.kind === 'PROPERTY' ? tileCard(tile.position) : undefined;
          const color = card?.color;
          const owner = color && card ? ownerOf(color, card.id) : undefined;
          const ownerSeatIndex = owner ? game.players.findIndex((p) => p.id === owner.id) : -1;
          const hasHouse = owner && color ? owner.field[color].some((c) => c.actionType === 'HOUSE') : false;
          const hasHotel = owner && color ? owner.field[color].some((c) => c.actionType === 'HOTEL') : false;
          const playersHere = game.players.filter((p) => p.position === tile.position);
          const colorSlug = color ? color.toLowerCase().replace(/_/g, '-') : undefined;
          const special = tile.kind !== 'PROPERTY' ? SPECIAL_TILE_INFO[tile.kind] : undefined;

          return (
            <div
              key={tile.position}
              className={`board-tile board-tile--${tile.kind.toLowerCase()}${colorSlug ? ` board-tile--color-${colorSlug}` : ''}`}
              style={{
                gridRow: row,
                gridColumn: col,
                ...(ownerSeatIndex >= 0
                  ? { boxShadow: `inset 0 0 0 3px ${SEAT_COLORS[ownerSeatIndex % SEAT_COLORS.length]}` }
                  : {}),
              }}
            >
              {card && color ? (
                <>
                  <span className="board-tile__icon">
                    <PropertyColorIcon color={color} />
                  </span>
                  <span className="board-tile__name">{card.name}</span>
                  <span className="board-tile__price">${card.value}M</span>
                  {(hasHouse || hasHotel) && (
                    <span className="board-tile__improvement">{hasHotel ? '🏨' : '🏠'}</span>
                  )}
                </>
              ) : special ? (
                <>
                  <span className="board-tile__icon">{special.icon}</span>
                  <span className="board-tile__name">{special.name}</span>
                </>
              ) : null}
              {playersHere.length > 0 && (
                <span className="board-tile__tokens">
                  {playersHere.map((p) => {
                    const seatIndex = game.players.findIndex((x) => x.id === p.id);
                    return (
                      <span
                        key={p.id}
                        className={`board-token${p.id === activePlayer?.id ? ' board-token--active' : ''}`}
                        style={{ background: SEAT_COLORS[seatIndex % SEAT_COLORS.length] }}
                        title={p.name}
                      >
                        {p.name.slice(0, 1)}
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
          );
        })}
        <div className="board-center">
          <span className="board-center__turn">
            {activePlayer?.id === myGamePlayerId ? '輪到你' : `輪到 ${activePlayer?.name ?? '?'}`}
          </span>
        </div>
      </div>

      <ul className="board-legend">
        {game.players.map((p, index) => {
          const bankTotal = p.bank.reduce((sum, c) => sum + c.value, 0);
          const propertyCount = Object.values(p.field).reduce(
            (sum, cards) => sum + cards.filter((c) => c.type === 'PROPERTY').length,
            0,
          );
          return (
            <li key={p.id} className={`board-legend__item${p.id === activePlayer?.id ? ' board-legend__item--active' : ''}`}>
              <span className="board-legend__swatch" style={{ background: SEAT_COLORS[index % SEAT_COLORS.length] }} />
              <span className="board-legend__name">
                {p.name}
                {p.id === myGamePlayerId ? '(你)' : ''}
                {p.eliminated ? ' 💥' : ''}
                {p.skipNextRoll ? ' 🚧' : ''}
              </span>
              <span className="board-legend__stat">
                銀行 ${bankTotal}M · {propertyCount} 個地皮
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
