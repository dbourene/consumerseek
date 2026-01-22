import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { linkEligibleConsumersToInstallation } from '../services/installationConsumers';

interface SaveInstallationModalProps {
  commune: string;
  latitude: number;
  longitude: number;
  onClose: () => void;
  onSaved: () => void;
  marge?: number;
}

export default function SaveInstallationModal({
  commune,
  latitude,
  longitude,
  onClose,
  onSaved,
  marge = 200
}: SaveInstallationModalProps) {
  const [nom, setNom] = useState('');
  const [puissance, setPuissance] = useState('');
  const [injection, setInjection] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!nom.trim()) {
      setError('Le champ Nom/Ref est obligatoire');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: installationData, error: insertError } = await supabase
        .from('installations')
        .insert({
          nom: nom.trim(),
          puissance_kWc: puissance ? parseFloat(puissance) : null,
          injection_MWh: injection ? parseFloat(injection) : null,
          latitude,
          longitude,
          commune
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (installationData) {
        await linkEligibleConsumersToInstallation(
          installationData.id,
          latitude,
          longitude,
          marge
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">Enregistrer l'installation</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Commune
            </label>
            <input
              type="text"
              value={commune}
              disabled
              className="w-full px-4 py-3 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Nom/Ref <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Ex: Installation XYZ"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Puissance (kWc)
            </label>
            <input
              type="number"
              value={puissance}
              onChange={(e) => setPuissance(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Ex: 250"
              step="0.01"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Injection (MWh)
            </label>
            <input
              type="number"
              value={injection}
              onChange={(e) => setInjection(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="Ex: 1500"
              step="0.01"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition font-medium"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition font-medium flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
