-- Equipos (navegadores o apps) donde se ha activado cada licencia Pro.
-- Cada instalación de la app genera un identificador aleatorio (device_id) y lo envía al activar.
-- La función «activate» limita cuántos equipos puede tener una misma clave (LICENSE_MAX_DEVICES, 2 por defecto).
create table if not exists public.license_devices (
  id bigint generated always as identity primary key,
  license_id bigint not null references public.licenses(id) on delete cascade,
  device_id uuid not null,
  label text check (label is null or char_length(label) <= 60),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (license_id, device_id)
);
comment on table public.license_devices is 'Equipos donde está activada cada licencia Pro. Solo accesible desde Edge Functions.';

-- Sin políticas: nadie puede leerla ni escribirla con la clave pública, solo las funciones (service role).
alter table public.license_devices enable row level security;
