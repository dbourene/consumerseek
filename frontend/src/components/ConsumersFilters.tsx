import { Filter } from 'lucide-react';
import {
  TRANCHES_CONSO,
  CATEGORIES_ACTIVITE,
  TrancheConso,
  CategorieActivite
} from '../types/consommateur';

interface ConsumersFiltersProps {
  selectedTranches: Set<TrancheConso>;
  selectedCategories: Set<CategorieActivite>;
  onTrancheToggle: (tranche: TrancheConso) => void;
  onCategoryToggle: (category: CategorieActivite) => void;
}

export default function ConsumersFilters({
  selectedTranches,
  selectedCategories,
  onTrancheToggle,
  onCategoryToggle
}: ConsumersFiltersProps) {
  return (
    <div className="absolute top-4 right-4 z-[1000] bg-white rounded-lg shadow-lg p-4 max-w-xs">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-gray-700" />
        <h3 className="font-semibold text-gray-900">Filtres</h3>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Tranche de consommation
          </h4>
          <div className="space-y-1.5">
            {TRANCHES_CONSO.map(tranche => (
              <label
                key={tranche}
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded transition"
              >
                <input
                  type="checkbox"
                  checked={selectedTranches.has(tranche)}
                  onChange={() => onTrancheToggle(tranche)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  {tranche} MWh
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Catégorie d'activité
          </h4>
          <div className="space-y-1.5">
            {CATEGORIES_ACTIVITE.map(category => (
              <label
                key={category}
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded transition"
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.has(category)}
                  onChange={() => onCategoryToggle(category)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{category}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
