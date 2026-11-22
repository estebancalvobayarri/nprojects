// Utilidades comunes de las funciones de pago de nprojects
export const SITE = Deno.env.get('SITE_URL') ?? 'https://nprojects.app';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// ¿Se cobra de verdad? Se activa poniendo el secreto STRIPE_MODE=live en Supabase.
export const LIVE = Deno.env.get('STRIPE_MODE') === 'live';

// Llamada a la API de Stripe. Modo prueba: STRIPE_SECRET_KEY (sk_test_…). Modo real: STRIPE_SECRET_KEY_LIVE (sk_live_…).
export async function stripe(path: string, init: { method?: string; body?: URLSearchParams } = {}, live = false) {
  const name = live ? 'STRIPE_SECRET_KEY_LIVE' : 'STRIPE_SECRET_KEY';
  const key = Deno.env.get(name);
  if (!key) throw new Error(`Falta el secreto ${name}`);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Versión de la API que pide Managed Payments (2025-03-31.basil o posterior)
      'Stripe-Version': '2025-03-31.basil',
    },
    body: init.body,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message ?? `Error de Stripe (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// Claves del tipo NPRJ-ABCD-EFGH-JKLM, sin caracteres que se confunden (0/O, 1/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newLicenseKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `NPRJ-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function normalizeKey(raw: string): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^NPRJ/, '').replace(/(.{4})(?=.)/g, '$1-').replace(/^/, 'NPRJ-');
}

export function maskEmail(email?: string | null): string {
  if (!email) return '';
  const [user, domain] = email.split('@');
  if (!domain) return '';
  return `${user.slice(0, 1)}***@${domain}`;
}

// ---------- Correo (Resend) ----------
export const FROM = 'nprojects <nprojects@nprojects.app>';
export const REPLY_TO = 'nprojects@nprojects.app';

export function escapeHtml(t: string): string {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Plantilla sencilla: logo, contenido y pie con datos del titular
export function emailLayout(inner: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F7F6F3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17171A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E6E3DC;border-radius:16px">
<tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:700"><span style="color:#2F6BFF">&#9679;</span><span style="color:#1F9D55">&#9679;</span><span style="color:#C2410C">&#9679;</span>&nbsp; nprojects</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:16px;line-height:1.6">${inner}</td></tr>
</table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#8A867D;margin:16px auto 0">Enviado por nprojects · <a href="${SITE}/aviso-legal/" style="color:#8A867D">Aviso legal</a> · <a href="${SITE}/privacidad/" style="color:#8A867D">Privacidad</a></p>
</td></tr></table></body></html>`;
}

// Envía un correo con Resend. Si no hay clave configurada, no hace nada y devuelve false.
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) { console.warn('RESEND_API_KEY no configurada: no se envía el correo'); return false; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, ...msg }),
  });
  if (!res.ok) { console.error('Resend', res.status, await res.text()); return false; }
  return true;
}

export function licenseEmail(key: string, test: boolean) {
  const subject = `${test ? '[Prueba] ' : ''}Tu clave de nprojects Pro`;
  const html = emailLayout(`
<h1 style="font-size:22px;margin:0 0 12px">¡Gracias por comprar nprojects Pro!</h1>
<p style="margin:0 0 16px">Esta es tu clave de licencia:</p>
<p style="margin:0 0 20px;padding:14px 16px;background:#F7F6F3;border:1px solid #E6E3DC;border-radius:12px;font-family:Menlo,Consolas,monospace;font-size:20px;font-weight:700;letter-spacing:.04em">${escapeHtml(key)}</p>
<p style="margin:0 0 8px"><strong>Cómo activarla</strong></p>
<ol style="margin:0 0 16px;padding-left:20px"><li>Abre <a href="${SITE}/app/" style="color:#C2410C">nprojects</a>.</li><li>Ve a <em>Ajustes → nprojects Pro</em>.</li><li>Pega la clave y pulsa <em>Activar</em>.</li></ol>
<p style="margin:0 0 16px">Es una licencia personal: puedes activarla en hasta 2 equipos o navegadores tuyos, con Windows o Mac. Guarda este correo por si la necesitas más adelante.</p>
<p style="margin:0">Si tienes cualquier duda, responde a este correo.</p>`);
  const text = `¡Gracias por comprar nprojects Pro!

Tu clave de licencia: ${key}

Cómo activarla:
1. Abre nprojects: ${SITE}/app/
2. Ve a Ajustes → nprojects Pro.
3. Pega la clave y pulsa Activar.

Es una licencia personal: puedes activarla en hasta 2 equipos o navegadores tuyos.

Guarda este correo por si la necesitas más adelante. Si tienes cualquier duda, responde a este correo.

Enviado por nprojects · Aviso legal: ${SITE}/aviso-legal/`;
  return { subject, html, text };
}

export function welcomeEmail() {
  const subject = 'Ya estás en la lista de nprojects';
  const html = emailLayout(`
<h1 style="font-size:22px;margin:0 0 12px">¡Gracias por apuntarte!</h1>
<p style="margin:0 0 16px">Ya estás en la lista de espera de nprojects, el contador de tiempo para quien lleva varios proyectos a la vez.</p>
<p style="margin:0 0 16px">La beta ya está en marcha y damos acceso por tandas. Te escribiremos cuando sea tu turno, junto con tu <strong>precio de fundador: 19 €, pago único</strong>.</p>
<p style="margin:0 0 16px">Mientras tanto, si tienes ideas o dudas, responde a este correo: lo leemos todo.</p>
<p style="margin:0;font-size:13px;color:#8A867D">Solo te escribiremos sobre nprojects. Si no quieres recibir más correos, responde con la palabra BAJA.</p>`);
  const text = `¡Gracias por apuntarte!

Ya estás en la lista de espera de nprojects, el contador de tiempo para quien lleva varios proyectos a la vez.

La beta ya está en marcha y damos acceso por tandas. Te escribiremos cuando sea tu turno, junto con tu precio de fundador: 19 €, pago único.

Mientras tanto, si tienes ideas o dudas, responde a este correo: lo leemos todo.

Solo te escribiremos sobre nprojects. Si no quieres recibir más correos, responde con la palabra BAJA.

Enviado por nprojects · Aviso legal: ${SITE}/aviso-legal/ · Privacidad: ${SITE}/privacidad/`;
  return { subject, html, text };
}

// ---------- Licencias ----------
// Crea (si no existe) la licencia de una sesión de pago completada y envía la clave por email una sola vez.
// La usan tanto la página de «gracias» como el webhook de Stripe: la que llegue primero la crea.
// deno-lint-ignore no-explicit-any
export async function ensureLicense(db: any, s: any): Promise<{ key: string; email: string | null }> {
  const sessionId = s.id as string;
  let { data: lic } = await db.from('licenses').select('license_key,email,livemode,email_sent_at').eq('stripe_session_id', sessionId).maybeSingle();
  if (!lic) {
    const row = {
      license_key: newLicenseKey(),
      email: s.customer_details?.email ?? null,
      stripe_session_id: sessionId,
      amount_total: s.amount_total ?? null,
      currency: s.currency ?? null,
      livemode: !!s.livemode,
    };
    const { error } = await db.from('licenses').insert(row);
    if (error) {
      // Otra petición la creó a la vez: leer la suya
      const again = await db.from('licenses').select('license_key,email,livemode,email_sent_at').eq('stripe_session_id', sessionId).maybeSingle();
      if (!again.data) throw error;
      lic = again.data;
    } else {
      lic = { ...row, email_sent_at: null };
    }
  }
  // Enviar el email una sola vez: se «reserva» marcando la fecha antes de enviar
  if (lic.email && !lic.email_sent_at) {
    const { data: claimed } = await db.from('licenses').update({ email_sent_at: new Date().toISOString() })
      .eq('stripe_session_id', sessionId).is('email_sent_at', null).select('id').maybeSingle();
    if (claimed) {
      const sent = await sendEmail({ to: lic.email, ...licenseEmail(lic.license_key, !lic.livemode) }).catch(() => false);
      if (!sent) await db.from('licenses').update({ email_sent_at: null }).eq('stripe_session_id', sessionId);
    }
  }
  return { key: lic.license_key, email: lic.email };
}

// Comprueba la firma de un webhook de Stripe (cabecera Stripe-Signature) con el secreto whsec_…
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300): Promise<boolean> {
  if (!header) return false;
  const t = Number(header.split(',').find((p) => p.startsWith('t='))?.slice(2));
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((sig) => sig.length === expected.length && timingSafeEqual(sig, expected));
}
function timingSafeEqual(a: string, b: string): boolean {
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
