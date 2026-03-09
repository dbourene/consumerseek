import { useState } from 'react';
import { Check, X, Edit2 } from 'lucide-react';
import { Consommateur } from '../types/consommateur';
import { updateConsommateurAddress } from '../services/geocoding';
import { fixEncodingIssues } from '../utils/textEncoding';
import AddressAutocomplete from './AddressAutocomplete';
import { ParsedAddress as AutocompleteAddress } from '../services/addressAutocomplete';

interface AddressCorrectionTableProps {
  invalidAddresses: Consommateur[];
  onUpdate: () => void;
}

export function AddressCorrectionTable({ invalidAddresses, onUpdate }: AddressCorrectionTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newAddress, setNewAddress] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<AutocompleteAddress | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 TABLEAU DE CORRECTION - Adresses reçues:', invalidAddresses.length);
  console.log('Détails des adresses à corriger:');
  invalidAddresses.forEach((c, index) => {
    console.log(`  ${index + 1}. ID ${c.id} - Adresse: "${c.adresse || '(VIDE)'}" - Commune: ${c.nom_commune}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const handleEdit = (conso: Consommateur) => {
    setEditingId(conso.id || null);
    const addressToEdit = conso.adresse ? fixEncodingIssues(conso.adresse) : fixEncodingIssues(conso.nom_commune);
    setNewAddress(addressToEdit);
    setSelectedAddress(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setNewAddress('');
    setSelectedAddress(null);
  };

  const handleAddressSelect = (address: AutocompleteAddress) => {
    console.log('🎯 ════════════════════════════════════════');
    console.log('🎯 ADRESSE SÉLECTIONNÉE DANS AUTOCOMPLETE');
    console.log('🎯 Street:', address.street);
    console.log('🎯 Objet complet:', JSON.stringify(address, null, 2));
    console.log('🎯 ════════════════════════════════════════');
    setNewAddress(address.street);
    setSelectedAddress(address);
  };

  const handleValidate = async (conso: Consommateur) => {
    console.log('\n🔵 ════════════════════════════════════════════════════');
    console.log('🔵 DÉBUT VALIDATION ADRESSE');
    console.log('🔵 ════════════════════════════════════════════════════');

    if (!conso.id) {
      console.error('❌ Pas d\'ID consommateur');
      return;
    }

    if (!newAddress.trim()) {
      console.error('❌ Adresse vide');
      alert('❌ Veuillez saisir une adresse avant de valider.');
      return;
    }

    console.log('📋 Consommateur ID:', conso.id);
    console.log('📋 Nouvelle adresse:', newAddress.trim());
    console.log('📋 Code commune:', conso.code_commune);
    console.log('📋 Nom commune:', conso.nom_commune);
    console.log('📋 Adresse sélectionnée depuis autocomplete:', selectedAddress ? 'OUI' : 'NON');
    if (selectedAddress) {
      console.log('📋 Détails adresse sélectionnée:', JSON.stringify(selectedAddress, null, 2));
    }

    setUpdating(conso.id);
    try {
      console.log('🔍 Appel à updateConsommateurAddress...');
      const success = await updateConsommateurAddress(
        conso.id,
        newAddress.trim(),
        conso.code_commune,
        conso.nom_commune
      );

      console.log('🔍 Résultat de updateConsommateurAddress:', success);

      if (success) {
        console.log('✅ Géocodage réussi - Mise à jour de l\'interface');
        setEditingId(null);
        setNewAddress('');
        setSelectedAddress(null);
        console.log('🔄 Appel de onUpdate() pour rafraîchir la liste...');
        onUpdate();
        console.log('✅ Validation terminée avec succès');
      } else {
        console.log('❌ Géocodage échoué - updateConsommateurAddress a retourné false');
        alert('❌ Test de géocodage échoué\n\nL\'adresse saisie n\'a pas pu être géocodée par l\'API adresse.data.gouv.fr.\n\nVeuillez vérifier :\n- L\'orthographe de l\'adresse\n- Le numéro de rue\n- Le nom de la rue\n- La présence du nom de commune si nécessaire');
      }
    } catch (error) {
      console.error('❌ ERREUR lors de la validation:', error);
      alert('❌ Erreur technique lors de la mise à jour de l\'adresse.');
    } finally {
      setUpdating(null);
      console.log('🔵 ════════════════════════════════════════════════════');
      console.log('🔵 FIN VALIDATION ADRESSE');
      console.log('🔵 ════════════════════════════════════════════════════\n');
    }
  };

  if (invalidAddresses.length === 0) {
    return null;
  }

  const getStatusBadge = (status: string | null) => {
    if (!status) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Non géocodé
        </span>
      );
    }
    if (status === 'failed') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          Échec
        </span>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">
        Correction des adresses invalides ({invalidAddresses.length})
      </h3>
      <div className="overflow-x-auto">
        <div className="max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Statut
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Commune
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Adresse actuelle
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Adresse corrigée
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Conso (MWh)
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invalidAddresses.map((conso) => (
              <tr key={conso.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">
                  {getStatusBadge(conso.geocode_status)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {fixEncodingIssues(conso.nom_commune)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {conso.adresse ? fixEncodingIssues(conso.adresse) : <span className="italic text-gray-400">(vide)</span>}
                </td>
                <td className="px-4 py-3 relative">
                  <div className="relative" style={{ zIndex: editingId === conso.id ? 100 : 1 }}>
                    {editingId === conso.id ? (
                      <AddressAutocomplete
                        value={newAddress}
                        onChange={setNewAddress}
                        onSelect={handleAddressSelect}
                        placeholder="Saisir l'adresse complète..."
                        className="w-full"
                      />
                    ) : (
                      <span className="text-sm text-gray-400 italic">Non corrigée</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {conso.consommation_annuelle_mwh.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  {editingId === conso.id ? (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleValidate(conso)}
                        disabled={updating === conso.id}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                        title="Valider"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={updating === conso.id}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="Annuler"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEdit(conso)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Modifier"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
