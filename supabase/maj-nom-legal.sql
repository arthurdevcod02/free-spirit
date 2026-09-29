-- Ajoute le champ « nom légal du vendeur » aux réglages de la boutique.
alter table public.settings
  add column if not exists "legalName" text not null default '';
