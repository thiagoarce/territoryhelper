-- ============================================================================
-- 014_link_publico_cartas.sql
-- Permite que arranjo de cartas trabalhe um prédio sem ter login.
-- Tabela cartas_tokens: admin gera link com token, irmão acessa
-- /cartas/<token> e pode marcar entregue/desocupado.
-- ============================================================================

create table if not exists cartas_tokens (
  token uuid primary key default gen_random_uuid(),
  local_id bigint not null references locais(id) on delete cascade,
  criado_em timestamptz not null default now(),
  criado_por uuid references profiles(id) on delete set null,
  expira_em timestamptz,
  qtd_acessos integer not null default 0
);

create index cartas_tokens_local on cartas_tokens(local_id);

-- RLS: admin gerencia, anon pode SELECT pra resolver o token
alter table cartas_tokens enable row level security;

create policy "cartas_tokens_anon_select" on cartas_tokens
  for select to anon, authenticated using (true);

create policy "cartas_tokens_admin_write" on cartas_tokens
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- Função que valida token + atualiza unidade (admin permite via service_role).
-- Usada pelo endpoint /cartas/[token] sem precisar de auth do irmão.
create or replace function carta_publica_toggle(
  p_token uuid,
  p_unidade_id bigint,
  p_campo text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_local_id bigint;
  v_local_da_unidade bigint;
  v_atual text;
  v_novo_valor text;
begin
  -- Valida token
  select local_id into v_local_id from cartas_tokens
    where token = p_token and (expira_em is null or expira_em > now())
    limit 1;
  if v_local_id is null then
    raise exception 'Token inválido ou expirado';
  end if;

  -- Confere que a unidade pertence ao local do token
  select local_id into v_local_da_unidade from unidades where id = p_unidade_id;
  if v_local_da_unidade is null or v_local_da_unidade <> v_local_id then
    raise exception 'Unidade não pertence a este prédio';
  end if;

  if p_campo = 'carta_entregue' then
    update unidades set carta_entregue = case when carta_entregue is null then current_date else null end where id = p_unidade_id;
  elsif p_campo = 'desocupado' then
    update unidades set desocupado = not desocupado where id = p_unidade_id;
  elsif p_campo = 'nao_escrever' then
    update unidades set nao_escrever = not nao_escrever where id = p_unidade_id;
  else
    raise exception 'Campo inválido';
  end if;

  -- incrementa contador de acessos no token (audit leve)
  update cartas_tokens set qtd_acessos = qtd_acessos + 1 where token = p_token;
end;
$$;

revoke execute on function carta_publica_toggle(uuid, bigint, text) from public;
grant execute on function carta_publica_toggle(uuid, bigint, text) to anon, authenticated;
