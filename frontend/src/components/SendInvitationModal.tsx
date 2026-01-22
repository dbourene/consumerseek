import React, { useState } from 'react';
import { X, Send, Copy, Check } from 'lucide-react';
import { createInvitation } from '../services/consumerstat';
import type { Contact } from '../types/consumerstat';

interface SendInvitationModalProps {
  contact: Contact;
  onClose: () => void;
  onSent: () => void;
  onTestLink?: (token: string) => void;
}

export default function SendInvitationModal({ contact, onClose, onSent, onTestLink }: SendInvitationModalProps) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [invitationLink, setInvitationLink] = useState('');
  const [invitationToken, setInvitationToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(contact.contact1_mail1);
  const [message, setMessage] = useState('');
  const [expirationDays, setExpirationDays] = useState(30);

  const availableEmails = [
    { label: `${contact.contact1_prenom} ${contact.contact1_nom}`, value: contact.contact1_mail1 },
    contact.contact1_mail2 && { label: `${contact.contact1_prenom} ${contact.contact1_nom} (2)`, value: contact.contact1_mail2 },
    contact.contact2_mail1 && contact.contact2_nom && { label: `${contact.contact2_prenom} ${contact.contact2_nom}`, value: contact.contact2_mail1 },
    contact.contact2_mail2 && contact.contact2_nom && { label: `${contact.contact2_prenom} ${contact.contact2_nom} (2)`, value: contact.contact2_mail2 },
  ].filter(Boolean) as { label: string; value: string }[];

  async function handleSend() {
    setLoading(true);

    try {
      const invitation = await createInvitation(
        contact.id,
        selectedEmail,
        message || undefined,
        expirationDays
      );

      if (invitation) {
        const link = `${window.location.origin}/upload/${invitation.token}`;
        setInvitationLink(link);
        setInvitationToken(invitation.token);
        setSent(true);
      }
    } catch (error) {
      console.error('Error creating invitation:', error);
      alert('Erreur lors de la création de l\'invitation');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(invitationLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  }

  function handleClose() {
    if (sent) {
      onSent();
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">
            Envoyer une invitation
          </h3>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {!sent ? (
            <div className="space-y-4">
              {/* Contact info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-1">{contact.entreprise}</h4>
                <p className="text-sm text-blue-700">
                  {contact.contact1_prenom} {contact.contact1_nom}
                </p>
              </div>

              {/* Email selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Destinataire *
                </label>
                <select
                  value={selectedEmail}
                  onChange={(e) => setSelectedEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  {availableEmails.map((email) => (
                    <option key={email.value} value={email.value}>
                      {email.label} - {email.value}
                    </option>
                  ))}
                </select>
              </div>

              {/* Expiration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Durée de validité
                </label>
                <select
                  value={expirationDays}
                  onChange={(e) => setExpirationDays(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={7}>7 jours</option>
                  <option value={15}>15 jours</option>
                  <option value={30}>30 jours</option>
                  <option value={60}>60 jours</option>
                  <option value={90}>90 jours</option>
                </select>
              </div>

              {/* Custom message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message personnalisé (optionnel)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ajoutez un message personnalisé qui sera inclus dans l'email..."
                />
              </div>

              {/* Info */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  📧 Un email sera envoyé automatiquement avec un lien sécurisé permettant au destinataire de déposer ses factures.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={loading}
                >
                  Annuler
                </button>
                <button
                  onClick={handleSend}
                  disabled={loading}
                  className="flex items-center space-x-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                  <span>{loading ? 'Envoi...' : 'Envoyer l\'invitation'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Success message */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-7 h-7 text-white" />
                </div>
                <h4 className="font-semibold text-green-900 mb-1">Invitation créée !</h4>
                <p className="text-sm text-green-700">
                  Un email a été envoyé à {selectedEmail}
                </p>
              </div>

              {/* Link */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lien d'invitation
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={invitationLink}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    <span>{copied ? 'Copié' : 'Copier'}</span>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Vous pouvez également partager ce lien manuellement avec le destinataire
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4">
                {onTestLink && (
                  <button
                    onClick={() => onTestLink(invitationToken)}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    🧪 Tester le lien
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="ml-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
