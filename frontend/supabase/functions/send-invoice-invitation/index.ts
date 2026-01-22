import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InvitationRequest {
  contactId: string;
  message?: string;
  expirationDays?: number;
  appUrl?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { contactId, message, expirationDays = 30, appUrl }: InvitationRequest = await req.json();

    if (!contactId) {
      return new Response(
        JSON.stringify({ error: "Contact ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/contacts?id=eq.${contactId}`, {
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "apikey": supabaseServiceKey,
        "Content-Type": "application/json",
      },
    });

    const contacts = await supabaseResponse.json();
    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Contact not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const contact = contacts[0];

    const token = crypto.randomUUID();
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + expirationDays);

    const invitationData = {
      contact_id: contactId,
      token: token,
      email_destinataire: contact.contact1_mail1,
      date_expiration: expirationDate.toISOString(),
      message_personnalise: message || null,
      statut: "envoyé",
    };

    const createInvitationResponse = await fetch(`${supabaseUrl}/rest/v1/invitations_factures`, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "apikey": Deno.env.get("SUPABASE_ANON_KEY")!,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(invitationData),
    });

    if (!createInvitationResponse.ok) {
      const error = await createInvitationResponse.text();
      console.error("Error creating invitation:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const invitation = await createInvitationResponse.json();
    const invitationId = Array.isArray(invitation) ? invitation[0].id : invitation.id;

    const baseUrl = appUrl || (new URL(req.url).origin);
    const uploadUrl = `${baseUrl}/upload/${token}`;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
    .button:hover { background: #1d4ed8; }
    .info-box { background: white; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Envoi de vos factures d'énergie</h1>
    </div>
    <div class="content">
      <p>Bonjour ${contact.contact1_prenom} ${contact.contact1_nom},</p>

      <p>Nous avons besoin de vos factures d'électricité pour analyser votre consommation et vous proposer les meilleures solutions d'optimisation.</p>

      ${message ? `<div class="info-box"><strong>Message personnalisé :</strong><br>${message}</div>` : ''}

      <div style="text-align: center;">
        <a href="${uploadUrl}" class="button">📄 Envoyer mes factures</a>
      </div>

      <div class="info-box">
        <strong>Informations importantes :</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Formats acceptés : PDF, Images (JPG, PNG)</li>
          <li>Vous pouvez envoyer plusieurs factures</li>
          <li>Vos données sont sécurisées et confidentielles</li>
          <li>Ce lien expire le ${expirationDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</li>
        </ul>
      </div>

      <p style="color: #6b7280; font-size: 14px;">Si vous ne pouvez pas cliquer sur le bouton, copiez ce lien dans votre navigateur :<br>
      <a href="${uploadUrl}" style="color: #2563eb; word-break: break-all;">${uploadUrl}</a></p>
    </div>
    <div class="footer">
      <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
      <p>Si vous avez des questions, contactez-nous directement.</p>
    </div>
  </div>
</body>
</html>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ConsumerSeek <onboarding@resend.dev>",
        to: [contact.contact1_mail1],
        subject: `Envoi de vos factures d'énergie - ${contact.entreprise}`,
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend API error:", errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          details: errorText
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailData = await emailResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        invitationId: invitationId,
        uploadUrl: uploadUrl,
        emailId: emailData.id,
        expiresAt: expirationDate.toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in send-invoice-invitation:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
