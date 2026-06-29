// netlify/functions/submission-created.js
//
// Fires automatically AFTER any Netlify Form submission (event: submission-created).
// Sends the registrant their report link + PDF via Resend.
//
// GUARD: only sends for the five report gate forms (names ending in "-report-gate").
// Book waitlist, contact form, newsletter, etc. are ignored — they fall straight through.
//
// Requires one environment variable in Netlify:  RESEND_API_KEY
// (Site settings -> Environment variables -> Add -> RESEND_API_KEY = re_xxx)
//
// No npm install needed: uses global fetch (Node 18+ on Netlify).

const FROM = "Serguei Poppeleer <hello@contracks.global>";
const REPLY_TO = "hello@contracks.global";

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    // Netlify wraps the submission; fields live under .payload
    const p = body.payload || {};
    const formName = (p.form_name || "").toLowerCase();
    const data = p.data || {};

    // ---- GUARD: only the report gate forms ----
    if (!formName.endsWith("-report-gate")) {
      return { statusCode: 200, body: "Skipped: not a report gate form (" + formName + ")" };
    }

    const email = (data.email || "").trim();
    const firstname = (data.firstname || "").trim();
    const report = (data.report || "your report").trim();
    const articleUrl = (data.article_url || "").trim();
    const pdfUrl = (data.pdf_url || "").trim();

    if (!email) {
      return { statusCode: 200, body: "Skipped: no email in submission" };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("RESEND_API_KEY is not set");
      return { statusCode: 500, body: "Email service not configured" };
    }

    const hi = firstname ? `Hi ${escapeHtml(firstname)},` : "Hi,";
    const subject = `Your report is ready — ${stripReportPrefix(report)}`;

    const html = buildHtml({ hi, report: stripReportPrefix(report), articleUrl, pdfUrl });
    const text = buildText({ hi, report: stripReportPrefix(report), articleUrl, pdfUrl });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        reply_to: REPLY_TO,
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      console.error("Resend error:", res.status, errTxt);
      return { statusCode: 502, body: "Email send failed" };
    }

    return { statusCode: 200, body: "Report email sent to " + email };
  } catch (err) {
    console.error("Function error:", err);
    return { statusCode: 500, body: "Error" };
  }
};

// --- helpers ---

function stripReportPrefix(r) {
  // "RESOLVE - Beyond Paperwork Governance" -> "Beyond Paperwork Governance"
  const idx = r.indexOf(" - ");
  return idx > -1 ? r.slice(idx + 3) : r;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function buildHtml({ hi, report, articleUrl, pdfUrl }) {
  const NAVY = "#0A1628", GOLD = "#C5A050";
  const readBtn = articleUrl
    ? `<a href="${articleUrl}" style="display:inline-block;background:${GOLD};color:${NAVY};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:13px 26px;border-radius:4px;">Read the full report &rarr;</a>`
    : "";
  const pdfBtn = pdfUrl
    ? `<a href="${pdfUrl}" style="display:inline-block;border:1px solid ${GOLD};color:${GOLD};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:12px 26px;border-radius:4px;">Download the PDF</a>`
    : "";

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F5F4F0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F0;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:${NAVY};padding:28px 36px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${GOLD};">CONTRACKS.GLOBAL</div>
        </td></tr>
        <tr><td style="padding:36px 36px 8px;">
          <p style="font-family:Georgia,serif;font-size:20px;color:${NAVY};margin:0 0 18px;">${report}</p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1A1A1A;margin:0 0 16px;">${hi}</p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1A1A1A;margin:0 0 22px;">Thank you — your report is unlocked and yours to keep. Read it on screen, listen to the narration, or keep the PDF for later.</p>
          <p style="margin:0 0 14px;">${readBtn}</p>
          <p style="margin:0 0 24px;">${pdfBtn}</p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#6B7280;margin:0 0 22px;">The link opens straight to the report — no need to enter your details again.</p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1A1A1A;margin:0 0 22px;">When you're ready to see where your own programme sits, the CONTROL diagnostic takes about ten minutes: <a href="https://contracks.global/control" style="color:${GOLD};">contracks.global/control</a></p>
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#6B7280;margin:0 0 28px;">You'll get occasional field notes on delivery governance — what actually holds on cross-border capital projects. No noise. Unsubscribe anytime.</p>
        </td></tr>
        <tr><td style="background:${NAVY};padding:24px 36px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#ffffff;font-weight:600;margin-bottom:4px;">Serguei Poppeleer</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:rgba(255,255,255,.6);margin-bottom:10px;">Founder &amp; Managing Director, Contracks Global</div>
          <div style="font-family:Georgia,serif;font-style:italic;font-size:13px;color:${GOLD};">The System Travels. The Chaos Does Not.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}

function buildText({ hi, report, articleUrl, pdfUrl }) {
  return [
    report,
    "",
    hi,
    "",
    "Thank you — your report is unlocked and yours to keep. Read it, listen to the narration, or keep the PDF for later.",
    "",
    articleUrl ? "Read the full report: " + articleUrl : "",
    pdfUrl ? "Download the PDF: " + pdfUrl : "",
    "",
    "The link opens straight to the report — no need to enter your details again.",
    "",
    "When you're ready, the CONTROL diagnostic takes about ten minutes: https://contracks.global/control",
    "",
    "You'll get occasional field notes on delivery governance. No noise. Unsubscribe anytime.",
    "",
    "— Serguei Poppeleer",
    "Founder & Managing Director, Contracks Global",
    "The System Travels. The Chaos Does Not.",
  ].filter(Boolean).join("\n");
}
