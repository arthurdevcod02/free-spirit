-- ============================================================
--  FREE SPIRIT — Base de données Supabase
--  Fichier unique : tables + sécurité (RLS) + stockage + démo
--
--  MODE D'EMPLOI
--    1. Supabase > SQL Editor (menu de gauche) > New query
--    2. Colle TOUT ce fichier
--    3. Clique sur RUN
--    Tu dois voir un petit tableau avec le nombre de lignes
--    de chaque table.
--
--  Ce fichier peut être relancé plusieurs fois sans rien
--  casser : il ne crée pas de doublon et n'écrase jamais
--  ce que tu as déjà modifié.
-- ============================================================


-- ============================================================
--  1. TABLES
-- ============================================================

create table if not exists public.products (
  id          text primary key,
  name        text not null,
  category    text not null default 'tshirts',
  price       integer not null check (price >= 0),
  "oldPrice"  integer check ("oldPrice" is null or "oldPrice" >= 0),
  image       text not null default '',
  sizes       text[] not null default '{}',
  "desc"      text not null default '',
  stock       jsonb,                              -- quantités par taille
  "createdAt" timestamptz not null default now()
);

create table if not exists public.promos (
  id          text primary key,
  code        text not null,
  type        text not null check (type in ('percent', 'fixed')),
  value       double precision not null check (value > 0),
  active      boolean not null default true,
  "createdAt" timestamptz not null default now()
);

-- Deux codes ne peuvent pas être identiques, même écrits différemment
-- (BIENVENUE et bienvenue comptent comme le même code).
create unique index if not exists promos_code_unique on public.promos (upper(code));

-- Les commandes viennent de visiteurs anonymes : on borne ce qu'ils
-- peuvent écrire, pour qu'un robot ne puisse pas saturer la table.
create table if not exists public.orders (
  id          text primary key check (char_length(id) <= 40),
  "date"      timestamptz not null default now(),
  items       jsonb not null default '[]'::jsonb,
  subtotal    integer not null default 0 check (subtotal >= 0),
  discount    integer not null default 0 check (discount >= 0),
  "promoCode" text check ("promoCode" is null or char_length("promoCode") <= 32),
  total       integer not null default 0 check (total >= 0),
  customer    text not null check (char_length(customer) between 1 and 120),
  whatsapp    text not null default '' check (char_length(whatsapp) <= 40)
);

create table if not exists public.reviews (
  id          text primary key check (char_length(id) <= 40),
  "productId" text not null references public.products (id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  author      text not null check (char_length(author) between 1 and 80),
  comment     text not null default '' check (char_length(comment) <= 1200),
  "date"      timestamptz not null default now(),
  status      text not null default 'pending' check (status in ('pending', 'approved')),
  verified    boolean not null default false
);

create table if not exists public.reels (
  id          text primary key,
  title       text not null default '',
  video       text not null default '',
  poster      text not null default '',
  link        text not null default '',
  "linkLabel" text not null default '',
  "createdAt" timestamptz not null default now()
);

-- Une seule ligne possible : les coordonnées de la boutique.
create table if not exists public.settings (
  id          integer primary key default 1 check (id = 1),
  whatsapp    text not null default '',
  phone       text not null default '',
  email       text not null default '',
  address     text not null default '',
  "legalName" text not null default '',
  "mapsUrl"   text not null default '',
  "waProfile" text not null default '',
  tiktok      text not null default '',
  instagram   text not null default '',
  facebook    text not null default '',
  "updatedAt" timestamptz not null default now()
);


-- ============================================================
--  2. SÉCURITÉ (Row Level Security)
--
--  Deux identités possibles :
--    anon          = un visiteur du site, non connecté
--    authenticated = ton compte administrateur
--
--  Aucune table n'est ouverte par défaut : RLS activé partout,
--  et la clé publique « anon » ne donne accès qu'à ce qui est
--  explicitement autorisé ci-dessous.
-- ============================================================

alter table public.products enable row level security;
alter table public.promos   enable row level security;
alter table public.orders   enable row level security;
alter table public.reviews  enable row level security;
alter table public.reels    enable row level security;
alter table public.settings enable row level security;

-- ---- Catalogue : tout le monde lit, toi seul écris ----
drop policy if exists "produits_lecture_publique" on public.products;
create policy "produits_lecture_publique" on public.products
  for select to anon, authenticated using (true);

drop policy if exists "produits_gestion_admin" on public.products;
create policy "produits_gestion_admin" on public.products
  for all to authenticated using (true) with check (true);

-- ---- Codes promo : tout le monde lit (le panier doit pouvoir
--      les vérifier), toi seul écris ----
drop policy if exists "promos_lecture_publique" on public.promos;
create policy "promos_lecture_publique" on public.promos
  for select to anon, authenticated using (true);

drop policy if exists "promos_gestion_admin" on public.promos;
create policy "promos_gestion_admin" on public.promos
  for all to authenticated using (true) with check (true);

-- ---- Coordonnées boutique : tout le monde lit, toi seul écris ----
drop policy if exists "settings_lecture_publique" on public.settings;
create policy "settings_lecture_publique" on public.settings
  for select to anon, authenticated using (true);

drop policy if exists "settings_gestion_admin" on public.settings;
create policy "settings_gestion_admin" on public.settings
  for all to authenticated using (true) with check (true);

-- ---- Vidéos 9:16 : tout le monde lit, toi seul écris ----
drop policy if exists "reels_lecture_publique" on public.reels;
create policy "reels_lecture_publique" on public.reels
  for select to anon, authenticated using (true);

drop policy if exists "reels_gestion_admin" on public.reels;
create policy "reels_gestion_admin" on public.reels
  for all to authenticated using (true) with check (true);

-- ---- Avis clients : un visiteur ne voit que les avis que tu as
--      approuvés, et ne peut jamais publier le sien tout seul ----
drop policy if exists "avis_lecture_publique" on public.reviews;
create policy "avis_lecture_publique" on public.reviews
  for select to anon using (status = 'approved');

drop policy if exists "avis_insertion_visiteur" on public.reviews;
create policy "avis_insertion_visiteur" on public.reviews
  for insert to anon with check (status = 'pending' and verified = false);

drop policy if exists "avis_gestion_admin" on public.reviews;
create policy "avis_gestion_admin" on public.reviews
  for all to authenticated using (true) with check (true);

-- ---- Commandes : un visiteur peut en déposer une, mais personne
--      ne peut lire celles des autres. Toi seul y as accès. ----
drop policy if exists "commandes_insertion_visiteur" on public.orders;
create policy "commandes_insertion_visiteur" on public.orders
  for insert to anon, authenticated with check (true);

drop policy if exists "commandes_gestion_admin" on public.orders;
create policy "commandes_gestion_admin" on public.orders
  for all to authenticated using (true) with check (true);


-- ============================================================
--  3. STOCKAGE DES IMAGES
--  Un dossier « media » public en lecture, où toi seul peux
--  déposer des fichiers (photos produits, visuels de couverture).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "media_lecture_publique" on storage.objects;
create policy "media_lecture_publique" on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');

drop policy if exists "media_gestion_admin" on storage.objects;
create policy "media_gestion_admin" on storage.objects
  for all to authenticated
  using (bucket_id = 'media') with check (bucket_id = 'media');


-- ============================================================
--  4. VÉRIFICATION — ce que tu dois voir après RUN
-- ============================================================

select 'products' as nom, count(*) as lignes from public.products
union all select 'promos',   count(*) from public.promos
union all select 'orders',   count(*) from public.orders
union all select 'reviews',  count(*) from public.reviews
union all select 'reels',    count(*) from public.reels
union all select 'settings', count(*) from public.settings
order by nom;
