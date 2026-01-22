import { useState } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { AddressValidation } from '../types/consommateur';
import { geocodeAddress } from '../services/geocoding';
import { supabase } from '../supabaseClient';
import AddressAutocomplete from './AddressAutocomplete';
import { ParsedAddress } from '../services/addressAutocomplete';
import { fixEncodingIssues } from '../utils/textEncoding';

interface AddressValidationModalProps {
  invalidAddresses: AddressValidation[];
  onClose: () => void;
  onValidated: () => void;
}

export default function AddressValidationModal({
  invalidAddresses,
  onClose,
  onValidated
}: AddressValidationModalProps) {
  const [addresses, setAddresses] = useState<AddressValidation[]>(invalidAddresses);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCorrection = (id: string, newAddress: string) => {
    setAddresses(prev =>
      prev.map(addr =>
        addr.id === id
          ? { ...addr, adresse_corrigee: newAddress, isValid: false }
          : addr
      )
    );
  };

  const handleAddressSelect = (id: string, parsed: ParsedAddress) => {
    setAddresses(prev =>
      prev.map(addr =>
        addr.id === id
          ? {
              ...addr,
              adresse_corrigee: parsed.adresse,
              code_commune: parsed.code_commune,
              nom_commune: parsed.nom_commune,
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              isValid: true,
              score: 1.0
            }
          : addr
      )
    );
  };

  const handleVerify = async (id: string) => {
    setVerifying(id);
    const address = addresses.find(a => a.id === id);

    if (!address) return;

    const result = await geocodeAddress(
      address.adresse_corrigee,
      address.code_commune
    );

    setAddresses(prev =>
      prev.map(addr =>
        addr.id === id
          ? {
              ...addr,
              latitude: result?.latitude,
              longitude: result?.longitude,
              score: result?.score,
              isValid: !!result
            }
          : addr
      )
    );

    setVerifying(null);
  };

  const handleValidateAll = async () => {
    setSaving(true);

    const validAddresses = addresses.filter(a => a.isValid);

    for (const addr of validAddresses) {
      await supabase
        .from('consommateurs')
        .update({
          adresse: addr.adresse_corrigee,
          code_commune: addr.code_commune,
          nom_commune: addr.nom_commune,
          latitude: addr.latitude,
          longitude: addr.longitude,
          geocode_status: 'success',
          geocode_score: addr.score,
          geocode_source: 'adresse.data.gouv.fr'
        })
        .eq('adresse', addr.adresse)
        .eq('code_commune', addr.code_commune);
    }

    setSaving(false);
    onValidated();
  };

  const validCount = addresses.filter(a => a.isValid).length;
  const totalCount = addresses.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Validation des adresses
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {totalCount} adresse{totalCount > 1 ? 's' : ''} non géocodable
              {totalCount > 1 ? 's' : ''} détectée{totalCount > 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-4">
            {addresses.map(addr => (
              <div
                key={addr.id}
                className="border rounded-lg p-4 bg-gray-50"
              >
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Adresse originale
                    </label>
                    <div className="text-sm text-gray-900 bg-gray-100 p-2 rounded">
                      {fixEncodingIssues(addr.adresse)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {fixEncodingIssues(addr.nom_commune)} ({addr.code_commune})
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Adresse corrigée
                    </label>
                    <AddressAutocomplete
                      value={addr.adresse_corrigee || ''}
                      onChange={(value) => handleCorrection(addr.id, value)}
                      onSelect={(parsed) => handleAddressSelect(addr.id, parsed)}
                      placeholder="Rechercher une adresse..."
                    />
                    {addr.isValid && (
                      <div className="mt-1 text-xs text-gray-600">
                        {fixEncodingIssues(addr.nom_commune)} ({addr.code_commune})
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleVerify(addr.id)}
                    disabled={
                      !addr.adresse_corrigee || verifying === addr.id
                    }
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center gap-2"
                  >
                    {verifying === addr.id ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Vérification...
                      </>
                    ) : (
                      'Vérifier'
                    )}
                  </button>

                  {addr.isValid && (
                    <div className="flex items-center gap-2 text-green-600 text-sm">
                      <Check className="w-4 h-4" />
                      <span>
                        Validé (score: {addr.score?.toFixed(2)})
                      </span>
                    </div>
                  )}

                  {addr.score !== undefined && !addr.isValid && (
                    <div className="flex items-center gap-2 text-orange-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>
                        Score insuffisant ({addr.score?.toFixed(2)})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t p-6 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {validCount} / {totalCount} adresse{totalCount > 1 ? 's' : ''}{' '}
              validée{validCount > 1 ? 's' : ''}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleValidateAll}
                disabled={validCount === 0 || saving}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
              >
                {saving ? 'Enregistrement...' : 'Valider'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
