/**
 * frontend/supabase/functions/sirene-search/index.ts
 * Edge Function Supabase pour rechercher des établissements dans l'API SIRENE V3
 * Supporte la recherche tolérante par adresse, code postal/commune, NAF, SIREN/SIRET
 * Utilise OAuth2 si les credentials INSEE sont configurés, sinon mode public
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SireneSearchParams {
  address?: string;
  commune?: string;
  codePostal?: string;
  codeCommune?: string;
  codeNAF?: string;
  siret?: string;
  siren?: string;
  limit?: number;
}

interface SireneEtablissement {
  siren: string;
  siret: string;
  denominationUniteLegale?: string;
  nomUniteLegale?: string;
  prenomUniteLegale?: string;
  activitePrincipaleUniteLegale?: string;
  nomenclatureActivitePrincipaleUniteLegale?: string;
  numeroVoieEtablissement?: string;
  typeVoieEtablissement?: string;
  libelleVoieEtablissement?: string;
  codePostalEtablissement?: string;
  libelleCommuneEtablissement?: string;
  codeCommuneEtablissement?: string;
  activitePrincipaleEtablissement?: string;
  etatAdministratifEtablissement?: string;
  geo_adresse?: string;
  geo_score?: number;
  latitude?: string;
  longitude?: string;
}

// Note: L'API SIRENE V3 peut fonctionner avec ou sans authentification
// - Avec authentification : quotas plus élevés, moins de limitations
// - Sans authentification : API publique avec rate limiting strict
// Documentation: https://api.insee.fr/catalogue/site/themes/wso2/subthemes/insee/pages/item-info.jag?name=Sirene&version=V3&provider=insee

const INSEE_CLIENT_ID = Deno.env.get('INSEE_CLIENT_ID') || '';
const INSEE_CLIENT_SECRET = Deno.env.get('INSEE_CLIENT_SECRET') || '';

/**
 * Obtient un token d'accès OAuth2 pour l'API INSEE
 * Retourne null si les credentials ne sont pas configurés (mode public)
 */
async function getInseeAccessToken(): Promise<string | null> {
  if (!INSEE_CLIENT_ID || !INSEE_CLIENT_SECRET) {
    console.log('INSEE credentials not found, using public API');
    return null;
  }

  try {
    const credentials = btoa(`${INSEE_CLIENT_ID}:${INSEE_CLIENT_SECRET}`);

    const response = await fetch('https://api.insee.fr/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      console.error('Failed to get INSEE token:', response.statusText);
      console.log('Falling back to public API');
      return null;
    }

    const data = await response.json();
    console.log('Using authenticated INSEE API');
    return data.access_token;
  } catch (error) {
    console.error('Error getting INSEE token:', error);
    console.log('Falling back to public API');
    return null;
  }
}

/**
 * Extrait un terme significatif de l'adresse (premier mot > 3 caractères ou dernier mot)
 */
function extractSearchTerm(address: string): string {
  const cleanAddress = address
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleanAddress.split(' ').filter(w => w.length > 0);

  // Chercher le premier mot significatif (> 3 caractères)
  const significantWord = words.find(w => w.length > 3);

  if (significantWord) {
    return significantWord;
  }

  // Sinon, prendre le dernier mot
  return words[words.length - 1] || cleanAddress;
}

/**
 * Recherche dans l'API SIRENE (avec ou sans authentification)
 */
async function searchSirene(
  params: SireneSearchParams,
  token: string | null
): Promise<SireneEtablissement[]> {
  let query = '';

  // Construction de la requête
  if (params.siret) {
    query = `siret:${params.siret}`;
  } else if (params.siren) {
    query = `siren:${params.siren}`;
  } else {
    // Recherche tolérante par critères multiples
    const searchParts: string[] = [];

    if (params.address) {
      // Extraire un terme significatif
      const terme = extractSearchTerm(params.address);
      console.log(`🔍 Search term extracted from address: "${terme}"`);

      // Recherche tolérante sur plusieurs champs
      const escaped = terme.replace(/"/g, '');
      const tolerantSearch =
        `(denominationUniteLegale:"${escaped}" OR enseigne1Etablissement:"${escaped}" OR libelleVoieEtablissement:"${escaped}")`;
      searchParts.push(tolerantSearch);
    }

    // Code commune (obligatoire pour éviter les 404)
    if (params.codeCommune) {
      searchParts.push(`codeCommuneEtablissement:${params.codeCommune}`);
    } else if (params.codePostal) {
      // Fallback sur code postal si pas de code commune
      searchParts.push(`codePostalEtablissement:${params.codePostal}`);
    }

    // Établissements actifs uniquement
    searchParts.push('etatAdministratifEtablissement:A');

    query = searchParts.join(' AND ');

    // NE PAS filtrer par NAF dans la requête INSEE
    // Le filtrage NAF sera appliqué après réception des résultats
  }

  const nombre = params.limit || 20;

  // Utiliser l'endpoint /etablissements avec la version V3.11
  const url = `https://api.insee.fr/entreprises/sirene/V3.11/etablissements?q=${encodeURIComponent(query)}&nombre=${nombre}`;

  // Construire les headers avec ou sans authentification
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  console.log('📡 Calling SIRENE API V3.11...');
  console.log('   Query (before encoding):', query);
  console.log('🌐 URL FINALE APPELÉE:', url);

  const response = await fetch(url, { headers });

  console.log('📥 SIRENE API Response Status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ SIRENE API Error Response Body:', errorText);
    console.error('   Status:', response.status, response.statusText);
    console.error('   URL:', url);
    throw new Error(`SIRENE API error (${response.status}): ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ SIRENE API Response:', JSON.stringify(data).substring(0, 500));

  // Si pas de résultats, retourner tableau vide (pas d'erreur 500)
  if (!data.etablissements || data.etablissements.length === 0) {
    console.log('⚠️ No etablissements found in response (this is OK, not an error)');
    return [];
  }

  console.log(`✅ Found ${data.etablissements.length} etablissements from API`);

  // Mapper les établissements
  let etablissements = data.etablissements.map((etab: any) => ({
    siren: etab.siren,
    siret: etab.siret,
    denominationUniteLegale: etab.uniteLegale?.denominationUniteLegale,
    nomUniteLegale: etab.uniteLegale?.nomUniteLegale,
    prenomUniteLegale: etab.uniteLegale?.prenomUniteLegale,
    activitePrincipaleUniteLegale: etab.uniteLegale?.activitePrincipaleUniteLegale,
    nomenclatureActivitePrincipaleUniteLegale: etab.uniteLegale?.nomenclatureActivitePrincipaleUniteLegale,
    numeroVoieEtablissement: etab.adresseEtablissement?.numeroVoieEtablissement,
    typeVoieEtablissement: etab.adresseEtablissement?.typeVoieEtablissement,
    libelleVoieEtablissement: etab.adresseEtablissement?.libelleVoieEtablissement,
    codePostalEtablissement: etab.adresseEtablissement?.codePostalEtablissement,
    libelleCommuneEtablissement: etab.adresseEtablissement?.libelleCommuneEtablissement,
    codeCommuneEtablissement: etab.adresseEtablissement?.codeCommuneEtablissement,
    activitePrincipaleEtablissement: etab.periodesEtablissement?.[0]?.activitePrincipaleEtablissement,
    etatAdministratifEtablissement: etab.periodesEtablissement?.[0]?.etatAdministratifEtablissement,
    geo_adresse: etab.adresseEtablissement?.geo_adresse,
    geo_score: etab.adresseEtablissement?.geo_score,
    latitude: etab.adresseEtablissement?.latitude,
    longitude: etab.adresseEtablissement?.longitude,
  }));

  // Filtrage NAF applicatif (après réception des résultats)
  if (params.codeNAF) {
    const cleanNAF = params.codeNAF.replace('.', '').substring(0, 2);
    console.log(`🔍 Filtering by NAF code (2 digits): ${cleanNAF}`);

    etablissements = etablissements.filter((etab: SireneEtablissement) => {
      const matches = etab.activitePrincipaleEtablissement?.startsWith(cleanNAF);
      if (matches) {
        console.log(`   ✅ Match: ${etab.siret} - NAF ${etab.activitePrincipaleEtablissement}`);
      }
      return matches;
    });

    console.log(`✅ After NAF filtering: ${etablissements.length} etablissements`);
  }

  return etablissements;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Vérifier que la méthode est POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parser les paramètres de recherche
    const params: SireneSearchParams = await req.json();

    console.log('SIRENE search params:', params);

    // Obtenir le token d'accès
    const token = await getInseeAccessToken();

    // Effectuer la recherche
    const results = await searchSirene(params, token);

    console.log(`Found ${results.length} results`);

    return new Response(
      JSON.stringify({
        success: true,
        count: results.length,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('Error in sirene-search:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
