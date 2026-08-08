/**
 * Categorical colour per sector — assigned once, in fixed order, and never
 * re-assigned when a filter changes which stocks are on screen. Sector colour
 * identifies the sector, never its rank or performance (green/red stay
 * reserved for P/L direction).
 */
export const SECTOR_TINT = {
  Aviation: '#38BDF8',
  Agriculture: '#84CC16',
  'Oil & Gas': '#F59E0B',
  Retail: '#EC4899',
  Telecom: '#8B5CF6',
  'Shipping/Logistics': '#06B6D4',
  Automobile: '#EF4444',
  Defense: '#94A3B8',
  'Real Estate': '#F97316',
  Technology: '#3B82F6',
  'Banking/Finance': '#6366F1',
  Pharmaceuticals: '#14B8A6',
  'Renewable Energy': '#10B981',
  'Precious Metals': '#EAB308',
  'Media/Entertainment': '#D946EF',
  default: '#7A8195'
};

export function sectorTint(sector) {
  return SECTOR_TINT[sector] || SECTOR_TINT.default;
}
