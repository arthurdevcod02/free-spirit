/* ============================================================
   FREE SPIRIT — nettoyage des données de test et de démonstration
   ------------------------------------------------------------
   À coller dans Supabase → SQL Editor → Run, APRÈS hardening.sql.

   Le site n'est pas encore publié : tout ce qui se trouve dans ces
   tables vient de nos essais. Ce script les vide.
   Les produits de démonstration ne sont PAS supprimés ici — ils
   seront remplacés un par un par les vrais articles de la marque.
   ============================================================ */

/* Commandes de test (ex. FS-MUM8FMF6). */
delete from public.orders;

/* Avis de test (ex. « Visiteur Test », « Test RLS », « Test RLS 2 »). */
delete from public.reviews;

/* Codes promo de démonstration : WELCOME10, AURA25, STAYREAL.
   Les vraies promos seront créées depuis le tableau de bord. */
delete from public.promos;

/* Vidéos 9:16 de démonstration, le cas échéant. */
delete from public.reels;

/* Contact de démonstration : le numéro +228 93 83 85 93 est fictif et
   l'adresse contact@freespirit.prod n'existe pas. On remet les champs à
   vide ; ils se remplissent dans le tableau de bord → onglet « Boutique ». */
update public.settings
   set whatsapp  = '',
       phone     = '',
       email     = '',
       address   = '',
       "mapsUrl" = '',
       "waProfile" = '',
       tiktok    = '',
       instagram = '',
       facebook  = '',
       "updatedAt" = now()
 where id = 1;

/* Vérification : chaque ligne doit renvoyer 0, sauf products (5). */
select
  (select count(*) from public.products) as produits,
  (select count(*) from public.promos)   as promos,
  (select count(*) from public.orders)   as commandes,
  (select count(*) from public.reviews)  as avis,
  (select count(*) from public.reels)    as videos;
