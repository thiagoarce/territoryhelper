-- T31 (A22-aprovação): nem todo publicador é aprovado pro testemunho
-- público. Fica em profiles (quem concede é o admin, RLS de profiles já
-- é admin-managed) — tp_preferencias é do próprio publicador, não serve.

alter table profiles add column if not exists tp_aprovado boolean not null default false;
