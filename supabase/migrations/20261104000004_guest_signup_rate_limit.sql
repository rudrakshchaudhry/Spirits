-- Rate limit for /api/guest. Only a salted hash of the IP is stored, never the IP.
create table public.guest_signups (
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index guest_signups_hash_time on public.guest_signups (ip_hash, created_at);
alter table public.guest_signups enable row level security; -- no policies: service role only
