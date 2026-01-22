import { Activity, Zap, Save } from 'lucide-react';

interface ConsumersIndicatorsProps {
  nombreConsommateurs: number;
  consommationAnnuelle: number;
  loading?: boolean;
  onSave?: () => void;
  canSave?: boolean;
}

export default function ConsumersIndicators({
  nombreConsommateurs,
  consommationAnnuelle,
  loading = false,
  onSave,
  canSave = false
}: ConsumersIndicatorsProps) {
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('fr-FR').format(Math.round(num));
  };

  const formatEnergy = (mwh: number): string => {
    if (mwh >= 1000) {
      return `${(mwh / 1000).toFixed(1)} GWh`;
    }
    return `${formatNumber(mwh)} MWh`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-4">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-6 flex-1">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg">
              <Activity className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">
                Nombre de consommateurs
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {loading ? (
                  <div className="h-8 w-24 bg-gray-200 animate-pulse rounded" />
                ) : (
                  formatNumber(nombreConsommateurs)
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg">
              <Zap className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-sm text-gray-600">
                Consommation annuelle
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {loading ? (
                  <div className="h-8 w-32 bg-gray-200 animate-pulse rounded" />
                ) : (
                  formatEnergy(consommationAnnuelle)
                )}
              </div>
            </div>
          </div>
        </div>

        {canSave && onSave && (
          <button
            onClick={onSave}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-md"
          >
            <Save className="w-5 h-5" />
            Enregistrer
          </button>
        )}
      </div>
    </div>
  );
}
