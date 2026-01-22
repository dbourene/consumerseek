import { TrancheConso } from '../types/consommateur';

/**
 * Calcule la tranche de consommation à partir de la consommation annuelle en MWh
 */
export function calculateTrancheConso(consommationMWh: number): TrancheConso {
  if (consommationMWh <= 10) return '[0-10]';
  if (consommationMWh <= 50) return ']10-50]';
  if (consommationMWh <= 100) return ']50-100]';
  if (consommationMWh <= 250) return ']100-250]';
  if (consommationMWh <= 500) return ']250-500]';
  if (consommationMWh <= 1000) return ']500-1000]';
  if (consommationMWh <= 2000) return ']1000-2000]';
  return '>2000';
}
