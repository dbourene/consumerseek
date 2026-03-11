import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X, Plus, Trash2, Info } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';

interface ContactData {
  raison_sociale: string | null;
  siret: string | null;
  forme_juridique: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  contact1_civilite: string;
  contact1_nom: string;
  contact1_prenom: string;
  contact1_mail1: string;
  contact1_telportable: string;
  contact1_telfix: string;
}

interface InvitationData {
  id: string;
  contact_id: string;
  date_expiration: string;
  nb_factures_deposees: number;
  contact_name: string;
  contact_email: string;
  contact?: ContactData;
  type_invitation?: 'factures' | 'autorisation';
}

interface PRMRow {
  id: string;
  titulaire_type: 'particulier' | 'professionnel' | '';
  titulaire_civilite: string;
  titulaire_prenom: string;
  titulaire_nom: string;
  titulaire_raison_sociale: string;
  titulaire_forme_juridique: string;
  titulaire_siret: string;
  titulaire_adresse: string;
  titulaire_code_postal: string;
  titulaire_ville: string;
  prm_numero: string;
  declarant_role: string;
  isEditing: boolean;
  isExisting?: boolean;
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
  const [countdown, setCountdown] = useState(5);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authFormData, setAuthFormData] = useState({
    type: '',
    civilite: '',
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    adresse: '',
    codePostal: '',
    ville: '',
    raisonSociale: '',
    formeJuridique: '',
    siret: '',
    consentRgpd: false,
    revocation_token: '',
  });
  const [authFormSubmitting, setAuthFormSubmitting] = useState(false);
  const [authFormSuccess, setAuthFormSuccess] = useState(false);
  const [authFormError, setAuthFormError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showCloseInstructions, setShowCloseInstructions] = useState(false);
  const [prmRows, setPrmRows] = useState<PRMRow[]>([]);

  useEffect(() => {
    validateToken();
  }, [token]);

  useEffect(() => {
    if (invitation?.contact) {
      loadExistingPRMs();
    }
  }, [invitation]);

  const loadExistingPRMs = async () => {
    if (!invitation?.contact_id) return;

    try {
      console.log('Loading existing PRMs for contact:', invitation.contact_id);

      const { data: existingPRMs, error: prmError } = await anonSupabase
        .from('prm')
        .select('*')
        .eq('contact_id', invitation.contact_id);

      console.log('Existing PRMs loaded:', existingPRMs);

      if (prmError) {
        console.error('Error loading existing PRMs:', prmError);
      }

      const contact = invitation.contact;
      const isProfessional = !!(contact.siret && contact.siret.trim());

      setAuthFormData(prev => ({
        ...prev,
        type: isProfessional ? 'professionnel' : 'particulier',
        civilite: contact.contact1_civilite || '',
        prenom: contact.contact1_prenom || '',
        nom: contact.contact1_nom || '',
        email: contact.contact1_mail1 || '',
        telephone: contact.contact1_telportable || contact.contact1_telfix || '',
        adresse: contact.adresse || '',
        codePostal: contact.code_postal || '',
        ville: contact.ville || '',
        raisonSociale: contact.raison_sociale || '',
        formeJuridique: contact.forme_juridique || '',
        siret: contact.siret || '',
      }));

      if (existingPRMs && existingPRMs.length > 0) {
        console.log('Converting existing PRMs to rows:', existingPRMs);
        const existingRows: PRMRow[] = existingPRMs.map(prm => ({
          id: prm.id,
          titulaire_type: prm.titulaire_type || '',
          titulaire_civilite: prm.titulaire_civilite || '',
          titulaire_prenom: prm.titulaire_prenom || '',
          titulaire_nom: prm.titulaire_nom || '',
          titulaire_raison_sociale: prm.titulaire_raison_sociale || '',
          titulaire_forme_juridique: prm.titulaire_forme_juridique || '',
          titulaire_siret: prm.titulaire_siret || '',
          titulaire_adresse: prm.titulaire_adresse || '',
          titulaire_code_postal: prm.titulaire_code_postal || '',
          titulaire_ville: prm.titulaire_ville || '',
          prm_numero: prm.prm_numero || '',
          declarant_role: prm.declarant_role || '',
          isEditing: false,
          isExisting: true,
        }));

        const newRow: PRMRow = {
          id: crypto.randomUUID(),
          titulaire_type: isProfessional ? 'professionnel' : 'particulier',
          titulaire_civilite: contact.contact1_civilite || '',
          titulaire_prenom: contact.contact1_prenom || '',
          titulaire_nom: contact.contact1_nom || '',
          titulaire_raison_sociale: contact.raison_sociale || '',
          titulaire_forme_juridique: contact.forme_juridique || '',
          titulaire_siret: contact.siret || '',
          titulaire_adresse: contact.adresse || '',
          titulaire_code_postal: contact.code_postal || '',
          titulaire_ville: contact.ville || '',
          prm_numero: '',
          declarant_role: '',
          isEditing: false,
          isExisting: false,
        };

        setPrmRows([...existingRows, newRow]);
        console.log('PRM rows set with existing PRMs + new row:', [...existingRows, newRow]);
      } else {
        console.log('No existing PRMs found, creating new row');
        setPrmRows([{
          id: crypto.randomUUID(),
          titulaire_type: isProfessional ? 'professionnel' : 'particulier',
          titulaire_civilite: contact.contact1_civilite || '',
          titulaire_prenom: contact.contact1_prenom || '',
          titulaire_nom: contact.contact1_nom || '',
          titulaire_raison_sociale: contact.raison_sociale || '',
          titulaire_forme_juridique: contact.forme_juridique || '',
          titulaire_siret: contact.siret || '',
          titulaire_adresse: contact.adresse || '',
          titulaire_code_postal: contact.code_postal || '',
          titulaire_ville: contact.ville || '',
          prm_numero: '',
          declarant_role: '',
          isEditing: false,
          isExisting: false,
        }]);
      }
    } catch (error) {
      console.error('Error in loadExistingPRMs:', error);
      const contact = invitation.contact;
      const isProfessional = !!(contact.siret && contact.siret.trim());
      setPrmRows([{
        id: crypto.randomUUID(),
        titulaire_type: isProfessional ? 'professionnel' : 'particulier',
        titulaire_civilite: contact.contact1_civilite || '',
        titulaire_prenom: contact.contact1_prenom || '',
        titulaire_nom: contact.contact1_nom || '',
        titulaire_raison_sociale: contact.raison_sociale || '',
        titulaire_forme_juridique: contact.forme_juridique || '',
        titulaire_siret: contact.siret || '',
        titulaire_adresse: contact.adresse || '',
        titulaire_code_postal: contact.code_postal || '',
        titulaire_ville: contact.ville || '',
        prm_numero: '',
        declarant_role: '',
        isEditing: false,
        isExisting: false,
      }]);
    }
  };

  useEffect(() => {
    if (uploadSuccess && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (uploadSuccess && countdown === 0) {
      setShowAuthForm(true);
    }
  }, [uploadSuccess, countdown]);

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
          type_invitation,
          contacts!inner(
            raison_sociale,
            siret,
            forme_juridique,
            adresse,
            code_postal,
            ville,
            contact1_civilite,
            contact1_nom,
            contact1_prenom,
            contact1_mail1,
            contact1_telportable,
            contact1_telfix
          )
        `)
        .eq('token', token)
        .in('statut', ['envoyé', 'ouvert'])
        .maybeSingle();

      console.log('Token validation result:', { data, error: fetchError });

      if (fetchError) throw fetchError;

      if (!data) {
        setError('Lien invalide ou expiré');
        return;
      }

      if (new Date(data.date_expiration) < new Date()) {
        setError('Ce lien a expiré');
        return;
      }

      const contact = (data.contacts as any) as ContactData;
      console.log('Contact data retrieved:', contact);
      const invitationData = {
        id: data.id,
        contact_id: data.contact_id,
        date_expiration: data.date_expiration,
        nb_factures_deposees: data.nb_factures_deposees,
        contact_name: `${contact.contact1_prenom} ${contact.contact1_nom}`,
        contact_email: contact.contact1_mail1,
        contact: contact,
        type_invitation: data.type_invitation || 'factures',
      };
      setInvitation(invitationData);

      if (invitationData.type_invitation === 'autorisation') {
        setShowAuthForm(true);
      }
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

        console.log('Inserting facture with contact_id:', invitation.contact_id);

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

  const handleAuthFormChange = (field: string, value: string | boolean) => {
    setAuthFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const addPRMRow = () => {
    setPrmRows(prev => [...prev, {
      id: crypto.randomUUID(),
      titulaire_type: '',
      titulaire_civilite: '',
      titulaire_prenom: '',
      titulaire_nom: '',
      titulaire_raison_sociale: '',
      titulaire_forme_juridique: '',
      titulaire_siret: '',
      titulaire_adresse: '',
      titulaire_code_postal: '',
      titulaire_ville: '',
      prm_numero: '',
      declarant_role: '',
      isEditing: false,
      isExisting: false,
    }]);
  };

  const removePRMRow = (id: string) => {
    setPrmRows(prev => prev.filter(row => row.id !== id));
  };

  const updatePRMRow = (id: string, field: keyof PRMRow, value: string | boolean) => {
    setPrmRows(prev => prev.map(row =>
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const togglePRMEdit = (id: string) => {
    setPrmRows(prev => prev.map(row =>
      row.id === id ? { ...row, isEditing: !row.isEditing } : row
    ));
  };

  const validateAuthForm = () => {
    const errors: string[] = [];

    if (!authFormData.type) errors.push('Veuillez sélectionner le type de titulaire');
    if (!authFormData.civilite) errors.push('Veuillez sélectionner une civilité');
    if (!authFormData.prenom.trim()) errors.push('Veuillez saisir votre prénom');
    if (!authFormData.nom.trim()) errors.push('Veuillez saisir votre nom');
    if (!authFormData.email.trim() || !authFormData.email.includes('@')) errors.push('Veuillez saisir un email valide');
    if (!authFormData.telephone.trim()) errors.push('Veuillez saisir votre téléphone');
    if (!authFormData.adresse.trim()) errors.push('Veuillez saisir l\'adresse complète');
    if (!authFormData.codePostal.trim()) errors.push('Veuillez saisir le code postal');
    if (!authFormData.ville.trim()) errors.push('Veuillez saisir la ville');

    if (authFormData.type === 'professionnel') {
      if (!authFormData.raisonSociale.trim()) errors.push('Veuillez saisir la raison sociale');
      if (!authFormData.formeJuridique.trim()) errors.push('Veuillez saisir la forme juridique');
      if (!authFormData.siret.trim() || authFormData.siret.replace(/\s/g, '').length !== 14) {
        errors.push('Le numéro SIRET doit contenir 14 chiffres');
      }
    }

    if (prmRows.length === 0) errors.push('Vous devez ajouter au moins un PRM');

    for (let i = 0; i < prmRows.length; i++) {
      const row = prmRows[i];

      if (row.isExisting) continue;

      if (!row.prm_numero.trim()) {
        errors.push(`Veuillez saisir le numéro PRM pour le compteur ${i + 1}`);
      }
      if (row.prm_numero.trim() && row.prm_numero.replace(/\s/g, '').length !== 14) {
        errors.push(`Le numéro PRM du compteur ${i + 1} doit contenir exactement 14 chiffres`);
      }
      if (row.prm_numero.trim() && !/^\d+$/.test(row.prm_numero.replace(/\s/g, ''))) {
        errors.push(`Le numéro PRM du compteur ${i + 1} ne doit contenir que des chiffres`);
      }
      if (!row.titulaire_type) {
        errors.push(`Veuillez sélectionner le type de titulaire pour le compteur ${i + 1}`);
      }
      if (!row.declarant_role) {
        errors.push(`Veuillez sélectionner le rôle du déclarant pour le compteur ${i + 1}`);
      }
    }

    if (!authFormData.consentRgpd) errors.push('Vous devez accepter l\'autorisation RGPD');

    return errors;
  };

  const hasFieldError = (fieldKeywords: string[]): boolean => {
    return validationErrors.some(error =>
      fieldKeywords.some(keyword => error.toLowerCase().includes(keyword.toLowerCase()))
    );
  };

  const submitAuthForm = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validateAuthForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      setAuthFormError('Veuillez corriger les erreurs ci-dessous avant de soumettre le formulaire');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setValidationErrors([]);
    if (!invitation) return;

    try {
      setAuthFormSubmitting(true);
      setAuthFormError(null);

      console.log('📋 [PublicInvoiceUpload] Starting authorization submission');
      console.log('   Contact ID:', invitation.contact_id);
      console.log('   Type:', authFormData.type);
      console.log('   Email:', authFormData.email);
      console.log('   Téléphone:', authFormData.telephone);
      console.log('   SIRET:', authFormData.type === 'professionnel' ? authFormData.siret : 'N/A');
      console.log('   Nombre de PRMs:', prmRows.length);

      console.log('🌐 [PublicInvoiceUpload] Fetching user IP and metadata for audit trail...');
      let userIp = null;
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        userIp = ipData.ip;
        console.log('   IP retrieved:', userIp);
      } catch (ipError) {
        console.error('❌ [PublicInvoiceUpload] Could not fetch IP:', ipError);
      }

      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      console.log('   User-Agent:', userAgent?.substring(0, 50) + '...');

      console.log('🔐 [PublicInvoiceUpload] Fetching consent text and calculating hash...');
      let consentTextHash = null;
      let policyVersionId = null;
      try {
        const { data: policyData, error: policyError } = await anonSupabase
          .from('policy_versions')
          .select('id, full_text')
          .eq('policy_code', 'CONSENT_TEXT')
          .eq('version', 'V1')
          .single();

        if (policyError) {
          console.error('❌ [PublicInvoiceUpload] Could not fetch policy version:', policyError);
        } else if (policyData) {
          policyVersionId = policyData.id;
          const encoder = new TextEncoder();
          const data = encoder.encode(policyData.full_text);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          consentTextHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          console.log('   Consent hash calculated:', consentTextHash.substring(0, 16) + '...');
          console.log('   Policy version ID:', policyVersionId);
        }
      } catch (hashError) {
        console.error('❌ [PublicInvoiceUpload] Could not calculate consent hash:', hashError);
      }

      console.log('📋 [PublicInvoiceUpload] First inserting authorization to get autorisation_id...');
      const { data: autorisationData, error: insertError } = await anonSupabase
        .from('autorisations_communication')
        .insert({
          contact_id: invitation.contact_id,
          invitation_id: invitation.id,
          type_titulaire: authFormData.type,
          civilite: authFormData.civilite,
          prenom: authFormData.prenom.trim(),
          nom: authFormData.nom.trim(),
          email: authFormData.email.trim(),
          telephone: authFormData.telephone.trim(),
          adresse: authFormData.adresse.trim(),
          code_postal: authFormData.codePostal.trim(),
          ville: authFormData.ville.trim(),
          raison_sociale: authFormData.type === 'professionnel' ? authFormData.raisonSociale.trim() : null,
          forme_juridique: authFormData.type === 'professionnel' ? authFormData.formeJuridique.trim() : null,
          siret: authFormData.type === 'professionnel' ? authFormData.siret.replace(/\s/g, '') : null,
          consent_rgpd: authFormData.consentRgpd,
          date_autorisation: new Date().toISOString(),
          ip_address: userIp,
          user_agent: userAgent,
          consent_text_hash: consentTextHash,
          policy_version_id: policyVersionId,
          declarant_nom: authFormData.nom.trim(),
          declarant_prenom: authFormData.prenom.trim(),
          declarant_email: authFormData.email.trim(),
          declarant_telephone: authFormData.telephone.trim(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ [PublicInvoiceUpload] Error inserting authorization:', insertError);
        throw insertError;
      }

      console.log('✅ [PublicInvoiceUpload] Authorization inserted successfully');
      console.log('   Authorization ID:', autorisationData.id);
      console.log('   Revocation Token:', autorisationData.revocation_token);

      setAuthFormData(prev => ({
        ...prev,
        revocation_token: autorisationData.revocation_token
      }));

      console.log('📝 [PublicInvoiceUpload] Now inserting PRMs linked to authorization...');
      const newPrmRows = prmRows.filter(row => !row.isExisting);
      console.log('   New PRMs to insert:', newPrmRows.length, 'out of', prmRows.length);

      const prmInserts = newPrmRows.map(row => ({
        contact_id: invitation.contact_id,
        autorisation_id: autorisationData.id,
        prm_numero: row.prm_numero.replace(/\s/g, ''),
        titulaire_type: row.titulaire_type,
        titulaire_civilite: row.titulaire_civilite || null,
        titulaire_prenom: row.titulaire_prenom || null,
        titulaire_nom: row.titulaire_nom || null,
        titulaire_raison_sociale: row.titulaire_type === 'professionnel' ? row.titulaire_raison_sociale : null,
        titulaire_forme_juridique: row.titulaire_type === 'professionnel' ? row.titulaire_forme_juridique : null,
        titulaire_siret: row.titulaire_type === 'professionnel' ? row.titulaire_siret.replace(/\s/g, '') : null,
        titulaire_adresse: row.titulaire_adresse || null,
        titulaire_code_postal: row.titulaire_code_postal || null,
        titulaire_ville: row.titulaire_ville || null,
        declarant_role: row.declarant_role,
      }));

      const { error: prmError } = await anonSupabase
        .from('prm')
        .insert(prmInserts);

      if (prmError) {
        console.error('❌ [PublicInvoiceUpload] Error inserting PRMs:', prmError);
        throw prmError;
      }

      console.log(`✅ [PublicInvoiceUpload] ${prmInserts.length} PRM(s) inserted successfully`);

      console.log('🔄 [PublicInvoiceUpload] Updating contact with authorization data...');

      let codeNaf: string | null = null;
      let libelleNaf: string | null = null;

      if (authFormData.type === 'professionnel' && authFormData.siret) {
        console.log('🔍 [PublicInvoiceUpload] Enriching with SIRENE API...');
        console.log('   SIRET:', authFormData.siret);

        try {
          const siretClean = authFormData.siret.replace(/\s/g, '');
          const inseeApiKey = import.meta.env.VITE_SIRENE_API_KEY;

          if (inseeApiKey) {
            const inseeResponse = await fetch(
              `https://api.insee.fr/api-sirene/3.11/siret/${siretClean}`,
              {
                method: 'GET',
                headers: {
                  'X-INSEE-Api-Key-Integration': inseeApiKey,
                  'Accept': 'application/json',
                },
              }
            );

            if (inseeResponse.ok) {
              const inseeData = await inseeResponse.json();
              const etablissement = inseeData.etablissement;

              if (etablissement?.uniteLegale) {
                codeNaf = etablissement.uniteLegale.activitePrincipaleUniteLegale || null;
                libelleNaf = etablissement.uniteLegale.nomenclatureActivitePrincipaleUniteLegale || null;
                console.log('✅ [PublicInvoiceUpload] SIRENE data retrieved:');
                console.log('   Code NAF:', codeNaf);
                console.log('   Libellé NAF:', libelleNaf);
              }
            } else {
              console.warn('⚠️ [PublicInvoiceUpload] SIRENE API returned status:', inseeResponse.status);
            }
          } else {
            console.warn('⚠️ [PublicInvoiceUpload] INSEE API key not configured');
          }
        } catch (sireneError) {
          console.error('❌ [PublicInvoiceUpload] Error fetching SIRENE data:', sireneError);
        }
      }

      const isMobilePhone = (phone: string): boolean => {
        const cleaned = phone.replace(/\s/g, '');
        return cleaned.startsWith('06') || cleaned.startsWith('07') || cleaned.startsWith('+336') || cleaned.startsWith('+337');
      };

      const contactUpdateData: any = {
        adresse: authFormData.adresse.trim(),
        code_postal: authFormData.codePostal.trim(),
        ville: authFormData.ville.trim(),
        contact1_mail1: authFormData.email.trim(),
        contact1_ip: userIp,
        contact1_ip_timestamp: new Date().toISOString(),
      };

      contactUpdateData.contact1_civilite = authFormData.civilite;
      contactUpdateData.contact1_nom = authFormData.nom.trim();
      contactUpdateData.contact1_prenom = authFormData.prenom.trim();

      if (authFormData.type === 'professionnel') {
        contactUpdateData.siret = authFormData.siret.replace(/\s/g, '');
        contactUpdateData.raison_sociale = authFormData.raisonSociale.trim();
        contactUpdateData.forme_juridique = authFormData.formeJuridique.trim();

        if (codeNaf) {
          contactUpdateData.code_naf = codeNaf;
        }
        if (libelleNaf) {
          contactUpdateData.libelle_naf = libelleNaf;
        }
      }

      if (authFormData.telephone) {
        if (isMobilePhone(authFormData.telephone)) {
          contactUpdateData.contact1_telportable = authFormData.telephone.trim();
        } else {
          contactUpdateData.contact1_telfix = authFormData.telephone.trim();
        }
      }

      console.log('📤 [PublicInvoiceUpload] Contact update data:', contactUpdateData);
      console.log('   Updating contact ID:', invitation.contact_id);

      const { data: updateResult, error: contactUpdateError } = await anonSupabase
        .from('contacts')
        .update(contactUpdateData)
        .eq('id', invitation.contact_id)
        .select();

      if (contactUpdateError) {
        console.error('❌ [PublicInvoiceUpload] Error updating contact:', contactUpdateError);
        console.error('   Error details:', JSON.stringify(contactUpdateError, null, 2));
      } else {
        console.log('✅ [PublicInvoiceUpload] Contact updated successfully');
        console.log('   Updated rows:', updateResult);
      }

      console.log('🎉 [PublicInvoiceUpload] Authorization submission completed successfully!');
      console.log('📊 [PublicInvoiceUpload] Setting authFormSuccess to TRUE');
      setAuthFormError(null);
      setAuthFormSuccess(true);
      console.log('✨ [PublicInvoiceUpload] State updated, scrolling to top');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('❌ [PublicInvoiceUpload] Error submitting authorization:', err);
      setAuthFormSuccess(false);
      setAuthFormError('Erreur lors de l\'envoi de l\'autorisation. Veuillez réessayer.');
    } finally {
      setAuthFormSubmitting(false);
      console.log('🔄 [PublicInvoiceUpload] Submitting state reset to false');
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

  if (uploadSuccess && !showAuthForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Factures envoyées !</h2>
          <p className="text-gray-600 mb-6">
            Vos factures ont été envoyées avec succès. Nous les analyserons et vous contacterons prochainement.
          </p>
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800 mb-2">
              Redirection dans <span className="text-2xl font-bold text-blue-600">{countdown}</span> secondes...
            </p>
            <p className="text-xs text-blue-600">
              Vers le formulaire d'autorisation de communication
            </p>
          </div>
          <button
            onClick={() => setShowAuthForm(true)}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Accéder au formulaire maintenant
          </button>
        </div>
      </div>
    );
  }

  if (showAuthForm) {
    if (authFormSuccess) {
      console.log('✅ [PublicInvoiceUpload] Rendering SUCCESS page');
      const revocationUrl = `${window.location.origin}/revocation?token=${authFormData.revocation_token || ''}`;
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Autorisation envoyée !</h2>
            <p className="text-gray-600 mb-6">
              Votre autorisation a été enregistrée avec succès. Nous allons pouvoir récupérer vos données
              de consommation auprès de votre gestionnaire de réseau.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800 mb-2">
                <strong>Droit de révocation (RGPD)</strong>
              </p>
              <p className="text-xs text-blue-700 mb-3">
                Vous pouvez révoquer votre consentement à tout moment en utilisant le lien ci-dessous :
              </p>
              <a
                href={revocationUrl}
                className="text-xs text-blue-600 hover:text-blue-800 underline break-all"
                target="_blank"
                rel="noopener noreferrer"
              >
                {revocationUrl}
              </a>
            </div>
            <div className="mt-6 space-y-4">
              {!showCloseInstructions ? (
                <button
                  onClick={() => {
                    const closed = window.close();
                    setTimeout(() => {
                      setShowCloseInstructions(true);
                    }, 100);
                  }}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <X className="w-5 h-5" />
                  Fermer cette page
                </button>
              ) : (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-5 text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="bg-blue-600 rounded-full p-3">
                      <Info className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <p className="text-base font-semibold text-blue-900">
                    Pour fermer cette page, vous pouvez :
                  </p>
                  <div className="space-y-2 text-sm text-blue-800">
                    <div className="flex items-center justify-center gap-2">
                      <span>• Utiliser le raccourci clavier</span>
                      <kbd className="px-3 py-1.5 bg-white border-2 border-blue-300 rounded text-sm font-mono font-bold">
                        Ctrl + W
                      </kbd>
                    </div>
                    <div className="text-sm text-blue-700">
                      (ou <kbd className="px-2 py-1 bg-white border border-blue-200 rounded text-xs font-mono">Cmd + W</kbd> sur Mac)
                    </div>
                    <p className="mt-3">• Ou cliquer sur la croix (×) de l'onglet en haut de votre navigateur</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    console.log('📝 [PublicInvoiceUpload] Rendering authorization FORM');

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full">
          <div className="text-center mb-8">
            <FileText className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Autorisation de communication des données
            </h1>
          </div>

          <form className="space-y-6" onSubmit={submitAuthForm}>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                <strong>A quoi ça sert ? </strong> Cette autorisation nous permet de récupérer vos données de consommation
                directement auprès de votre gestionnaire de réseau (Enedis) pour réaliser votre étude de simulation.
              </p>
            </div>

            {authFormError && (
              <div className="mb-6 p-4 bg-red-50 rounded-lg border-2 border-red-500">
                <div className="flex items-start gap-2 mb-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-800 mb-2">{authFormError}</p>
                    {validationErrors.length > 0 && (
                      <ul className="list-disc list-inside space-y-1">
                        {validationErrors.map((error, index) => (
                          <li key={index} className="text-sm text-red-700">{error}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type de titulaire *
              </label>
              <select
                value={authFormData.type}
                onChange={(e) => handleAuthFormChange('type', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  hasFieldError(['type de titulaire']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                }`}
              >
                <option value="">Sélectionner</option>
                <option value="particulier">Particulier</option>
                <option value="professionnel">Professionnel</option>
              </select>
            </div>

            {authFormData.type === 'professionnel' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                <h3 className="font-semibold text-gray-900 mb-2">Informations de l'établissement</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dénomination sociale *
                    </label>
                    <input
                      type="text"
                      value={authFormData.raisonSociale}
                      onChange={(e) => handleAuthFormChange('raisonSociale', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        hasFieldError(['raison sociale']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Nom de l'entreprise"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Forme juridique *
                    </label>
                    <input
                      type="text"
                      value={authFormData.formeJuridique}
                      onChange={(e) => handleAuthFormChange('formeJuridique', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        hasFieldError(['forme juridique']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="SARL, SAS, EURL..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Numéro SIRET *
                  </label>
                  <input
                    type="text"
                    value={authFormData.siret}
                    onChange={(e) => handleAuthFormChange('siret', e.target.value)}
                    maxLength={14}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      hasFieldError(['SIRET']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="14 chiffres"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse complète de l'établissement *
                  </label>
                  <input
                    type="text"
                    value={authFormData.adresse}
                    onChange={(e) => handleAuthFormChange('adresse', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      hasFieldError(['adresse']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="Numéro et nom de voie"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Code postal *
                    </label>
                    <input
                      type="text"
                      value={authFormData.codePostal}
                      onChange={(e) => handleAuthFormChange('codePostal', e.target.value)}
                      maxLength={5}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        hasFieldError(['code postal']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="75001"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ville *
                    </label>
                    <input
                      type="text"
                      value={authFormData.ville}
                      onChange={(e) => handleAuthFormChange('ville', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        hasFieldError(['ville']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Paris"
                    />
                  </div>
                </div>

                <p className="text-sm text-gray-600 font-medium mt-4">
                  Représenté par (signataire de cette autorisation) :
                </p>
              </div>
            )}

            {authFormData.type === 'particulier' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adresse complète *
                </label>
                <input
                  type="text"
                  value={authFormData.adresse}
                  onChange={(e) => handleAuthFormChange('adresse', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    hasFieldError(['adresse']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                  }`}
                  placeholder="Numéro et nom de voie"
                />
              </div>
            )}

            {authFormData.type === 'particulier' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code postal *
                  </label>
                  <input
                    type="text"
                    value={authFormData.codePostal}
                    onChange={(e) => handleAuthFormChange('codePostal', e.target.value)}
                    maxLength={5}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      hasFieldError(['code postal']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="75001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ville *
                  </label>
                  <input
                    type="text"
                    value={authFormData.ville}
                    onChange={(e) => handleAuthFormChange('ville', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      hasFieldError(['ville']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="Paris"
                  />
                </div>
              </div>
            )}

            {authFormData.type && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
                <h3 className="font-semibold text-gray-900 mb-2">
                  {authFormData.type === 'professionnel' ? 'Informations du représentant' : 'Vos informations'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Civilité *
                    </label>
                    <select
                      value={authFormData.civilite}
                      onChange={(e) => handleAuthFormChange('civilite', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        hasFieldError(['civilité']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Sélectionner</option>
                      <option value="M.">M.</option>
                      <option value="Mme">Mme</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prénom *
                    </label>
                    <input
                      type="text"
                      value={authFormData.prenom}
                      onChange={(e) => handleAuthFormChange('prenom', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        hasFieldError(['prénom']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Votre prénom"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom *
                  </label>
                  <input
                    type="text"
                    value={authFormData.nom}
                    onChange={(e) => handleAuthFormChange('nom', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      hasFieldError(['nom']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="Votre nom"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={authFormData.email}
                    onChange={(e) => handleAuthFormChange('email', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      hasFieldError(['email']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="votre@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone *
                  </label>
                  <input
                    type="tel"
                    value={authFormData.telephone}
                    onChange={(e) => handleAuthFormChange('telephone', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      hasFieldError(['téléphone']) ? 'border-red-500 border-2 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="06 12 34 56 78"
                  />
                </div>
              </div>
            )}

            {authFormData.type && (
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Compteur(s)</h3>
                    {prmRows.filter(r => r.isExisting).length > 0 && (
                      <p className="text-sm text-green-600 mt-1">
                        {prmRows.filter(r => r.isExisting).length} compteur(s) déjà autorisé(s)
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addPRMRow}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter un PRM
                  </button>
                </div>

                <div className="space-y-4">
                  {prmRows.map((row, index) => (
                    <div key={row.id} className={`border rounded-lg p-4 ${row.isExisting ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900">Compteur {index + 1}</h4>
                          {row.isExisting && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Déjà autorisé
                            </span>
                          )}
                        </div>
                        {prmRows.length > 1 && !row.isExisting && (
                          <button
                            type="button"
                            onClick={() => removePRMRow(row.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <label className="block text-sm font-medium text-gray-700">
                              {row.titulaire_type === 'professionnel' ? 'Raison sociale' : 'Nom Prénom'}
                            </label>
                          </div>
                          {!row.isEditing ? (
                            <button
                              type="button"
                              onClick={() => togglePRMEdit(row.id)}
                              className="w-full px-3 py-2 text-left border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-sm truncate"
                            >
                              {row.titulaire_type === 'professionnel'
                                ? (row.titulaire_raison_sociale || 'Cliquer pour éditer')
                                : (`${row.titulaire_prenom} ${row.titulaire_nom}`.trim() || 'Cliquer pour éditer')
                              }
                            </button>
                          ) : (
                            <input
                              type="text"
                              value={row.titulaire_type === 'professionnel' ? row.titulaire_raison_sociale : `${row.titulaire_prenom} ${row.titulaire_nom}`.trim()}
                              readOnly
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm"
                            />
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Numéro de SIRET
                          </label>
                          {!row.isEditing ? (
                            <button
                              type="button"
                              onClick={() => togglePRMEdit(row.id)}
                              className="w-full px-3 py-2 text-left border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-sm truncate"
                            >
                              {row.titulaire_type === 'professionnel' ? (row.titulaire_siret || 'Cliquer pour éditer') : 'N/A'}
                            </button>
                          ) : (
                            <input
                              type="text"
                              value={row.titulaire_type === 'professionnel' ? row.titulaire_siret : 'N/A'}
                              readOnly
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm"
                            />
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Adresse du titulaire
                          </label>
                          {!row.isEditing ? (
                            <button
                              type="button"
                              onClick={() => togglePRMEdit(row.id)}
                              className="w-full px-3 py-2 text-left border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-sm truncate"
                            >
                              {row.titulaire_adresse ? `${row.titulaire_adresse}, ${row.titulaire_code_postal} ${row.titulaire_ville}` : 'Cliquer pour éditer'}
                            </button>
                          ) : (
                            <input
                              type="text"
                              value={row.titulaire_adresse ? `${row.titulaire_adresse}, ${row.titulaire_code_postal} ${row.titulaire_ville}` : ''}
                              readOnly
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-sm"
                            />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <label className="block text-sm font-medium text-gray-700">
                              PRM *
                            </label>
                            <div className="group relative">
                              <Info className="w-4 h-4 text-gray-400 cursor-help" />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                PRM : Numéro de compteur ou PDL à 14 chiffres figurant sur vos factures
                              </div>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={row.prm_numero}
                            onChange={(e) => updatePRMRow(row.id, 'prm_numero', e.target.value)}
                            maxLength={14}
                            disabled={row.isExisting}
                            className={`w-full px-3 py-2 border rounded-lg text-sm ${
                              row.isExisting
                                ? 'border-green-300 bg-green-50 cursor-not-allowed'
                                : hasFieldError(['PRM', 'compteur'])
                                ? 'border-red-500 border-2 bg-red-50 focus:ring-2 focus:ring-red-500'
                                : 'border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                            }`}
                            placeholder="14 chiffres"
                          />
                        </div>
                      </div>

                      <div className={`border rounded-lg p-3 mb-3 ${
                        row.isExisting
                          ? 'bg-green-50 border-green-200'
                          : hasFieldError(['rôle du déclarant', 'compteur'])
                          ? 'bg-red-50 border-red-500 border-2'
                          : 'bg-blue-50 border-blue-200'
                      }`}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Rôle du déclarant pour ce compteur *  (Si vous ne savez pas cochez Mandataire)
                        </label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`declarantRole_${row.id}`}
                              value="TITULAIRE"
                              checked={row.declarant_role === 'TITULAIRE'}
                              onChange={(e) => updatePRMRow(row.id, 'declarant_role', e.target.value)}
                              disabled={row.isExisting}
                              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 disabled:cursor-not-allowed"
                            />
                            <span className={`text-sm ${row.isExisting ? 'text-gray-500' : 'text-gray-700'}`}>Titulaire du compteur</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`declarantRole_${row.id}`}
                              value="REPRESENTANT_LEGAL"
                              checked={row.declarant_role === 'REPRESENTANT_LEGAL'}
                              onChange={(e) => updatePRMRow(row.id, 'declarant_role', e.target.value)}
                              disabled={row.isExisting}
                              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 disabled:cursor-not-allowed"
                            />
                            <span className={`text-sm ${row.isExisting ? 'text-gray-500' : 'text-gray-700'}`}>Représentant légal du titulaire</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`declarantRole_${row.id}`}
                              value="MANDATAIRE"
                              checked={row.declarant_role === 'MANDATAIRE'}
                              onChange={(e) => updatePRMRow(row.id, 'declarant_role', e.target.value)}
                              disabled={row.isExisting}
                              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 disabled:cursor-not-allowed"
                            />
                            <span className={`text-sm ${row.isExisting ? 'text-gray-500' : 'text-gray-700'}`}>Mandataire (agissant au nom du titulaire)</span>
                          </label>
                        </div>
                      </div>

                      {row.isEditing && (
                        <div className="border-t border-gray-200 pt-4 mt-4 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Type de titulaire *
                            </label>
                            <select
                              value={row.titulaire_type}
                              onChange={(e) => updatePRMRow(row.id, 'titulaire_type', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Sélectionner</option>
                              <option value="particulier">Particulier</option>
                              <option value="professionnel">Professionnel</option>
                            </select>
                          </div>

                          {row.titulaire_type === 'professionnel' && (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Raison sociale
                                  </label>
                                  <input
                                    type="text"
                                    value={row.titulaire_raison_sociale}
                                    onChange={(e) => updatePRMRow(row.id, 'titulaire_raison_sociale', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Nom de l'entreprise"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Forme juridique
                                  </label>
                                  <input
                                    type="text"
                                    value={row.titulaire_forme_juridique}
                                    onChange={(e) => updatePRMRow(row.id, 'titulaire_forme_juridique', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="SARL, SAS, EURL..."
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Numéro SIRET
                                </label>
                                <input
                                  type="text"
                                  value={row.titulaire_siret}
                                  onChange={(e) => updatePRMRow(row.id, 'titulaire_siret', e.target.value)}
                                  maxLength={14}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="14 chiffres"
                                />
                              </div>
                            </>
                          )}

                          {row.titulaire_type === 'particulier' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Civilité
                                </label>
                                <select
                                  value={row.titulaire_civilite}
                                  onChange={(e) => updatePRMRow(row.id, 'titulaire_civilite', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                  <option value="">Sélectionner</option>
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
                                  value={row.titulaire_prenom}
                                  onChange={(e) => updatePRMRow(row.id, 'titulaire_prenom', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="Prénom"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Nom
                                </label>
                                <input
                                  type="text"
                                  value={row.titulaire_nom}
                                  onChange={(e) => updatePRMRow(row.id, 'titulaire_nom', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="Nom"
                                />
                              </div>
                            </div>
                          )}

                          {row.titulaire_type && (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Adresse
                                </label>
                                <input
                                  type="text"
                                  value={row.titulaire_adresse}
                                  onChange={(e) => updatePRMRow(row.id, 'titulaire_adresse', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="Numéro et nom de voie"
                                />
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Code postal
                                  </label>
                                  <input
                                    type="text"
                                    value={row.titulaire_code_postal}
                                    onChange={(e) => updatePRMRow(row.id, 'titulaire_code_postal', e.target.value)}
                                    maxLength={5}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="75001"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Ville
                                  </label>
                                  <input
                                    type="text"
                                    value={row.titulaire_ville}
                                    onChange={(e) => updatePRMRow(row.id, 'titulaire_ville', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Paris"
                                  />
                                </div>
                              </div>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => togglePRMEdit(row.id)}
                            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            Valider les modifications
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

           <div className="border-t border-gray-200 pt-6">
              {/* Bloc informations données */}
              <div className="bg-gray-100 rounded-lg p-5 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  Les données utilisées pour chacun des site sont :
                </h3>
            
                <ul className="list-disc ml-5 space-y-2 text-sm text-gray-700">
                  <li>
                    <strong>La courbe de charge :</strong> Historique de la consommation ou de l'injection électrique au pas de temps disponible et <strong>activation de sa collecte</strong> toutes les 10, 15, 30 ou 60 minutes
                  </li>
                  <li>
                    <strong>Les index quotidiens :</strong> les index envoyés au gestionnaire de réseau Enedis, en fonction des offres souscrites
                  </li>
                  <li>
                    <strong>Puissance maximale quotidienne :</strong> puissance maximale atteinte quotidienne
                  </li>
                  <li>
                    <strong>Données techniques et contractuelles disponibles :</strong> Caractéristiques de raccordement, du dispositif de comptage et des informations contractuelles (option tarifaire, puissance souscrite...) 
                  </li>
                </ul>
              </div>
            
              {/* Consentement */}
              <div className={`flex items-start space-x-3 p-3 rounded-lg ${
                hasFieldError(['RGPD', 'autorisation']) ? 'bg-red-50 border-2 border-red-500' : ''
              }`}>
                <input
                  type="checkbox"
                  id="consent"
                  checked={authFormData.consentRgpd}
                  onChange={(e) =>
                    handleAuthFormChange("consentRgpd", e.target.checked)
                  }
                  className={`mt-1 w-5 h-5 text-blue-600 rounded focus:ring-blue-500 ${
                    hasFieldError(['RGPD', 'autorisation']) ? 'border-red-500 border-2' : 'border-gray-300'
                  }`}
                />
            
                <label htmlFor="consent" className="text-sm text-gray-700 leading-relaxed">
                  Je déclare sur l'honneur être le titulaire des points ci-dessus ou être mandaté par celui-ci et
                  j'accepte qu'Helioze ait accès à mes données des 2 ans passés et pour les 3 ans à
                  venir.
                  <span className="block mt-2">
                    Cette autorisation est consentie pour une durée de 36 mois à compter de la validation
                    de ce formulaire. Vos données seront traitées conformément aux règles{" "}
                    <a
                      href="https://helioze.fr/rgpd/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      RGPD
                    </a>
                    . *
                  </span>
                </label>
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={authFormSubmitting}
                className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {authFormSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  'Accepter'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAuthForm(false);
                  setUploadSuccess(false);
                }}
                disabled={authFormSubmitting}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Retour
              </button>
            </div>
          </form>

          <p className="text-xs text-gray-500 text-center mt-6">
            * Les informations collectées sont conservées de manière sécurisée conformément à notre politique de confidentialité
            et vous disposez d'un droit d'accès, de rectification, de suppression sur simple demande auprès d'Helioze (contact@helioze.fr).
          </p>
        </div>
      </div>
    );
  }

  if (invitation?.type_invitation === 'autorisation') {
    return null;
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
