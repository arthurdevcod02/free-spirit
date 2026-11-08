/* ============================================================
   FREE SPIRIT — liste d'administrateurs et durcissement final
   ------------------------------------------------------------
   À coller dans Supabase → SQL Editor → Run, après schema.sql.

   Ce script :
     1. crée la table public.admins (qui a le droit d'administrer) ;
     2. crée la fonction is_admin(), seule juge des droits d'écriture ;
     3. remplace les règles « tout compte connecté est admin » ;
     4. resserre les règles d'insertion des commandes et des avis ;
     5. inscrit le compte du vendeur dans la liste.

   Il peut être relancé sans créer de doublon. Aucune donnée
   existante n'est supprimée.
   ============================================================ */

/* ---------- 1. Liste des administrateurs ---------- */

create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  note        text not null default '',
  "createdAt" timestamptz not null default now()
);

alter table public.admins enable row level security;

/* Aucune politique : la table n'est lisible et modifiable que par la
   fonction is_admin() (SECURITY DEFINER) et par le service_role.
   Un compte connecté ne peut donc pas s'ajouter lui-même. */
revoke all on table public.admins from anon, authenticated;

/* ---------- 2. Seule autorité : is_admin() ---------- */

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

comment on function public.is_admin() is
  'Vrai si le compte connecté figure dans public.admins. Utilisée par les politiques RLS.';

/* ---------- 3. Catalogue, promos, boutique, vidéos ---------- */

drop policy if exists "produits_gestion_admin" on public.products;
create policy "produits_gestion_admin" on public.products
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "promos_gestion_admin" on public.promos;
create policy "promos_gestion_admin" on public.promos
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings_gestion_admin" on public.settings;
create policy "settings_gestion_admin" on public.settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "reels_gestion_admin" on public.reels;
create policy "reels_gestion_admin" on public.reels
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

/* ---------- 4. Avis et commandes ---------- */

drop policy if exists "avis_gestion_admin" on public.reviews;
create policy "avis_gestion_admin" on public.reviews
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "commandes_gestion_admin" on public.orders;
create policy "commandes_gestion_admin" on public.orders
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

/* Insertion publique : uniquement des commandes cohérentes et bornées. */
drop policy if exists "commandes_insertion_visiteur" on public.orders;
create policy "commandes_insertion_visiteur" on public.orders
  for insert to anon, authenticated
  with check (
    char_length(id) between 4 and 40
    and subtotal >= 0
    and discount >= 0
    and total >= 0
    and discount <= subtotal
    and total = subtotal - discount
    and jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) between 1 and 50
    and char_length(customer) between 1 and 120
    and char_length(coalesce(whatsapp, '')) <= 40
    and ("promoCode" is null or char_length("promoCode") <= 32)
    and "date" > now() - interval '1 day'
    and "date" < now() + interval '1 day'
  );

/* Insertion publique d'un avis : jamais publié, jamais vérifié d'office. */
drop policy if exists "avis_insertion_visiteur" on public.reviews;
create policy "avis_insertion_visiteur" on public.reviews
  for insert to anon
  with check (
    status = 'pending'
    and verified = false
    and rating between 1 and 5
    and char_length(author) between 1 and 80
    and char_length(comment) <= 1200
  );

/* ---------- 5. Images : dépôt réservé aux administrateurs ---------- */

drop policy if exists "media_gestion_admin" on storage.objects;
create policy "media_gestion_admin" on storage.objects
  for all to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

/* ---------- 6. Inscription du compte vendeur ----------
   Remplacez l'adresse ci-dessous si le compte administrateur change. */

insert into public.admins (user_id, note)
select id, 'Compte vendeur Free Spirit'
from auth.users
where lower(email) = lower('marcomiller517@gmail.com')
on conflict (user_id) do nothing;

/* ---------- 7. Vérification ---------- */

select
  (select count(*) from public.admins) as administrateurs,
  (select count(*) from public.orders) as commandes,
  (select count(*) from public.reviews) as avis;
