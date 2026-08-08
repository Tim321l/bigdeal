import type { PropertyColor } from '../types';

interface WindowGridProps {
  x: number;
  y: number;
  w: number;
  h: number;
  rows: number;
  cols: number;
}

/** A grid of small "window" rects — the shared building block every property icon is made of. */
function WindowGrid({ x, y, w, h, rows, cols }: WindowGridProps) {
  const cellW = w / cols;
  const cellH = h / rows;
  const pad = Math.min(cellW, cellH) * 0.28;
  const cells: React.ReactElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={x + c * cellW + pad}
          y={y + r * cellH + pad}
          width={cellW - pad * 2}
          height={cellH - pad * 2}
        />,
      );
    }
  }
  return <>{cells}</>;
}

function PublicHousingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="card__icon-svg" fill="currentColor">
      <rect x="4" y="3" width="16" height="18" rx="1" fillOpacity="0.35" />
      <WindowGrid x={6} y={5} w={12} h={14} rows={4} cols={3} />
    </svg>
  );
}

function TongLauIcon() {
  return (
    <svg viewBox="0 0 24 24" className="card__icon-svg" fill="currentColor">
      <rect x="7" y="2" width="10" height="19" fillOpacity="0.35" />
      <WindowGrid x={8} y={3.5} w={8} h={12} rows={4} cols={2} />
      <rect x="9.5" y="17" width="5" height="4" />
    </svg>
  );
}

function EstateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="card__icon-svg" fill="currentColor">
      <rect x="2.5" y="8" width="7" height="13" fillOpacity="0.35" />
      <WindowGrid x={3.5} y={9.5} w={5} h={10} rows={4} cols={2} />
      <rect x="13.5" y="3" width="8" height="18" fillOpacity="0.35" />
      <WindowGrid x={14.5} y={4.5} w={6} h={15} rows={5} cols={2} />
    </svg>
  );
}

function SkyscraperIcon() {
  return (
    <svg viewBox="0 0 24 24" className="card__icon-svg" fill="currentColor">
      <polygon points="12,1.5 18,6 18,21 6,21 6,6" fillOpacity="0.35" />
      <WindowGrid x={7.5} y={8} w={9} h={11} rows={5} cols={3} />
    </svg>
  );
}

function TrainIcon() {
  return (
    <svg viewBox="0 0 24 24" className="card__icon-svg" fill="currentColor">
      <rect x="4" y="5" width="16" height="12" rx="3" fillOpacity="0.35" />
      <rect x="6.5" y="7.5" width="4.5" height="4" />
      <rect x="13" y="7.5" width="4.5" height="4" />
      <circle cx="8" cy="19" r="1.4" />
      <circle cx="16" cy="19" r="1.4" />
    </svg>
  );
}

function ActionIcon() {
  return (
    <svg viewBox="0 0 24 24" className="card__icon-svg" fill="currentColor">
      <polygon points="13,1 4,14 11,14 9,23 20,9 12,9" />
    </svg>
  );
}

function RentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="card__icon-svg" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" />
      <line x1="8.5" y1="7" x2="15.5" y2="7" />
      <line x1="8.5" y1="10.5" x2="15.5" y2="10.5" />
      <line x1="8.5" y1="14" x2="13" y2="14" />
    </svg>
  );
}

function MoneyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="card__icon-svg" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

const PROPERTY_ICONS: Record<PropertyColor, () => React.ReactElement> = {
  PUBLIC_HOUSING: PublicHousingIcon,
  OLD_TONG_LAU: TongLauIcon,
  ESTATE: EstateIcon,
  COMMERCIAL_LUXURY: SkyscraperIcon,
  TRANSPORT: TrainIcon,
};

export function PropertyColorIcon({ color }: { color: PropertyColor }) {
  const Icon = PROPERTY_ICONS[color];
  return <Icon />;
}

export { ActionIcon, MoneyIcon, RentIcon };
