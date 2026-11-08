/* ============================================================
   FREE SPIRIT — suppression des articles de démonstration
   ------------------------------------------------------------
   À coller dans Supabase → SQL Editor → Run.

   Supprime uniquement les trois articles fictifs encore en base.
   Ne touche ni aux commandes, ni aux avis, ni aux réglages de la
   boutique (contact, réseaux sociaux), qui sont réels.
   ============================================================ */

delete from public.products
 where id in ('p-aura', 'p-limitless', 'p-overtone');

/* Vérification : produits doit renvoyer 0. */
select
  (select count(*) from public.products) as produits,
  (select count(*) from public.promos)   as promos,
  (select count(*) from public.reels)    as videos;
