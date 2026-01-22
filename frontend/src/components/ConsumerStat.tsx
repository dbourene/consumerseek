import React, { useState } from 'react';
import { X, Users, FileText, CheckCircle } from 'lucide-react';
import ContactsManager from './ContactsManager';
import FacturesValidation from './FacturesValidation';

interface ConsumerStatProps {
  onClose: () => void;
  onTestUpload?: (token: string) => void;
}

type ActiveTab = 'contacts' | 'validation';

export default function ConsumerStat({ onClose, onTestUpload }: ConsumerStatProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('contacts');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">ConsumerStat</h2>
              <p className="text-sm text-gray-500">Gestion des factures énergétiques</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Fermer"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          <button
            onClick={() => setActiveTab('contacts')}
            className={`flex items-center space-x-2 px-4 py-3 border-b-2 font-medium transition-colors ${
              activeTab === 'contacts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Contacts & Invitations</span>
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`flex items-center space-x-2 px-4 py-3 border-b-2 font-medium transition-colors ${
              activeTab === 'validation'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <CheckCircle className="w-5 h-5" />
            <span>Validation des factures</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'contacts' && <ContactsManager onTestUpload={onTestUpload} />}
          {activeTab === 'validation' && <FacturesValidation />}
        </div>
      </div>
    </div>
  );
}
