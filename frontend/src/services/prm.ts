import { supabase } from '../supabaseClient';
import type { PRM } from '../types/prm';

export async function getPRMsByContact(contactId: string): Promise<PRM[]> {
  const { data, error } = await supabase
    .from('prm')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createPRM(prm: Partial<PRM>): Promise<PRM> {
  const { data, error } = await supabase
    .from('prm')
    .insert(prm)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePRM(id: string, updates: Partial<PRM>): Promise<PRM> {
  const { data, error } = await supabase
    .from('prm')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePRM(id: string): Promise<void> {
  const { error } = await supabase
    .from('prm')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
