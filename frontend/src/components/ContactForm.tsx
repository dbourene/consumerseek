import React, { useState } from 'react';
import { X, User, Building2, Mail, Phone, Briefcase } from 'lucide-react';
import { createContact, updateContact } from '../services/consumerstat';
import type { Contact } from '../types/consumerstat';

interface ContactFormProps {
  contact?: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ContactForm({ contact, onClose, onSaved }: ContactFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    entreprise: contact?.entreprise || '',
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (contact) {
        await updateContact(contact.id, formData);
      } else {
        await createContact(formData);
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
          {/* Entreprise */}
          <div>
            <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <Building2 className="w-4 h-4" />
              <span>Entreprise *</span>
            </label>
            <input
              type="text"
              required
              value={formData.entreprise}
              onChange={(e) => handleChange('entreprise', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nom de l'entreprise"
            />
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
