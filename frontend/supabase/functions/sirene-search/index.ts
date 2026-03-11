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
  debut?: number;
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
  indiceRepetitionEtablissement?: string;
  typeVoieEtablissement?: string;
  libelleVoieEtablissement?: string;
  codePostalEtablissement?: string;
  libelleCommuneEtablissement?: string;
  codeCommuneEtablissement?: string;
  activitePrincipaleEtablissement?: string;
  etatAdministratifEtablissement?: string;
  etatAdministratifUniteLegale?: string;
  trancheEffectifsEtablissement?: string;
  dateCreationEtablissement?: string;
  geo_adresse?: string;
  geo_score?: number;
  coordonneeLambertAbscisse?: string;
  coordonneeLambertOrdonnee?: string;
}

// Note: L'API SIRENE V3 utilise l'authentification par API Key
// Documentation: https://api.insee.fr/catalogue/site/themes/wso2/subthemes/insee/pages/item-info.jag?name=Sirene&version=V3&provider=insee

const INSEE_API_KEY = Deno.env.get('INSEE_API_KEY') || '';

/**
 * Vérifie que l'API Key INSEE est configurée
 */
function validateApiKey(): void {
  if (!INSEE_API_KEY) {
    throw new Error('INSEE_API_KEY environment variable is not configured');
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
 * Recherche dans l'API SIRENE avec authentification par API Key et support de la pagination
 */
async function searchSirene(
  params: SireneSearchParams
): Promise<{ etablissements: SireneEtablissement[]; total: number }> {
  const searchParts: string[] = [];

  // Construction de la requête - TOUJOURS utiliser la recherche multicritère
  if (params.siret) {
    searchParts.push(`siret:${params.siret}`);
  } else if (params.siren) {
    searchParts.push(`siren:${params.siren}`);
  } else if (params.address && !params.codeCommune) {
    // Recherche par dénomination UNIQUEMENT pour le rapprochement individuel
    // PAS pour le chargement massif par commune
    const terme = extractSearchTerm(params.address);
    console.log(`🔍 Search term extracted from address: "${terme}"`);

    const escaped = terme.replace(/"/g, '');
    // Uniquement sur la dénomination (champ indexé et fiable)
    searchParts.push(`(denominationUniteLegale:"${escaped}" OR nomUniteLegale:"${escaped}")`);
  }

  // Code commune (obligatoire pour chargement en masse)
  if (params.codeCommune) {
    // Pour le chargement par commune : UNIQUEMENT code commune + état actif
    // PAS de recherche textuelle
    searchParts.push(`codeCommuneEtablissement:${params.codeCommune}`);
  } else if (params.codePostal) {
    searchParts.push(`codePostalEtablissement:${params.codePostal}`);
  }

  // Établissements actifs uniquement
  searchParts.push('periode(etatAdministratifEtablissement:A)');

  const query = searchParts.join(' AND ');
  const nombre = params.limit || 20;
  const debut = params.debut || 0;

  // TOUJOURS utiliser l'endpoint de recherche multicritère
  const url = `https://api.insee.fr/api-sirene/3.11/siret?q=${encodeURIComponent(query)}&nombre=${nombre}&debut=${debut}`;

  const headers = {
    'X-INSEE-Api-Key-Integration': INSEE_API_KEY,
    'Accept': 'application/json',
  };

  const timestamp = new Date().toISOString();
  console.log(`\n📡 [${timestamp}] SIRENE API Call`);
  console.log('   Query:', query);
  console.log('   Params:', JSON.stringify({ codeCommune: params.codeCommune, limit: nombre, debut }));
  console.log('   URL:', url);

  const response = await fetch(url, { headers });

  console.log('📥 SIRENE API Response Status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ SIRENE API Error Response:');
    console.error('   Status:', response.status);
    console.error('   Status Text:', response.statusText);
    console.error('   Body:', errorText);
    console.error('   Query was:', query);
    console.error('   Full URL:', url);

    if (response.status === 401) {
      throw new Error('Authentication failed: Invalid INSEE API Key');
    } else if (response.status === 404) {
      throw new Error('Resource not found: No matching establishments');
    } else if (response.status === 429) {
      throw new Error('Rate limit exceeded: Too many requests to INSEE API');
    } else if (response.status === 400) {
      throw new Error(`Bad Request: La requête SIRENE est invalide. Query: "${query}". Détails: ${errorText}`);
    } else {
      throw new Error(`SIRENE API error (${response.status}): ${response.statusText}`);
    }
  }

  const data = await response.json();

  // Sécurisation de l'accès aux données
  const etablissements = data.etablissements ?? [];
  const total = data.header?.total ?? etablissements.length;

  if (etablissements.length === 0) {
    console.log('⚠️ No etablissements found in response');
    return { etablissements: [], total: 0 };
  }

  console.log(`✅ Found ${etablissements.length} etablissements (${total} total)`);

  let mappedEtablissements = etablissements.map((etab: any) => {
    const lambertX = etab.adresseEtablissement?.coordonneeLambertAbscisseEtablissement;
    const lambertY = etab.adresseEtablissement?.coordonneeLambertOrdonneeEtablissement;

    return {
      siren: etab.siren,
      siret: etab.siret,
      denominationUniteLegale: etab.uniteLegale?.denominationUniteLegale,
      nomUniteLegale: etab.uniteLegale?.nomUniteLegale,
      prenomUniteLegale: etab.uniteLegale?.prenomUniteLegale,
      activitePrincipaleUniteLegale: etab.uniteLegale?.activitePrincipaleUniteLegale,
      etatAdministratifUniteLegale: etab.uniteLegale?.etatAdministratifUniteLegale,
      nomenclatureActivitePrincipaleUniteLegale: etab.uniteLegale?.nomenclatureActivitePrincipaleUniteLegale,
      numeroVoieEtablissement: etab.adresseEtablissement?.numeroVoieEtablissement,
      indiceRepetitionEtablissement: etab.adresseEtablissement?.indiceRepetitionEtablissement,
      typeVoieEtablissement: etab.adresseEtablissement?.typeVoieEtablissement,
      libelleVoieEtablissement: etab.adresseEtablissement?.libelleVoieEtablissement,
      codePostalEtablissement: etab.adresseEtablissement?.codePostalEtablissement,
      libelleCommuneEtablissement: etab.adresseEtablissement?.libelleCommuneEtablissement,
      codeCommuneEtablissement: etab.adresseEtablissement?.codeCommuneEtablissement,
      activitePrincipaleEtablissement: etab.periodesEtablissement?.[0]?.activitePrincipaleEtablissement,
      etatAdministratifEtablissement: etab.periodesEtablissement?.[0]?.etatAdministratifEtablissement,
      trancheEffectifsEtablissement: etab.periodesEtablissement?.[0]?.trancheEffectifsEtablissement,
      dateCreationEtablissement: etab.periodesEtablissement?.[0]?.dateCreationEtablissement,
      geo_adresse: etab.adresseEtablissement?.geo_adresse,
      geo_score: etab.adresseEtablissement?.geo_score,
      coordonneeLambertAbscisse: lambertX,
      coordonneeLambertOrdonnee: lambertY,
    };
  });

  // Filtrage NAF applicatif
  if (params.codeNAF) {
    const cleanNAF = params.codeNAF.replace('.', '').substring(0, 2);
    console.log(`🔍 Filtering by NAF code: ${cleanNAF}`);

    mappedEtablissements = mappedEtablissements.filter((etab: SireneEtablissement) => {
      return etab.activitePrincipaleEtablissement?.startsWith(cleanNAF);
    });

    console.log(`✅ After NAF filtering: ${mappedEtablissements.length} etablissements`);
  }

  return { etablissements: mappedEtablissements, total };
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

    // Valider la présence de l'API Key
    validateApiKey();

    // Parser les paramètres de recherche
    const params: SireneSearchParams = await req.json();

    console.log('SIRENE search params:', params);

    // Effectuer la recherche
    const { etablissements, total } = await searchSirene(params);

    console.log(`Found ${etablissements.length} results (${total} total)`);

    return new Response(
      JSON.stringify({
        success: true,
        count: etablissements.length,
        total: total,
        results: etablissements,
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
