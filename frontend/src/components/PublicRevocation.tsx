import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Shield, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface RevocationData {
  civilite: string;
  nom: string;
  prenom: string;
  email: string;
  raison_sociale: string;
  date_autorisation: string;
}

export const PublicRevocation: React.FC = () => {
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [authData, setAuthData] = useState<RevocationData | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [revocationReason, setRevocationReason] = useState<string>('Révocation demandée par le titulaire');
  const [userIp, setUserIp] = useState<string>('');
  const [userAgent] = useState<string>(navigator.userAgent);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');

    if (!tokenParam) {
      setError('Aucun token de révocation fourni');
      setLoading(false);
      return;
    }

    setToken(tokenParam);
    validateToken(tokenParam);
    fetchUserIp();
  }, []);

  const fetchUserIp = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      setUserIp(data.ip);
    } catch (err) {
      console.error('Failed to fetch IP:', err);
      setUserIp('unknown');
    }
  };

  const validateToken = async (revocationToken: string) => {
    try {
      setValidating(true);
      setError('');

      const { data, error: fetchError } = await supabase
        .from('autorisations_communication')
        .select('civilite, nom, prenom, email, raison_sociale, date_autorisation, consent_status')
        .eq('revocation_token', revocationToken)
        .gt('revocation_token_expires_at', new Date().toISOString())
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching authorization:', fetchError);
        setError('Erreur lors de la validation du token');
        return;
      }

      if (!data) {
        setError('Le lien de révocation est invalide ou a expiré');
        return;
      }

      if (data.consent_status === 'REVOKED') {
        setError('Cette autorisation a déjà été révoquée');
        return;
      }

      setAuthData(data);
    } catch (err) {
      console.error('Validation error:', err);
      setError('Erreur lors de la validation du lien');
    } finally {
      setValidating(false);
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!token || !authData) return;

    try {
      setRevoking(true);
      setError('');

      const { data, error: rpcError } = await supabase.rpc('revoke_authorization_by_token', {
        p_revocation_token: token,
        p_revocation_reason: revocationReason,
        p_ip_address: userIp,
        p_user_agent: userAgent
      });

      if (rpcError) {
        console.error('Revocation RPC error:', rpcError);
        setError('Erreur lors de la révocation');
        return;
      }

      if (data && !data.success) {
        setError(data.message || 'Erreur lors de la révocation');
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error('Revocation error:', err);
      setError('Erreur lors de la révocation du consentement');
    } finally {
      setRevoking(false);
    }
  };

  if (loading || validating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Validation du lien de révocation...</p>
        </div>
      </div>
    );
  }

  if (error && !authData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <h2 className="text-xl font-semibold text-gray-800">Lien invalide</h2>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              Si vous pensez qu'il s'agit d'une erreur, veuillez contacter l'exploitant qui vous a envoyé ce lien.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <h2 className="text-xl font-semibold text-gray-800">Révocation réussie</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Votre consentement a été révoqué avec succès.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
            <p className="text-sm text-gray-700">
              <strong>Effets de la révocation :</strong>
            </p>
            <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
              <li>Arrêt immédiat de tout accès à vos données</li>
              <li>Plus aucun appel API Enedis ne sera effectué</li>
              <li>Les logs de consentement antérieurs sont conservés pour preuve légale</li>
              <li>Vos données seront anonymisées après 24 mois</li>
            </ul>
          </div>
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Vous pouvez fermer cette page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl w-full">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold text-gray-800">Révocation du consentement</h1>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700">
            <strong>Conformité RGPD - Article 7.3 :</strong> Vous avez le droit de retirer votre consentement à tout moment.
          </p>
        </div>

        {authData && (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-800 mb-3">Informations sur l'autorisation</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Titulaire :</span>
                  <span className="font-medium text-gray-800">
                    {authData.civilite} {authData.prenom} {authData.nom}
                  </span>
                </div>
                {authData.raison_sociale && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Entreprise :</span>
                    <span className="font-medium text-gray-800">{authData.raison_sociale}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Email :</span>
                  <span className="font-medium text-gray-800">{authData.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Date du consentement :</span>
                  <span className="font-medium text-gray-800">
                    {new Date(authData.date_autorisation).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Raison de la révocation (optionnel)
              </label>
              <textarea
                value={revocationReason}
                onChange={(e) => setRevocationReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Ex: Je ne souhaite plus partager mes données"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-gray-700 mb-2">
                <strong>Attention :</strong> Cette action est immédiate et irréversible.
              </p>
              <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                <li>Tous les accès futurs à vos données seront bloqués</li>
                <li>Les traitements en cours seront arrêtés immédiatement</li>
                <li>Vous devrez donner un nouveau consentement si vous changez d'avis</li>
              </ul>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="flex-1 bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 transition disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {revoking ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Révocation en cours...
                  </span>
                ) : (
                  'Révoquer mon consentement'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
