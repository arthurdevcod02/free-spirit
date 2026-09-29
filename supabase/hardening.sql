/* ============================================================
   FREE SPIRIT — durcissement des règles de sécurité (RLS)
   ------------------------------------------------------------
   À coller dans Supabase → SQL Editor → Run.
   Aucune donnée n'est supprimée : ce script remplace seulement
   une règle trop permissive par une règle qui vérifie ce qu'un
   visiteur inconnu a le droit d'écrire.
   ============================================================ */

/* Les commandes étaient ouvertes en insertion sans aucun contrôle :
   n'importe qui pouvait écrire des lignes incohérentes (total négatif,
   remise supérieure au sous-total, panier vide, champs géants).
   On accepte désormais uniquement des commandes mathématiquement
   cohérentes et de taille raisonnable. */
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
    /* Fenêtre large : les téléphones ont souvent une heure décalée,
       et une commande refusée disparaîtrait du tableau de bord. */
    and "date" > now() - interval '1 day'
    and "date" < now() + interval '1 day'
  );

/* Même logique pour les avis : la règle existante imposait déjà le
   statut « en attente », on borne en plus la taille des champs pour
   éviter l'écriture de contenus démesurés. */
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
