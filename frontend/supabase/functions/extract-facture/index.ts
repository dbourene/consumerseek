import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Configuration
const PYTHON_SERVICE_URL = Deno.env.get('PYTHON_SERVICE_URL') || 'http://localhost:8000';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body
    const { factureId, supplierHint } = await req.json();

    if (!factureId) {
      throw new Error('factureId is required');
    }

    // Get facture from database to get file info
    const { data: facture, error: factureError } = await supabase
      .from('factures')
      .select('id, fichier_path, bucket_id, fichier_nom, fournisseur')
      .eq('id', factureId)
      .single();

    if (factureError || !facture) {
      throw new Error(`Facture not found: ${factureError?.message}`);
    }

    // Generate signed URL for the file
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from(facture.bucket_id)
      .createSignedUrl(facture.fichier_path, 300); // 5 minutes expiry

    if (urlError || !signedUrlData) {
      throw new Error(`Failed to get file URL: ${urlError?.message}`);
    }

    // Call Python extraction service
    const extractionResponse = await fetch(`${PYTHON_SERVICE_URL}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        facture_id: factureId,
        file_url: signedUrlData.signedUrl,
        supplier_hint: supplierHint || facture.fournisseur,
      }),
    });

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      throw new Error(`Extraction service error: ${errorText}`);
    }

    const extractionResult = await extractionResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        ...extractionResult
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );

  } catch (error) {
    console.error('Error in extract-facture function:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    );
  }
});
