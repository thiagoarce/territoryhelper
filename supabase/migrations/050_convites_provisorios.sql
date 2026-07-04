-- ============================================================================
-- 050_convites_provisorios.sql — convite passa a criar o publicador
-- (auth.users + profiles, via handle_new_user) NA HORA, não só quando a
-- pessoa aceita. Isso permite designar território pra alguém que ainda
-- nem abriu o link do convite — o convite só define a senha de um usuário
-- que já existe (com senha descartável até lá).
-- ============================================================================

alter table convites add column if not exists publicador_id uuid references profiles(id) on delete cascade;
