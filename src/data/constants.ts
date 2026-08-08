import type { PropertyColor } from '../types/game';

export const PROPERTY_COLORS: PropertyColor[] = [
  'PUBLIC_HOUSING',
  'OLD_TONG_LAU',
  'ESTATE',
  'COMMERCIAL_LUXURY',
  'TRANSPORT',
];

/** Number of same-color property cards needed to complete a set (matches the 3-card color groups in src/data/cards.ts). */
export const COMPLETE_SET_SIZE = 3;
