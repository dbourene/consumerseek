import { useState, useEffect } from 'react';
import { X, MapPin, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Installation } from '../types/installation';
import { fixEncodingIssues } from '../utils/textEncoding';

interface SelectInstallationsForGeocodingModalProps {
  onClose: () => void;
  onSelect: (installations: Installation[]) => void;
}

export default function SelectInstallationsForGeocodingModal({
  onClose,
  onSelect
}: SelectInstallationsForGeocodingModalProps) {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadInstallations();
  }, []);

  const loadInstallations = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('installations')
        .select('*')
        .order('nom', { ascending: true });

      if (fetchError) throw fetchError;

      setInstallations(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleValidate = () => {
    const selected = installations.filter(i => selectedIds.has(i.id));
    onSelect(selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <MapPin className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900">Sélectionner les installations à géocoder</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : installations.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600">Aucune installation enregistrée</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-4">
                Sélectionnez une ou plusieurs installations pour géocoder les consommateurs dans leur périmètre.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === installations.length && installations.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(new Set(installations.map(i => i.id)));
                            } else {
                              setSelectedIds(new Set());
                            }
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Nom/Ref</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Puissance</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-700">Commune</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installations.map(installation => (
                      <tr
                        key={installation.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer"
                        onClick={() => handleToggle(installation.id)}
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(installation.id)}
                            onChange={() => handleToggle(installation.id)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {fixEncodingIssues(installation.nom)}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {installation.puissance_kWc
                            ? `${installation.puissance_kWc.toLocaleString('fr-FR')} kWc`
                            : '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {fixEncodingIssues(installation.commune)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
            onClick={handleValidate}
            disabled={selectedIds.size === 0}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition font-medium"
          >
            Géocoder {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
