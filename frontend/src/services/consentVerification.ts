import { supabase } from '../supabaseClient';

export interface ConsentCheckResult {
  isValid: boolean;
  isRevoked: boolean;
  autorisationId?: string;
  revocationDate?: string;
  errorMessage?: string;
}

export async function checkPRMConsent(prmNumero: string): Promise<ConsentCheckResult> {
  try {
    const { data: prmData, error: prmError } = await supabase
      .from('prm')
      .select('id, autorisation_id')
      .eq('prm_numero', prmNumero.replace(/\s/g, ''))
      .maybeSingle();

    if (prmError) {
      console.error('Error checking PRM:', prmError);
      return {
        isValid: false,
        isRevoked: false,
        errorMessage: 'Erreur lors de la vérification du PRM',
      };
    }

    if (!prmData || !prmData.autorisation_id) {
      return {
        isValid: false,
        isRevoked: false,
        errorMessage: 'Aucune autorisation trouvée pour ce PRM',
      };
    }

    const { data: autorisationData, error: autorisationError } = await supabase
      .from('autorisations_communication')
      .select('id, revocation_timestamp, access_after_revocation_flag, access_blocked_count')
      .eq('id', prmData.autorisation_id)
      .maybeSingle();

    if (autorisationError) {
      console.error('Error checking authorization:', autorisationError);
      return {
        isValid: false,
        isRevoked: false,
        errorMessage: 'Erreur lors de la vérification de l\'autorisation',
      };
    }

    if (!autorisationData) {
      return {
        isValid: false,
        isRevoked: false,
        errorMessage: 'Autorisation introuvable',
      };
    }

    const isRevoked = autorisationData.revocation_timestamp !== null;

    if (isRevoked) {
      await logBlockedAccess(prmData.autorisation_id, prmNumero);

      return {
        isValid: false,
        isRevoked: true,
        autorisationId: prmData.autorisation_id,
        revocationDate: autorisationData.revocation_timestamp,
        errorMessage: `Accès refusé : le consentement a été révoqué le ${new Date(autorisationData.revocation_timestamp).toLocaleDateString('fr-FR')}`,
      };
    }

    await logSuccessfulAccess(prmData.autorisation_id, prmNumero);

    return {
      isValid: true,
      isRevoked: false,
      autorisationId: prmData.autorisation_id,
    };
  } catch (err) {
    console.error('Unexpected error in checkPRMConsent:', err);
    return {
      isValid: false,
      isRevoked: false,
      errorMessage: 'Erreur inattendue lors de la vérification du consentement',
    };
  }
}

export async function checkContactConsent(contactId: string): Promise<ConsentCheckResult> {
  try {
    const { data: autorisations, error: autorisationError } = await supabase
      .from('autorisations_communication')
      .select('id, revocation_timestamp')
      .eq('contact_id', contactId);

    if (autorisationError) {
      console.error('Error checking contact authorizations:', autorisationError);
      return {
        isValid: false,
        isRevoked: false,
        errorMessage: 'Erreur lors de la vérification des autorisations du contact',
      };
    }

    if (!autorisations || autorisations.length === 0) {
      return {
        isValid: false,
        isRevoked: false,
        errorMessage: 'Aucune autorisation trouvée pour ce contact',
      };
    }

    const activeAutorisation = autorisations.find(a => a.revocation_timestamp === null);

    if (!activeAutorisation) {
      const revokedAutorisation = autorisations[0];
      await logBlockedAccess(revokedAutorisation.id, null);

      return {
        isValid: false,
        isRevoked: true,
        autorisationId: revokedAutorisation.id,
        revocationDate: revokedAutorisation.revocation_timestamp,
        errorMessage: `Accès refusé : toutes les autorisations ont été révoquées`,
      };
    }

    await logSuccessfulAccess(activeAutorisation.id, null);

    return {
      isValid: true,
      isRevoked: false,
      autorisationId: activeAutorisation.id,
    };
  } catch (err) {
    console.error('Unexpected error in checkContactConsent:', err);
    return {
      isValid: false,
      isRevoked: false,
      errorMessage: 'Erreur inattendue lors de la vérification du consentement',
    };
  }
}

async function logBlockedAccess(autorisationId: string, prmNumero: string | null): Promise<void> {
  try {
    await supabase
      .from('autorisations_communication')
      .update({
        access_after_revocation_flag: true,
        last_access_attempt_at: new Date().toISOString(),
        access_blocked_count: supabase.rpc('increment', { row_id: autorisationId, amount: 1 }),
      })
      .eq('id', autorisationId);

    await supabase
      .from('consent_events')
      .insert({
        autorisation_id: autorisationId,
        event_type: 'ACCESS_DENIED_AFTER_REVOCATION',
        event_timestamp: new Date().toISOString(),
        metadata: {
          prm_numero: prmNumero,
          ip_address: null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        },
      });

    console.warn(`🚫 Access blocked for revoked authorization ${autorisationId}${prmNumero ? ` (PRM: ${prmNumero})` : ''}`);
  } catch (err) {
    console.error('Error logging blocked access:', err);
  }
}

async function logSuccessfulAccess(autorisationId: string, prmNumero: string | null): Promise<void> {
  try {
    await supabase
      .from('autorisations_communication')
      .update({
        last_access_attempt_at: new Date().toISOString(),
      })
      .eq('id', autorisationId);

    console.log(`✅ Access granted for authorization ${autorisationId}${prmNumero ? ` (PRM: ${prmNumero})` : ''}`);
  } catch (err) {
    console.error('Error logging successful access:', err);
  }
}
