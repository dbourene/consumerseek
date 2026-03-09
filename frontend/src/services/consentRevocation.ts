import { supabase } from '../supabaseClient';

export interface RevocationResult {
  success: boolean;
  error?: string;
}

export async function revokePRMConsent(
  prmId: string,
  reason?: string
): Promise<RevocationResult> {
  try {
    const { data: prmData, error: prmError } = await supabase
      .from('prm')
      .select('prm_numero, contact_id, autorisation_id')
      .eq('id', prmId)
      .maybeSingle();

    if (prmError || !prmData) {
      return { success: false, error: 'PRM non trouvé' };
    }

    const { error: prmUpdateError } = await supabase
      .from('prm')
      .update({
        statut: 'REVOKED',
        revoked_at: new Date().toISOString(),
      })
      .eq('id', prmId);

    if (prmUpdateError) {
      console.error('Error updating PRM status:', prmUpdateError);
      return { success: false, error: 'Erreur lors de la révocation du PRM' };
    }

    const { data: { user } } = await supabase.auth.getUser();
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'server';

    const { error: eventError } = await supabase
      .from('consent_events')
      .insert({
        event_type: 'PRM_REVOKED',
        autorisation_id: prmData.autorisation_id,
        prm_id: prmId,
        prm_number: prmData.prm_numero,
        identity_client: {},
        ip_address: null,
        user_agent: userAgent,
        consent_given: false,
        triggered_by: user?.id || null,
        triggered_by_type: 'user',
        metadata: { revocation_reason: reason || 'Révocation demandée par le titulaire' },
      });

    if (eventError) {
      console.error('Error creating consent event:', eventError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in revokePRMConsent:', error);
    return { success: false, error: 'Erreur technique lors de la révocation' };
  }
}

export async function revokeAllContactPRMs(
  contactId: string,
  reason?: string
): Promise<RevocationResult> {
  try {
    const { data: prms, error: prmError } = await supabase
      .from('prm')
      .select('id, prm_numero, autorisation_id')
      .eq('contact_id', contactId)
      .eq('statut', 'ACTIVE');

    if (prmError || !prms || prms.length === 0) {
      return { success: false, error: 'Aucun PRM actif trouvé pour ce contact' };
    }

    const autorisationId = prms[0]?.autorisation_id;

    const { error: prmUpdateError } = await supabase
      .from('prm')
      .update({
        statut: 'REVOKED',
        revoked_at: new Date().toISOString(),
      })
      .eq('contact_id', contactId)
      .eq('statut', 'ACTIVE');

    if (prmUpdateError) {
      console.error('Error updating PRMs status:', prmUpdateError);
      return { success: false, error: 'Erreur lors de la révocation des PRMs' };
    }

    const { error: authError } = await supabase
      .from('autorisations_communication')
      .update({
        consent_status: 'REVOKED',
        revoked_at: new Date().toISOString(),
        revocation_reason: reason || 'Révocation de tous les PRMs du contact',
      })
      .eq('contact_id', contactId)
      .eq('consent_status', 'ACTIVE');

    if (authError) {
      console.error('Error revoking authorization:', authError);
    }

    const { data: { user } } = await supabase.auth.getUser();
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'server';

    const { error: eventError } = await supabase
      .from('consent_events')
      .insert({
        event_type: 'CONSENT_REVOKED',
        autorisation_id: autorisationId,
        prm_id: null,
        prm_number: null,
        identity_client: {},
        ip_address: null,
        user_agent: userAgent,
        consent_given: false,
        triggered_by: user?.id || null,
        triggered_by_type: 'user',
        metadata: {
          revocation_reason: reason || 'Révocation de tous les PRMs du contact',
          prm_count: prms.length,
        },
      });

    if (eventError) {
      console.error('Error creating consent event:', eventError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in revokeAllContactPRMs:', error);
    return { success: false, error: 'Erreur technique lors de la révocation' };
  }
}

export async function getPRMConsentStatus(prmId: string): Promise<{
  status: 'ACTIVE' | 'REVOKED' | 'UNKNOWN';
  revokedAt?: string;
  reason?: string;
}> {
  try {
    const { data: prmData, error: prmError } = await supabase
      .from('prm')
      .select('statut, revoked_at')
      .eq('id', prmId)
      .maybeSingle();

    if (prmError || !prmData) {
      return { status: 'UNKNOWN' };
    }

    const { data: eventData, error: eventError } = await supabase
      .from('consent_events')
      .select('metadata')
      .eq('prm_id', prmId)
      .eq('event_type', 'PRM_REVOKED')
      .order('server_timestamp_utc', { ascending: false })
      .limit(1)
      .maybeSingle();

    const revocationReason = eventData?.metadata?.revocation_reason;

    return {
      status: prmData.statut as 'ACTIVE' | 'REVOKED',
      revokedAt: prmData.revoked_at || undefined,
      reason: revocationReason || undefined,
    };
  } catch (error) {
    console.error('Error getting PRM consent status:', error);
    return { status: 'UNKNOWN' };
  }
}

export interface DirectRevocationResult {
  success: boolean;
  error?: string;
  message: string;
  autorisation_id?: string;
}

export interface RevocationTokenValidation {
  isValid: boolean;
  error?: string;
  data?: {
    civilite: string;
    nom: string;
    prenom: string;
    email: string;
    raison_sociale: string;
    date_autorisation: string;
    consent_status: string;
  };
}

export async function validateRevocationToken(token: string): Promise<RevocationTokenValidation> {
  try {
    const { data, error } = await supabase
      .from('autorisations_communication')
      .select('civilite, nom, prenom, email, raison_sociale, date_autorisation, consent_status')
      .eq('revocation_token', token)
      .gt('revocation_token_expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      console.error('Error validating revocation token:', error);
      return {
        isValid: false,
        error: 'Erreur lors de la validation du token'
      };
    }

    if (!data) {
      return {
        isValid: false,
        error: 'Le lien de révocation est invalide ou a expiré'
      };
    }

    if (data.consent_status === 'REVOKED') {
      return {
        isValid: false,
        error: 'Cette autorisation a déjà été révoquée'
      };
    }

    return {
      isValid: true,
      data
    };
  } catch (err) {
    console.error('Validation error:', err);
    return {
      isValid: false,
      error: 'Erreur lors de la validation du lien'
    };
  }
}

export async function revokeConsentByToken(
  token: string,
  reason: string,
  ipAddress: string,
  userAgent: string
): Promise<DirectRevocationResult> {
  try {
    const { data, error } = await supabase.rpc('revoke_authorization_by_token', {
      p_revocation_token: token,
      p_revocation_reason: reason,
      p_ip_address: ipAddress,
      p_user_agent: userAgent
    });

    if (error) {
      console.error('Revocation RPC error:', error);
      return {
        success: false,
        message: 'Erreur lors de la révocation'
      };
    }

    if (data && !data.success) {
      return {
        success: false,
        error: data.error,
        message: data.message || 'Erreur lors de la révocation'
      };
    }

    return {
      success: true,
      message: 'Votre consentement a été révoqué avec succès',
      autorisation_id: data?.autorisation_id
    };
  } catch (err) {
    console.error('Revocation error:', err);
    return {
      success: false,
      message: 'Erreur lors de la révocation du consentement'
    };
  }
}

export async function getUserIp(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (err) {
    console.error('Failed to fetch IP:', err);
    return 'unknown';
  }
}

export function generateRevocationUrl(token: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/revocation?token=${token}`;
}

export async function getRevocationHistory(autorisationId: string) {
  try {
    const { data, error } = await supabase
      .from('revocation_requests')
      .select('*')
      .eq('autorisation_id', autorisationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching revocation history:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Revocation history error:', err);
    return [];
  }
}

export async function getAllRevocationRequests() {
  try {
    const { data, error } = await supabase
      .from('revocation_requests')
      .select(`
        *,
        autorisations_communication (
          civilite,
          nom,
          prenom,
          email,
          raison_sociale
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching all revocation requests:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('All revocation requests error:', err);
    return [];
  }
}