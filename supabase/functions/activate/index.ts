// Licencia Pro desde la app: activar, comprobar y liberar un equipo.
//
// Cuerpo: { key, device, label?, action? }
//   - device: identificador aleatorio (UUID) de esta instalación de la app.
//   - action: 'activate' (por defecto), 'check' (comprobación periódica) o 'release' (quitar la licencia de este equipo).
//
// Cada clave puede estar activa en LICENSE_MAX_DEVICES equipos (2 por defecto). Un equipo ya registrado
// siempre entra; uno nuevo solo si queda hueco. 'check' hace lo mismo que 'activate', para que las
// instalaciones activadas antes de existir este límite se registren solas en su primera comprobación.
// Un equipo que lleva más de STALE_DAYS días sin comprobar la licencia libera su hueco.
//
// Respuestas con «invalid: true» son definitivas (clave revocada, inexistente o sin hueco): la app quita Pro.
// Cualquier otro fallo (red, 500) no debe quitar Pro.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json, normalizeKey, maskEmail } from '../_shared/common.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const MAX_DEVICES = Math.max(1, Number(Deno.env.get('LICENSE_MAX_DEVICES') ?? 2) || 2);
const STALE_DAYS = 45;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const k = normalizeKey(body.key);
    const action = ['check', 'release'].includes(body.action) ? body.action : 'activate';
    const device = typeof body.device === 'string' && UUID.test(body.device) ? body.device.toLowerCase() : null;
    const label = typeof body.label === 'string' ? body.label.slice(0, 60) : null;

    if (!/^NPRJ-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k)) return json({ ok: false, invalid: true, error: 'La clave no tiene el formato correcto' }, 400);
    const { data: lic, error: licErr } = await db.from('licenses').select('id,email,revoked,activations,livemode').eq('license_key', k).maybeSingle();
    if (licErr) throw licErr; // un fallo de la base de datos no debe quitar Pro a nadie
    if (!lic || lic.revoked) return json({ ok: false, invalid: true, error: 'No encontramos esa clave' }, 404);
    const ok = () => json({ ok: true, key: k, email: maskEmail(lic.email), test: !lic.livemode, maxDevices: MAX_DEVICES });

    // Versiones antiguas de la app, que no envían identificador de equipo: se comportan como antes.
    if (!device) {
      if (action === 'release') return json({ ok: true });
      await db.from('licenses').update({ activations: (lic.activations ?? 0) + 1, last_activated_at: new Date().toISOString() }).eq('id', lic.id);
      return ok();
    }

    if (action === 'release') {
      await db.from('license_devices').delete().eq('license_id', lic.id).eq('device_id', device);
      return json({ ok: true });
    }

    const now = new Date().toISOString();
    const { data: known, error: knownErr } = await db.from('license_devices').select('id').eq('license_id', lic.id).eq('device_id', device).maybeSingle();
    if (knownErr) throw knownErr;
    if (known) {
      await db.from('license_devices').update({ last_seen_at: now, ...(label ? { label } : {}) }).eq('id', known.id);
      return ok();
    }

    // Equipos que no se han comprobado en STALE_DAYS días (la app comprueba cada semana) dejan su hueco libre:
    // así, si alguien borra los datos del navegador o cambia de ordenador, no se queda bloqueado para siempre.
    await db.from('license_devices').delete().eq('license_id', lic.id).lt('last_seen_at', new Date(Date.now() - STALE_DAYS * 86400e3).toISOString());
    const { count, error: countErr } = await db.from('license_devices').select('id', { count: 'exact', head: true }).eq('license_id', lic.id);
    if (countErr) throw countErr;
    if ((count ?? 0) >= MAX_DEVICES) {
      return json({
        ok: false, invalid: true, limit: true, maxDevices: MAX_DEVICES,
        error: `Esta clave ya está activada en ${MAX_DEVICES} equipos, el máximo de una licencia. Quítala de alguno (Ajustes → nprojects Pro) o escríbenos a nprojects@nprojects.app.`,
      }, 409);
    }

    const { error } = await db.from('license_devices').insert({ license_id: lic.id, device_id: device, label });
    if (error && error.code !== '23505') throw error; // 23505: otra petición lo registró a la vez
    await db.from('licenses').update({ activations: (lic.activations ?? 0) + 1, last_activated_at: now }).eq('id', lic.id);
    return ok();
  } catch (e) {
    console.error('activate', e);
    return json({ ok: false, error: 'No hemos podido comprobar la clave. Inténtalo de nuevo.' }, 500);
  }
});
