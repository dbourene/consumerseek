import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, AlertCircle, Building2, User, ShieldOff, ShieldX } from 'lucide-react';
import { getPRMsByContact, createPRM, updatePRM, deletePRM } from '../services/prm';
import { updateContact } from '../services/consumerstat';
import { searchSireneBySiret } from '../services/sireneAPI';
import { revokePRMConsent, revokeAllContactPRMs, getPRMConsentStatus } from '../services/consentRevocation';
import type { PRM } from '../types/prm';
import type { Contact } from '../types/consumerstat';

interface PRMManagerProps {
  contact: Contact;
  onClose: () => void;
  onUpdated: () => void;
}

interface TitulaireInfo {
  type: 'particulier' | 'professionnel';
  formeJuridique?: string;
  siret?: string;
  codeNaf?: string;
  civilite?: string;
  prenom?: string;
  nom?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
}

export default function PRMManager({ contact, onClose, onUpdated }: PRMManagerProps) {
  const [prms, setPrms] = useState<PRM[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPRM, setEditingPRM] = useState<Partial<PRM> | null>(null);
  const [isNewPRM, setIsNewPRM] = useState(false);
  const [titulaireInfo, setTitulaireInfo] = useState<TitulaireInfo>({
    type: 'professionnel',
    siret: contact.siret || '',
    codeNaf: contact.code_naf || '',
    adresse: contact.adresse || '',
    codePostal: contact.code_postal || '',
    ville: contact.ville || '',
  });
  const [validatingSiret, setValidatingSiret] = useState(false);
  const [siretError, setSiretError] = useState<string | null>(null);
  const [hasChangedTitulaire, setHasChangedTitulaire] = useState(false);
  const [revokingPRM, setRevokingPRM] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [consentStatuses, setConsentStatuses] = useState<Record<string, { status: string; revokedAt?: string; reason?: string }>>({});

  useEffect(() => {
    loadPRMs();
  }, [contact.id]);

  async function loadPRMs() {
    try {
      setLoading(true);
      const data = await getPRMsByContact(contact.id);
      setPrms(data);

      const statuses: Record<string, any> = {};
      for (const prm of data) {
        const status = await getPRMConsentStatus(prm.id);
        statuses[prm.id] = status;
      }
      setConsentStatuses(statuses);
    } catch (error) {
      console.error('Error loading PRMs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleValidateSiret(siret: string) {
    if (!siret || siret.length !== 14) {
      setSiretError('Le SIRET doit contenir 14 chiffres');
      return;
    }

    try {
      setValidatingSiret(true);
      setSiretError(null);
      const result = await searchSireneBySiret(siret);

      if (result) {
        setTitulaireInfo(prev => ({
          ...prev,
          siret: siret,
          formeJuridique: result.forme_juridique || '',
          codeNaf: result.code_naf || '',
        }));
        setHasChangedTitulaire(true);
      } else {
        setSiretError('SIRET introuvable dans la base SIRENE');
      }
    } catch (error) {
      console.error('Error validating SIRET:', error);
      setSiretError('Erreur lors de la validation du SIRET');
    } finally {
      setValidatingSiret(false);
    }
  }

  async function handleSavePRM() {
    if (!editingPRM) return;

    try {
      const prmData = {
        ...editingPRM,
        contact_id: contact.id,
        titulaire_type: titulaireInfo.type,
        titulaire_forme_juridique: titulaireInfo.formeJuridique,
        titulaire_siret: titulaireInfo.siret,
        titulaire_code_naf: titulaireInfo.codeNaf,
        titulaire_civilite: titulaireInfo.civilite,
        titulaire_prenom: titulaireInfo.prenom,
        titulaire_nom: titulaireInfo.nom,
        titulaire_adresse: titulaireInfo.adresse,
        titulaire_code_postal: titulaireInfo.codePostal,
        titulaire_ville: titulaireInfo.ville,
        entreprise: contact.entreprise,
      };

      if (isNewPRM) {
        await createPRM(prmData);
      } else if (editingPRM.id) {
        await updatePRM(editingPRM.id, prmData);
      }

      if (hasChangedTitulaire) {
        await updateContact(contact.id, {
          siret: titulaireInfo.siret,
          code_naf: titulaireInfo.codeNaf,
          adresse: titulaireInfo.adresse,
          code_postal: titulaireInfo.codePostal,
          ville: titulaireInfo.ville,
        });
      }

      setEditingPRM(null);
      setIsNewPRM(false);
      setHasChangedTitulaire(false);
      loadPRMs();
      onUpdated();
    } catch (error) {
      console.error('Error saving PRM:', error);
      alert('Erreur lors de la sauvegarde du PRM');
    }
  }

  async function handleDeletePRM(id: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce PRM ?')) return;

    try {
      await deletePRM(id);
      loadPRMs();
    } catch (error) {
      console.error('Error deleting PRM:', error);
      alert('Erreur lors de la suppression du PRM');
    }
  }

  async function handleRevokePRM(prmId: string) {
    const reason = prompt('Raison de la révocation (optionnel) :');
    if (reason === null) return;

    if (!confirm('Êtes-vous sûr de vouloir révoquer le consentement pour ce PRM ? Cette action est irréversible et sera enregistrée dans les logs d\'audit.')) {
      return;
    }

    try {
      setRevokingPRM(prmId);
      const result = await revokePRMConsent(prmId, reason || 'Révocation demandée par le titulaire');

      if (result.success) {
        alert('Consentement révoqué avec succès. Cette action a été enregistrée dans les logs d\'audit.');
        loadPRMs();
        onUpdated();
      } else {
        alert(`Erreur: ${result.error}`);
      }
    } catch (error) {
      console.error('Error revoking PRM consent:', error);
      alert('Erreur lors de la révocation du consentement');
    } finally {
      setRevokingPRM(null);
    }
  }

  async function handleRevokeAllPRMs() {
    const reason = prompt('Raison de la révocation de tous les PRMs (optionnel) :');
    if (reason === null) return;

    if (!confirm(`Êtes-vous sûr de vouloir révoquer le consentement pour TOUS les ${prms.length} PRM(s) de ce contact ? Cette action est irréversible et sera enregistrée dans les logs d'audit.`)) {
      return;
    }

    try {
      setRevokingAll(true);
      const result = await revokeAllContactPRMs(contact.id, reason || 'Révocation globale demandée par le titulaire');

      if (result.success) {
        alert(`Consentement révoqué avec succès pour ${prms.length} PRM(s). Cette action a été enregistrée dans les logs d'audit.`);
        loadPRMs();
        onUpdated();
      } else {
        alert(`Erreur: ${result.error}`);
      }
    } catch (error) {
      console.error('Error revoking all PRMs:', error);
      alert('Erreur lors de la révocation des consentements');
    } finally {
      setRevokingAll(false);
    }
  }

  function handleNewPRM() {
    setEditingPRM({ prm_numero: '' });
    setIsNewPRM(true);
  }

  function handleEditPRM(prm: PRM) {
    setEditingPRM(prm);
    setIsNewPRM(false);

    setTitulaireInfo({
      type: prm.titulaire_type || 'professionnel',
      formeJuridique: prm.titulaire_forme_juridique,
      siret: prm.titulaire_siret,
      codeNaf: prm.titulaire_code_naf,
      civilite: prm.titulaire_civilite,
      prenom: prm.titulaire_prenom,
      nom: prm.titulaire_nom,
      adresse: prm.titulaire_adresse,
      codePostal: prm.titulaire_code_postal,
      ville: prm.titulaire_ville,
    });
  }

  function handleCancelEdit() {
    setEditingPRM(null);
    setIsNewPRM(false);
    setHasChangedTitulaire(false);
    setSiretError(null);

    setTitulaireInfo({
      type: 'professionnel',
      siret: contact.siret || '',
      codeNaf: contact.code_naf || '',
      adresse: contact.adresse || '',
      codePostal: contact.code_postal || '',
      ville: contact.ville || '',
    });
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-4xl w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Gestion des PRM</h3>
              <p className="text-sm text-gray-500 mt-1">{contact.entreprise}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Bloc A: Type de titulaire */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">A</span>
              Type de titulaire
            </h4>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  checked={titulaireInfo.type === 'professionnel'}
                  onChange={() => {
                    setTitulaireInfo({ ...titulaireInfo, type: 'professionnel' });
                    setHasChangedTitulaire(true);
                  }}
                  className="w-4 h-4 text-blue-600"
                />
                <Building2 className="w-5 h-5 text-gray-600" />
                <span className="text-gray-700">Professionnel</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  checked={titulaireInfo.type === 'particulier'}
                  onChange={() => {
                    setTitulaireInfo({ ...titulaireInfo, type: 'particulier' });
                    setHasChangedTitulaire(true);
                  }}
                  className="w-4 h-4 text-blue-600"
                />
                <User className="w-5 h-5 text-gray-600" />
                <span className="text-gray-700">Particulier</span>
              </label>
            </div>
          </div>

          {/* Bloc B: Informations du titulaire */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">B</span>
              Informations du titulaire
            </h4>

            {titulaireInfo.type === 'professionnel' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SIRET *
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={titulaireInfo.siret || ''}
                      onChange={(e) => {
                        setTitulaireInfo({ ...titulaireInfo, siret: e.target.value });
                        setSiretError(null);
                      }}
                      maxLength={14}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="14 chiffres"
                    />
                    <button
                      onClick={() => handleValidateSiret(titulaireInfo.siret || '')}
                      disabled={validatingSiret}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {validatingSiret ? 'Validation...' : 'Valider'}
                    </button>
                  </div>
                  {siretError && (
                    <div className="mt-2 flex items-start space-x-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{siretError}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Forme juridique
                    </label>
                    <input
                      type="text"
                      value={titulaireInfo.formeJuridique || ''}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                      placeholder="Auto-rempli depuis SIRENE"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Code NAF
                    </label>
                    <input
                      type="text"
                      value={titulaireInfo.codeNaf || ''}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                      placeholder="Auto-rempli depuis SIRENE"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse
                  </label>
                  <input
                    type="text"
                    value={titulaireInfo.adresse || ''}
                    onChange={(e) => {
                      setTitulaireInfo({ ...titulaireInfo, adresse: e.target.value });
                      setHasChangedTitulaire(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Code postal
                    </label>
                    <input
                      type="text"
                      value={titulaireInfo.codePostal || ''}
                      onChange={(e) => {
                        setTitulaireInfo({ ...titulaireInfo, codePostal: e.target.value });
                        setHasChangedTitulaire(true);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ville
                    </label>
                    <input
                      type="text"
                      value={titulaireInfo.ville || ''}
                      onChange={(e) => {
                        setTitulaireInfo({ ...titulaireInfo, ville: e.target.value });
                        setHasChangedTitulaire(true);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Civilité
                    </label>
                    <select
                      value={titulaireInfo.civilite || ''}
                      onChange={(e) => {
                        setTitulaireInfo({ ...titulaireInfo, civilite: e.target.value });
                        setHasChangedTitulaire(true);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">-</option>
                      <option value="M.">M.</option>
                      <option value="Mme">Mme</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prénom
                    </label>
                    <input
                      type="text"
                      value={titulaireInfo.prenom || ''}
                      onChange={(e) => {
                        setTitulaireInfo({ ...titulaireInfo, prenom: e.target.value });
                        setHasChangedTitulaire(true);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nom
                    </label>
                    <input
                      type="text"
                      value={titulaireInfo.nom || ''}
                      onChange={(e) => {
                        setTitulaireInfo({ ...titulaireInfo, nom: e.target.value });
                        setHasChangedTitulaire(true);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse
                  </label>
                  <input
                    type="text"
                    value={titulaireInfo.adresse || ''}
                    onChange={(e) => {
                      setTitulaireInfo({ ...titulaireInfo, adresse: e.target.value });
                      setHasChangedTitulaire(true);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Code postal
                    </label>
                    <input
                      type="text"
                      value={titulaireInfo.codePostal || ''}
                      onChange={(e) => {
                        setTitulaireInfo({ ...titulaireInfo, codePostal: e.target.value });
                        setHasChangedTitulaire(true);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ville
                    </label>
                    <input
                      type="text"
                      value={titulaireInfo.ville || ''}
                      onChange={(e) => {
                        setTitulaireInfo({ ...titulaireInfo, ville: e.target.value });
                        setHasChangedTitulaire(true);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {hasChangedTitulaire && (
              <div className="mt-3 flex items-start space-x-2 text-orange-600 text-sm bg-orange-50 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Les modifications du titulaire seront répercutées sur le contact lors de la sauvegarde du PRM.</span>
              </div>
            )}
          </div>

          {/* Bloc C: Liste des PRM */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900 flex items-center">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">C</span>
                Liste des PRM
              </h4>
              {!editingPRM && (
                <div className="flex space-x-2">
                  {prms.length > 0 && (
                    <button
                      onClick={handleRevokeAllPRMs}
                      disabled={revokingAll}
                      className="flex items-center space-x-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                      title="Révoquer le consentement pour tous les PRMs"
                    >
                      <ShieldX className="w-4 h-4" />
                      <span>{revokingAll ? 'Révocation...' : 'Révoquer tous'}</span>
                    </button>
                  )}
                  <button
                    onClick={handleNewPRM}
                    className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Ajouter un PRM</span>
                  </button>
                </div>
              )}
            </div>

            {editingPRM ? (
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Numéro PRM *
                    </label>
                    <input
                      type="text"
                      value={editingPRM.prm_numero || ''}
                      onChange={(e) => setEditingPRM({ ...editingPRM, prm_numero: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ex: 30001234567890"
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={handleCancelEdit}
                      className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      <span>Annuler</span>
                    </button>
                    <button
                      onClick={handleSavePRM}
                      className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      <span>Enregistrer</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : prms.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>Aucun PRM enregistré</p>
                <p className="text-sm mt-1">Cliquez sur "Ajouter un PRM" pour commencer</p>
              </div>
            ) : (
              <div className="space-y-2">
                {prms.map((prm) => {
                  const status = consentStatuses[prm.id];
                  const isRevoked = status?.status === 'REVOKED';

                  return (
                    <div
                      key={prm.id}
                      className={`bg-white rounded-lg p-3 border ${isRevoked ? 'border-red-200 bg-red-50' : 'border-gray-200'} flex items-center justify-between hover:shadow-sm transition-shadow`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <p className="font-medium text-gray-900">{prm.prm_numero}</p>
                          {isRevoked && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                              <ShieldOff className="w-3 h-3 mr-1" />
                              Révoqué
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {prm.titulaire_type === 'particulier'
                            ? `${prm.titulaire_civilite || ''} ${prm.titulaire_prenom || ''} ${prm.titulaire_nom || ''}`.trim()
                            : `${prm.titulaire_forme_juridique || 'Professionnel'} - SIRET: ${prm.titulaire_siret || 'N/A'}`
                          }
                        </p>
                        {isRevoked && status.revokedAt && (
                          <p className="text-xs text-red-600 mt-1">
                            Révoqué le {new Date(status.revokedAt).toLocaleDateString('fr-FR')}
                            {status.reason && ` - ${status.reason}`}
                          </p>
                        )}
                      </div>
                      <div className="flex space-x-1">
                        {!isRevoked && (
                          <button
                            onClick={() => handleRevokePRM(prm.id)}
                            disabled={revokingPRM === prm.id}
                            className="p-1.5 hover:bg-orange-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Révoquer le consentement RGPD"
                          >
                            <ShieldOff className="w-4 h-4 text-orange-600" />
                          </button>
                        )}
                        <button
                          onClick={() => handleEditPRM(prm)}
                          className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleDeletePRM(prm.id)}
                          className="p-1.5 hover:bg-red-50 rounded transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
