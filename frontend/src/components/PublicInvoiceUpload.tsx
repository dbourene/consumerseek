import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';

interface InvitationData {
  id: string;
  contact_id: string;
  date_expiration: string;
  nb_factures_deposees: number;
  contact_name: string;
  contact_email: string;
}

interface PublicInvoiceUploadProps {
  token: string;
}

const anonSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

export default function PublicInvoiceUpload({ token }: PublicInvoiceUploadProps) {
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    validateToken();
  }, [token]);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const validateToken = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await anonSupabase
        .from('invitations_factures')
        .select(`
          id,
          contact_id,
          date_expiration,
          nb_factures_deposees,
          contacts!inner(
            entreprise,
            contact1_nom,
            contact1_prenom,
            contact1_mail1
          )
        `)
        .eq('token', token)
        .in('statut', ['envoyé', 'ouvert'])
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Lien invalide ou expiré');
        return;
      }

      if (new Date(data.date_expiration) < new Date()) {
        setError('Ce lien a expiré');
        return;
      }

      const contact = (data.contacts as any);
      setInvitation({
        id: data.id,
        contact_id: data.contact_id,
        date_expiration: data.date_expiration,
        nb_factures_deposees: data.nb_factures_deposees,
        contact_name: `${contact.contact1_prenom} ${contact.contact1_nom}`,
        contact_email: contact.contact1_mail1,
      });
    } catch (err) {
      console.error('Error validating token:', err);
      setError('Erreur lors de la validation du lien');
    } finally {
      setLoading(false);
    }
  };

  const validateFiles = (fileList: FileList | File[]) => {
    const selectedFiles = Array.from(fileList);
    const validFiles = selectedFiles.filter(file => {
      const isValidType = file.type === 'application/pdf' || file.type.startsWith('image/');
      const isValidSize = file.size <= 10 * 1024 * 1024;
      return isValidType && isValidSize;
    });

    if (validFiles.length !== selectedFiles.length) {
      alert('Certains fichiers ont été ignorés (format invalide ou taille > 10 MB)');
    }

    return validFiles;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const validFiles = validateFiles(e.target.files);
      setFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles = validateFiles(e.dataTransfer.files);
      setFiles(prev => [...prev, ...validFiles]);
    }
  };

  const uploadFiles = async () => {
    if (!invitation || files.length === 0) return;

    try {
      setUploading(true);
      setError(null);
      const uploadedFiles = [];

      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${invitation.contact_id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

        const { data: uploadData, error: uploadError } = await anonSupabase.storage
          .from('factures-temporaires')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        setUploadProgress(prev => ({ ...prev, [file.name]: 50 }));

        const { error: insertError } = await anonSupabase
          .from('factures')
          .insert({
            contact_id: invitation.contact_id,
            invitation_id: invitation.id,
            fichier_path: uploadData.path,
            fichier_nom: file.name,
            fichier_taille: file.size,
            bucket_id: 'factures-temporaires',
            statut_extraction: 'en_attente',
            necessite_validation: true,
          });

        if (insertError) throw insertError;

        uploadedFiles.push({ fichier_nom: file.name });
        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      }

      await anonSupabase
        .from('invitations_factures')
        .update({
          nb_factures_deposees: invitation.nb_factures_deposees + files.length,
          statut: 'complété',
        })
        .eq('id', invitation.id);

      setUploadSuccess(true);
      setFiles([]);
      setUploadProgress({});
    } catch (err) {
      console.error('Error uploading files:', err);
      setError('Erreur lors de l\'upload des fichiers');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Vérification du lien...</p>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Lien invalide</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (uploadSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Factures envoyées !</h2>
          <p className="text-gray-600 mb-6">
            Vos factures ont été envoyées avec succès. Nous les analyserons et vous contacterons prochainement.
          </p>
          <p className="text-sm text-gray-500">Vous pouvez fermer cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full">
        <div className="text-center mb-8">
          <FileText className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Envoi de factures d'énergie
          </h1>
          <p className="text-gray-600">
            Bonjour {invitation?.contact_name}, merci de nous envoyer vos factures d'électricité
          </p>
        </div>

        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            <strong>Informations :</strong>
          </p>
          <ul className="text-sm text-blue-700 mt-2 space-y-1">
            <li>• Formats acceptés : PDF, Images (JPG, PNG)</li>
            <li>• Taille maximale par fichier : 10 MB</li>
            <li>• Vous pouvez envoyer plusieurs factures</li>
            <li>• Déjà envoyé : {invitation?.nb_factures_deposees} fichier(s)</li>
          </ul>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sélectionner vos factures
          </label>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400'
            }`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              accept=".pdf,image/*"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
              disabled={uploading}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center"
            >
              <Upload className={`w-12 h-12 mb-2 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
              <span className={`text-sm ${isDragging ? 'text-blue-700 font-semibold' : 'text-gray-600'}`}>
                {isDragging ? 'Déposez vos fichiers ici' : 'Cliquez pour sélectionner des fichiers'}
              </span>
              {!isDragging && (
                <span className="text-xs text-gray-500 mt-1">
                  ou glissez-déposez vos fichiers ici
                </span>
              )}
            </label>
          </div>
        </div>

        {files.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Fichiers sélectionnés ({files.length})
            </h3>
            <div className="space-y-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {uploadProgress[file.name] !== undefined ? (
                      <div className="w-24">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 transition-all duration-300"
                            style={{ width: `${uploadProgress[file.name]}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => removeFile(index)}
                        disabled={uploading}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Retirer ce fichier"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={uploadFiles}
          disabled={files.length === 0 || uploading}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Envoi en cours...
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              Envoyer les factures
            </>
          )}
        </button>
      </div>
    </div>
  );
}
