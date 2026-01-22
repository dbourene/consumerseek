import { supabase } from '../supabaseClient';
import type { Contact, InvitationFacture, Facture } from '../types/consumerstat';

// ==================== CONTACTS ====================

export async function createContact(contact: Omit<Contact, 'id' | 'created_at' | 'updated_at' | 'user_id'>): Promise<Contact | null> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert([{ ...contact, user_id: user.id }])
    .select()
    .single();

  if (error) {
    console.error('Error creating contact:', error);
    throw error;
  }

  return data;
}

export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching contacts:', error);
    throw error;
  }

  return data || [];
}

export async function getContactById(id: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching contact:', error);
    throw error;
  }

  return data;
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating contact:', error);
    throw error;
  }

  return data;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting contact:', error);
    throw error;
  }
}

// ==================== INVITATIONS ====================

export async function createInvitation(
  contactId: string,
  emailDestinataire: string,
  messagePersonnalise?: string,
  expirationJours: number = 30
): Promise<InvitationFacture | null> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('User not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const appUrl = window.location.origin;

  const response = await fetch(`${supabaseUrl}/functions/v1/send-invoice-invitation`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contactId,
      message: messagePersonnalise,
      expirationDays: expirationJours,
      appUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Error creating invitation:', error);
    throw new Error(error.error || 'Failed to create invitation');
  }

  const result = await response.json();

  return {
    id: result.invitationId,
    contact_id: contactId,
    token: result.uploadUrl.split('/').pop() || '',
    email_destinataire: emailDestinataire,
    statut: 'envoyé',
    date_envoi: new Date().toISOString(),
    date_expiration: result.expiresAt,
    message_personnalise: messagePersonnalise,
    nb_factures_deposees: 0,
    created_at: new Date().toISOString(),
  } as InvitationFacture;
}

export async function getInvitations(): Promise<InvitationFacture[]> {
  const { data, error } = await supabase
    .from('invitations_factures')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching invitations:', error);
    throw error;
  }

  return data || [];
}

export async function getInvitationByToken(token: string): Promise<InvitationFacture | null> {
  const { data, error } = await supabase
    .from('invitations_factures')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('Error fetching invitation:', error);
    throw error;
  }

  return data;
}

export async function updateInvitationStatus(
  invitationId: string,
  statut: InvitationFacture['statut'],
  incrementFactures: boolean = false
): Promise<void> {
  const updates: Partial<InvitationFacture> = { statut };

  if (statut === 'ouvert' && !updates.date_ouverture) {
    updates.date_ouverture = new Date().toISOString();
  }

  const { error } = await supabase
    .from('invitations_factures')
    .update(updates)
    .eq('id', invitationId);

  if (error) {
    console.error('Error updating invitation status:', error);
    throw error;
  }

  if (incrementFactures) {
    const { error: incrementError } = await supabase.rpc('increment_factures_deposees', {
      invitation_id: invitationId
    });

    if (incrementError) {
      console.error('Error incrementing factures count:', incrementError);
    }
  }
}

// ==================== FACTURES ====================

export async function uploadFacture(
  file: File,
  contactId: string,
  invitationId?: string
): Promise<{ facture: Facture; fileUrl: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated');
  }

  // Upload file to storage
  const fileExt = file.name.split('.').pop();
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${user.id}/${contactId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('factures-privees')
    .upload(filePath, file);

  if (uploadError) {
    console.error('Error uploading file:', uploadError);
    throw uploadError;
  }

  // Create hash for duplicate detection
  const fileBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Create facture record
  const { data, error } = await supabase
    .from('factures')
    .insert([{
      user_id: user.id,
      contact_id: contactId,
      invitation_id: invitationId,
      fichier_path: filePath,
      fichier_nom: file.name,
      fichier_taille: file.size,
      fichier_hash: fileHash,
      bucket_id: 'factures-privees',
    }])
    .select()
    .single();

  if (error) {
    console.error('Error creating facture record:', error);
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from('factures-privees')
    .getPublicUrl(filePath);

  return {
    facture: data,
    fileUrl: urlData.publicUrl
  };
}

export async function getFactures(filters?: {
  contactId?: string;
  statut?: Facture['statut_extraction'];
  fournisseur?: string;
}): Promise<Facture[]> {
  let query = supabase
    .from('factures')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.contactId) {
    query = query.eq('contact_id', filters.contactId);
  }

  if (filters?.statut) {
    query = query.eq('statut_extraction', filters.statut);
  }

  if (filters?.fournisseur) {
    query = query.eq('fournisseur', filters.fournisseur);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching factures:', error);
    throw error;
  }

  return data || [];
}

export async function getFactureById(id: string): Promise<Facture | null> {
  const { data, error } = await supabase
    .from('factures')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching facture:', error);
    throw error;
  }

  return data;
}

export async function updateFacture(id: string, updates: Partial<Facture>): Promise<Facture | null> {
  const { data, error } = await supabase
    .from('factures')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating facture:', error);
    throw error;
  }

  return data;
}

export async function deleteFacture(id: string): Promise<void> {
  // Get facture to delete file from storage
  const facture = await getFactureById(id);

  if (facture?.fichier_path && facture?.bucket_id) {
    const { error: storageError } = await supabase.storage
      .from(facture.bucket_id)
      .remove([facture.fichier_path]);

    if (storageError) {
      console.error('Error deleting file from storage:', storageError);
    }
  }

  const { error } = await supabase
    .from('factures')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting facture:', error);
    throw error;
  }
}

export async function getFactureFileUrl(facturePath: string, bucketId: string = 'factures-privees'): Promise<string> {
  const { data } = supabase.storage
    .from(bucketId)
    .getPublicUrl(facturePath);

  return data.publicUrl;
}
