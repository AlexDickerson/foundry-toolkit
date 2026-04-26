import type { PhysicalItem, PointPool } from '../api/types';

export function supportsInvestment(item: PhysicalItem): boolean {
  const { invested } = item.system.equipped;
  return invested !== null && invested !== undefined && item.system.traits.value.includes('invested');
}

export function wouldExceedInvestmentCap(investiture: PointPool, item: PhysicalItem): boolean {
  if (item.system.equipped.invested === true) return false;
  return investiture.value >= investiture.max;
}
