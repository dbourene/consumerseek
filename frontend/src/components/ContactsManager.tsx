import React, { useState, useEffect } from 'react';
import { Plus, Mail, Edit2, Trash2, Send, Users } from 'lucide-react';
import { getContacts, createContact, updateContact, deleteContact, createInvitation } from '../services/consumerstat';
import type { Contact } from '../types/consumerstat';
import ContactForm from './ContactForm';
import SendInvitationModal from './SendInvitationModal';

interface ContactsManagerProps {
  onTestUpload?: (token: string) => void;
}

export default function ContactsManager({ onTestUpload }: ContactsManagerProps = {}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [sendInvitationTo, setSendInvitationTo] = useState<Contact | null>(null);

  useEffect(() => {
    loadContacts();
  }, []);

  async function loadContacts() {
    try {
      setLoading(true);
      const data = await getContacts();
      setContacts(data);
    } catch (error) {
      console.error('Error loading contacts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce contact ?')) return;

    try {
      await deleteContact(id);
      setContacts(contacts.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert('Erreur lors de la suppression du contact');
    }
  }

  function handleEdit(contact: Contact) {
    setEditingContact(contact);
    setShowForm(true);
  }

  function handleCloseForm() {
    setShowForm(false);
    setEditingContact(null);
  }

  function handleSaved() {
    loadContacts();
    handleCloseForm();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des contacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with action button */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Gestion des contacts</h3>
            <p className="text-sm text-gray-500 mt-1">
              Créez des contacts et envoyez-leur des invitations pour déposer leurs factures
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Nouveau contact</span>
          </button>
        </div>
      </div>

      {/* Contacts list */}
      <div className="flex-1 overflow-auto p-6">
        {contacts.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">Aucun contact</h4>
            <p className="text-gray-500 mb-6">
              Commencez par créer un contact pour pouvoir envoyer des invitations
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Créer mon premier contact</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contacts.map(contact => (
              <div
                key={contact.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{contact.entreprise}</h4>
                    <p className="text-sm text-gray-500 mt-1">
                      {contact.contact1_prenom} {contact.contact1_nom}
                    </p>
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => handleEdit(contact)}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                      title="Modifier"
                    >
                      <Edit2 className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(contact.id)}
                      className="p-1.5 hover:bg-red-50 rounded transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{contact.contact1_mail1}</span>
                  </div>
                  {contact.contact1_telportable && (
                    <div className="text-gray-600">
                      📱 {contact.contact1_telportable}
                    </div>
                  )}
                  {contact.contact2_nom && (
                    <div className="pt-2 mt-2 border-t border-gray-100">
                      <p className="text-gray-500 text-xs mb-1">Contact 2:</p>
                      <p className="text-gray-700">
                        {contact.contact2_prenom} {contact.contact2_nom}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSendInvitationTo(contact)}
                  className="mt-4 w-full flex items-center justify-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>Envoyer une invitation</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <ContactForm
          contact={editingContact}
          onClose={handleCloseForm}
          onSaved={handleSaved}
        />
      )}

      {sendInvitationTo && (
        <SendInvitationModal
          contact={sendInvitationTo}
          onClose={() => setSendInvitationTo(null)}
          onSent={() => {
            setSendInvitationTo(null);
            loadContacts();
          }}
          onTestLink={onTestUpload}
        />
      )}
    </div>
  );
}
