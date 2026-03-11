import React, { useState, useEffect } from 'react';
import { X, User, Building2, Mail, Phone, Briefcase, MapPin, FileText, CheckCircle2, Search } from 'lucide-react';
import { createContact, updateContact } from '../services/consumerstat';
import type { Contact } from '../types/consumerstat';
import { supabase } from '../supabaseClient';
import AddressAutocomplete from './AddressAutocomplete';
import type { ParsedAddress } from '../services/addressAutocomplete';

interface ContactFormProps {
  contact?: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}

type ContactType = 'professionnel' | 'particulier';

export default function ContactForm({ contact, onClose, onSaved }: ContactFormProps) {
  const [loading, setLoading] = useState(false);
  const [siretLoading, setSiretLoading] = useState(false);
  const [contactType, setContactType] = useState<ContactType>('professionnel');
  const [siretData, setSiretData] = useState<{
    denomination?: string;
    adresse?: string;
    code_postal?: string;
    ville?: string;
    code_naf?: string;
    libelle_naf?: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    raison_sociale: contact?.raison_sociale || '',
    adresse: contact?.adresse || '',
    code_postal: contact?.code_postal || '',
    ville: contact?.ville || '',
    siret: contact?.siret || '',
    code_naf: contact?.code_naf || '',
    libelle_naf: contact?.libelle_naf || '',
    statut_commande: contact?.statut_commande || 'Non contacté',
    commentaires: contact?.commentaires || '',
    contact1_civilite: contact?.contact1_civilite || 'M.',
    contact1_nom: contact?.contact1_nom || '',
    contact1_prenom: contact?.contact1_prenom || '',
    contact1_mail1: contact?.contact1_mail1 || '',
    contact1_mail2: contact?.contact1_mail2 || '',
    contact1_telfix: contact?.contact1_telfix || '',
    contact1_telportable: contact?.contact1_telportable || '',
    contact1_fonction: contact?.contact1_fonction || '',
    contact2_civilite: contact?.contact2_civilite || 'M.',
    contact2_nom: contact?.contact2_nom || '',
    contact2_prenom: contact?.contact2_prenom || '',
    contact2_mail1: contact?.contact2_mail1 || '',
    contact2_mail2: contact?.contact2_mail2 || '',
    contact2_telfix: contact?.contact2_telfix || '',
    contact2_telportable: contact?.contact2_telportable || '',
    contact2_fonction: contact?.contact2_fonction || '',
  });

  useEffect(() => {
    if (contact?.siret && contact.siret.length === 14) {
      setContactType('professionnel');
    } else if (contact && !contact.siret) {
      setContactType('particulier');
    }
  }, [contact]);

  async function searchSiret() {
    const cleanSiret = formData.siret.replace(/\s/g, '');
    console.log('🔍 [ContactForm] Starting SIRET search');
    console.log('   Raw SIRET input:', formData.siret);
    console.log('   Clean SIRET:', cleanSiret);
    console.log('   SIRET length:', cleanSiret.length);

    if (cleanSiret.length !== 14) {
      console.error('❌ [ContactForm] Invalid SIRET length:', cleanSiret.length);
      alert('Le SIRET doit contenir 14 chiffres');
      return;
    }

    setSiretLoading(true);

    try {
      console.log('📡 [ContactForm] Step 1: Querying local Supabase table "societes"...');

      const { data: localData, error: localError } = await supabase
        .from('societes')
        .select('denomination, adresse_complete, code_postal, libelle_commune, activite_principale_unite_legale')
        .eq('siret', cleanSiret)
        .eq('etat_administratif_unite_legale', 'A')
        .maybeSingle();

      console.log('📥 [ContactForm] Supabase response received');
      console.log('   Error:', localError);
      console.log('   Data:', localData);

      if (localError) {
        console.error('❌ [ContactForm] Supabase error:', localError);
        throw localError;
      }

      if (localData) {
        console.log('✅ [ContactForm] SIRET found in local database');
        console.log('   Denomination:', localData.denomination);
        console.log('   Adresse:', localData.adresse_complete);
        console.log('   Code postal:', localData.code_postal);
        console.log('   Ville:', localData.libelle_commune);
        console.log('   Code NAF:', localData.activite_principale_unite_legale);

        const newData = {
          denomination: localData.denomination,
          adresse: localData.adresse_complete,
          code_postal: localData.code_postal,
          ville: localData.libelle_commune,
          code_naf: localData.activite_principale_unite_legale,
        };
        setSiretData(newData);
        setFormData(prev => ({
          ...prev,
          raison_sociale: localData.denomination || prev.raison_sociale,
          adresse: localData.adresse_complete || prev.adresse,
          code_postal: localData.code_postal || prev.code_postal,
          ville: localData.libelle_commune || prev.ville,
          code_naf: localData.activite_principale_unite_legale || prev.code_naf,
        }));
        return;
      }

      console.warn('⚠️ [ContactForm] SIRET not found in local database');
      console.log('📡 [ContactForm] Step 2: Querying INSEE API directly...');

      const inseeApiKey = import.meta.env.VITE_SIRENE_API_KEY;
      if (!inseeApiKey) {
        throw new Error('VITE_SIRENE_API_KEY not configured');
      }

      console.log('   API Key configured:', inseeApiKey ? 'Yes' : 'No');
      console.log('   API URL:', `https://api.insee.fr/api-sirene/3.11/siret/${cleanSiret}`);

      const inseeResponse = await fetch(
        `https://api.insee.fr/api-sirene/3.11/siret/${cleanSiret}`,
        {
          method: 'GET',
          headers: {
            'X-INSEE-Api-Key-Integration': inseeApiKey,
            'Accept': 'application/json',
          },
        }
      );

      console.log('📥 [ContactForm] INSEE API response received');
      console.log('   Status:', inseeResponse.status);
      console.log('   Status Text:', inseeResponse.statusText);

      if (!inseeResponse.ok) {
        const errorText = await inseeResponse.text();
        console.error('❌ [ContactForm] INSEE API error:');
        console.error('   Status:', inseeResponse.status);
        console.error('   Body:', errorText);

        if (inseeResponse.status === 401) {
          throw new Error('Erreur d\'authentification: Clé API INSEE invalide');
        } else if (inseeResponse.status === 404) {
          throw new Error('SIRET non trouvé dans la base SIRENE nationale');
        } else if (inseeResponse.status === 429) {
          throw new Error('Trop de requêtes à l\'API INSEE. Veuillez réessayer plus tard.');
        } else {
          throw new Error(`Erreur API INSEE (${inseeResponse.status}): ${inseeResponse.statusText}`);
        }
      }

      const inseeData = await inseeResponse.json();
      console.log('✅ [ContactForm] INSEE API data received');
      console.log('   Full response:', inseeData);

      const etablissement = inseeData.etablissement;
      if (!etablissement) {
        throw new Error('Format de réponse INSEE inattendu');
      }

      const etatAdminEtab = etablissement.periodesEtablissement?.[0]?.etatAdministratifEtablissement;
      const etatAdminUL = etablissement.uniteLegale?.etatAdministratifUniteLegale;

      console.log('   État administratif établissement:', etatAdminEtab);
      console.log('   État administratif unité légale:', etatAdminUL);

      if (etatAdminEtab !== 'A' || etatAdminUL !== 'A') {
        throw new Error('Cet établissement n\'est plus actif');
      }

      const denomination = etablissement.uniteLegale?.denominationUniteLegale ||
        `${etablissement.uniteLegale?.nomUniteLegale || ''} ${etablissement.uniteLegale?.prenomUniteLegale || ''}`.trim();

      const numeroVoie = etablissement.adresseEtablissement?.numeroVoieEtablissement || '';
      const typeVoie = etablissement.adresseEtablissement?.typeVoieEtablissement || '';
      const libelleVoie = etablissement.adresseEtablissement?.libelleVoieEtablissement || '';
      const adresseComplete = `${numeroVoie} ${typeVoie} ${libelleVoie}`.trim();

      const codePostal = etablissement.adresseEtablissement?.codePostalEtablissement || '';
      const commune = etablissement.adresseEtablissement?.libelleCommuneEtablissement || '';

      const codeNaf = etablissement.uniteLegale?.activitePrincipaleUniteLegale || '';
      const libelleNaf = etablissement.uniteLegale?.nomenclatureActivitePrincipaleUniteLegale || '';

      console.log('✅ [ContactForm] Data extracted from INSEE API:');
      console.log('   Denomination:', denomination);
      console.log('   Adresse:', adresseComplete);
      console.log('   Code postal:', codePostal);
      console.log('   Commune:', commune);
      console.log('   Code NAF:', codeNaf);
      console.log('   Libellé NAF:', libelleNaf);

      const newData = {
        denomination,
        adresse: adresseComplete,
        code_postal: codePostal,
        ville: commune,
        code_naf: codeNaf,
        libelle_naf: libelleNaf,
      };

      setSiretData(newData);
      setFormData(prev => ({
        ...prev,
        raison_sociale: denomination || prev.raison_sociale,
        adresse: adresseComplete || prev.adresse,
        code_postal: codePostal || prev.code_postal,
        ville: commune || prev.ville,
        code_naf: codeNaf || prev.code_naf,
        libelle_naf: libelleNaf || prev.libelle_naf,
      }));

    } catch (error) {
      console.error('❌ [ContactForm] Exception during SIRET search:', error);
      console.error('   Error type:', typeof error);
      console.error('   Error message:', error instanceof Error ? error.message : 'Unknown error');
      setSiretData(null);
      alert(error instanceof Error ? error.message : 'Erreur lors de la recherche SIRET');
    } finally {
      setSiretLoading(false);
      console.log('🏁 [ContactForm] SIRET search completed');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const dataToSave = contactType === 'particulier'
        ? { ...formData, raison_sociale: '', siret: '' }
        : formData;

      if (contact) {
        await updateContact(contact.id, dataToSave);
      } else {
        await createContact(dataToSave);
      }
      onSaved();
    } catch (error) {
      console.error('Error saving contact:', error);
      alert('Erreur lors de l\'enregistrement du contact');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(field: string, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }));

    if (field === 'siret' && siretData) {
      setSiretData(null);
    }
  }

  function handleAddressSelect(address: ParsedAddress) {
    setFormData(prev => ({
      ...prev,
      adresse: address.street,
      code_postal: address.postalCode,
      ville: address.city,
    }));
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">
            {contact ? 'Modifier le contact' : 'Nouveau contact'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Sélection du type de contact */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h4 className="font-semibold text-gray-900 mb-3">Type de contact</h4>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setContactType('professionnel')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                  contactType === 'professionnel'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Building2 className="w-5 h-5 inline-block mr-2" />
                Professionnel
              </button>
              <button
                type="button"
                onClick={() => setContactType('particulier')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                  contactType === 'particulier'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <User className="w-5 h-5 inline-block mr-2" />
                Particulier
              </button>
            </div>
          </div>

          {/* Informations Entreprise */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span>{contactType === 'professionnel' ? 'Informations Entreprise' : 'Informations Contact'}</span>
            </h4>

            <div className="space-y-4">
              {contactType === 'professionnel' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      SIRET *
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          required
                          value={formData.siret}
                          onChange={(e) => handleChange('siret', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="123 456 789 00010"
                          maxLength={14}
                          disabled={!!siretData}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={searchSiret}
                        disabled={siretLoading || !!siretData || formData.siret.replace(/\s/g, '').length !== 14}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {siretLoading ? (
                          <>
                            <Search className="w-4 h-4 animate-spin" />
                            Recherche...
                          </>
                        ) : siretData ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Validé
                          </>
                        ) : (
                          <>
                            <Search className="w-4 h-4" />
                            Valider
                          </>
                        )}
                      </button>
                    </div>
                    {siretData && (
                      <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-green-800">Entreprise trouvée</p>
                            <p className="text-sm text-green-700">{siretData.denomination}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSiretData(null);
                              setFormData(prev => ({ ...prev, raison_sociale: '', adresse: '', code_postal: '', ville: '', code_naf: '', libelle_naf: '' }));
                            }}
                            className="text-sm text-green-700 hover:text-green-900 underline"
                          >
                            Modifier
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {siretData && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Entreprise
                        </label>
                        <input
                          type="text"
                          value={formData.raison_sociale}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                          readOnly
                          disabled
                        />
                      </div>
                      {formData.code_naf && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Code NAF / APE
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={formData.code_naf}
                              className="w-32 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono"
                              readOnly
                              disabled
                            />
                            {formData.libelle_naf && (
                              <input
                                type="text"
                                value={formData.libelle_naf}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                                readOnly
                                disabled
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {(contactType === 'particulier' || (contactType === 'professionnel' && siretData)) && (
                <>
                  <div>
                    <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                      <MapPin className="w-4 h-4" />
                      <span>Adresse *</span>
                    </label>
                    {contactType === 'particulier' ? (
                      <AddressAutocomplete
                        value={formData.adresse}
                        onChange={(value) => handleChange('adresse', value)}
                        onSelect={handleAddressSelect}
                        placeholder="Commencez à saisir une adresse..."
                        required={true}
                      />
                    ) : (
                      <input
                        type="text"
                        required
                        value={formData.adresse}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        readOnly
                        disabled
                      />
                    )}
                  </div>

                  {contactType === 'professionnel' && siretData && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Code postal
                        </label>
                        <input
                          type="text"
                          value={formData.code_postal}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                          placeholder="75001"
                          readOnly
                          disabled
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Ville
                        </label>
                        <input
                          type="text"
                          value={formData.ville}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                          placeholder="Paris"
                          readOnly
                          disabled
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Statut de la commande</span>
                </label>
                <select
                  value={formData.statut_commande}
                  onChange={(e) => handleChange('statut_commande', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="Non contacté">Non contacté</option>
                  <option value="En cours">En cours</option>
                  <option value="Devis envoyé">Devis envoyé</option>
                  <option value="Commande confirmée">Commande confirmée</option>
                  <option value="Annulé">Annulé</option>
                  <option value="Terminé">Terminé</option>
                </select>
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4" />
                  <span>Commentaires</span>
                </label>
                <textarea
                  value={formData.commentaires}
                  onChange={(e) => handleChange('commentaires', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Notes et commentaires sur ce contact..."
                  rows={4}
                />
              </div>
            </div>
          </div>

          {/* Contact 1 */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <User className="w-5 h-5 text-blue-600" />
              <span>Contact Principal</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Civilité *
                </label>
                <select
                  required
                  value={formData.contact1_civilite}
                  onChange={(e) => handleChange('contact1_civilite', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="M.">M.</option>
                  <option value="Mme">Mme</option>
                  <option value="Mlle">Mlle</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom *
                </label>
                <input
                  type="text"
                  required
                  value={formData.contact1_nom}
                  onChange={(e) => handleChange('contact1_nom', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prénom *
                </label>
                <input
                  type="text"
                  required
                  value={formData.contact1_prenom}
                  onChange={(e) => handleChange('contact1_prenom', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Briefcase className="w-4 h-4" />
                  <span>Fonction</span>
                </label>
                <input
                  type="text"
                  value={formData.contact1_fonction}
                  onChange={(e) => handleChange('contact1_fonction', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ex: Directeur, Comptable..."
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4" />
                  <span>Email principal *</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.contact1_mail1}
                  onChange={(e) => handleChange('contact1_mail1', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4" />
                  <span>Email secondaire</span>
                </label>
                <input
                  type="email"
                  value={formData.contact1_mail2}
                  onChange={(e) => handleChange('contact1_mail2', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4" />
                  <span>Téléphone fixe</span>
                </label>
                <input
                  type="tel"
                  value={formData.contact1_telfix}
                  onChange={(e) => handleChange('contact1_telfix', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="01 23 45 67 89"
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4" />
                  <span>Téléphone portable</span>
                </label>
                <input
                  type="tel"
                  value={formData.contact1_telportable}
                  onChange={(e) => handleChange('contact1_telportable', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="06 12 34 56 78"
                />
              </div>
            </div>
          </div>

          {/* Contact 2 */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <User className="w-5 h-5 text-gray-600" />
              <span>Contact Secondaire (optionnel)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Civilité
                </label>
                <select
                  value={formData.contact2_civilite}
                  onChange={(e) => handleChange('contact2_civilite', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="M.">M.</option>
                  <option value="Mme">Mme</option>
                  <option value="Mlle">Mlle</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom
                </label>
                <input
                  type="text"
                  value={formData.contact2_nom}
                  onChange={(e) => handleChange('contact2_nom', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prénom
                </label>
                <input
                  type="text"
                  value={formData.contact2_prenom}
                  onChange={(e) => handleChange('contact2_prenom', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Briefcase className="w-4 h-4" />
                  <span>Fonction</span>
                </label>
                <input
                  type="text"
                  value={formData.contact2_fonction}
                  onChange={(e) => handleChange('contact2_fonction', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4" />
                  <span>Email principal</span>
                </label>
                <input
                  type="email"
                  value={formData.contact2_mail1}
                  onChange={(e) => handleChange('contact2_mail1', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4" />
                  <span>Email secondaire</span>
                </label>
                <input
                  type="email"
                  value={formData.contact2_mail2}
                  onChange={(e) => handleChange('contact2_mail2', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4" />
                  <span>Téléphone fixe</span>
                </label>
                <input
                  type="tel"
                  value={formData.contact2_telfix}
                  onChange={(e) => handleChange('contact2_telfix', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4" />
                  <span>Téléphone portable</span>
                </label>
                <input
                  type="tel"
                  value={formData.contact2_telportable}
                  onChange={(e) => handleChange('contact2_telportable', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Enregistrement...' : contact ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
