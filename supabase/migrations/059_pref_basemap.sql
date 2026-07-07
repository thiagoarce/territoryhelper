-- T6 (A14): preferência global de estilo de mapa por usuário.
-- Substitui os seletores locais de "Geral" e "Polígonos" (cada tela
-- guardava o próprio basemap em $state, resetando ao trocar de aba).
alter table profiles
  add column if not exists pref_basemap text not null default 'positron'
  check (pref_basemap in ('positron', 'liberty', 'bright'));
