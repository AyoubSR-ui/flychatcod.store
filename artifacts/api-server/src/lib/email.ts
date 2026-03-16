const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || "FlyChat COD <onboarding@resend.dev>";

interface InviteEmailParams {
  to: string;
  storeName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}

export async function sendInviteEmail(params: InviteEmailParams): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not set — invite email NOT sent to", params.to);
    console.log("[Email] Accept URL (for manual testing):", params.acceptUrl);
    return false;
  }

  const roleLabel = params.role === "admin" ? "Admin" : "Agent";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
      <tr><td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:32px 40px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">FlyChat COD</h1>
      </td></tr>
      <tr><td style="padding:40px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">You're invited! / Vous êtes invité(e) !</h2>
        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
          <strong>${params.inviterName}</strong> has invited you to join <strong>${params.storeName}</strong> on FlyChat COD as <strong>${roleLabel}</strong>.
        </p>
        <p style="color:#64748b;font-size:15px;line-height:1.6;margin:0 0 24px;">
          <strong>${params.inviterName}</strong> vous a invité(e) à rejoindre <strong>${params.storeName}</strong> sur FlyChat COD en tant que <strong>${roleLabel}</strong>.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
          <tr><td align="center">
            <a href="${params.acceptUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">
              Accept Invitation / Accepter l'invitation
            </a>
          </td></tr>
        </table>
        <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:0;">
          This link expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.<br>
          Ce lien expire dans 7 jours. Si vous n'attendiez pas cette invitation, ignorez simplement cet email.
        </p>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">© FlyChat COD — SaaS for COD e-commerce sellers</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [params.to],
        subject: `You're invited to ${params.storeName} on FlyChat COD`,
        html,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error("[Email] Resend API error:", resp.status, errBody);
      return false;
    }

    const result = await resp.json();
    console.log("[Email] Invite sent to", params.to, "— Resend ID:", (result as any).id);
    return true;
  } catch (err) {
    console.error("[Email] Failed to send invite:", err);
    return false;
  }
}
