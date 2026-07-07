-- T16 (A19): ciclo de cartas por PRÉDIO, não mais só global.
-- O ciclo global (migration 056) foi um passo intermediário — na prática
-- cada prédio termina de escrever cartas em momentos bem diferentes; um
-- corte único pra ~mil prédios não faz sentido. Linhas antigas
-- (local_id null) continuam valendo como corte GLOBAL mínimo — o ciclo
-- EFETIVO de um prédio é o mais recente entre o global e o dele
-- (resolvido em código, ver cicloCartasPorLocal em $lib/server/queries.ts).

alter table cartas_ciclos add column if not exists local_id bigint references locais(id) on delete cascade;

create index if not exists cartas_ciclos_local_idx on cartas_ciclos(local_id, id desc);

-- Recria o toggle público considerando o ciclo EFETIVO do prédio do token
-- (antes só olhava o ciclo global).
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
  v_ciclo_global date;
  v_ciclo_local date;
  v_ciclo date;
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

  select iniciado_em into v_ciclo_global from cartas_ciclos where local_id is null order by id desc limit 1;
  select iniciado_em into v_ciclo_local from cartas_ciclos where local_id = v_local_id order by id desc limit 1;
  v_ciclo := greatest(coalesce(v_ciclo_global, 'epoch'::date), coalesce(v_ciclo_local, 'epoch'::date));
  if v_ciclo = 'epoch'::date then v_ciclo := null; end if;

  if p_campo = 'carta_entregue' then
    update unidades set
      carta_entregue = case
        when carta_entregue is null or (v_ciclo is not null and carta_entregue < v_ciclo)
          then current_date
        else null
      end,
      carta_escrita_por = null
      where id = p_unidade_id;
  elsif p_campo = 'desocupado' then
    update unidades set desocupado = not desocupado where id = p_unidade_id;
  elsif p_campo = 'nao_escrever' then
    update unidades set nao_escrever = not nao_escrever where id = p_unidade_id;
  else
    raise exception 'Campo inválido';
  end if;
end;
$$;

revoke execute on function carta_publica_toggle(uuid, bigint, text) from public;
grant execute on function carta_publica_toggle(uuid, bigint, text) to anon, authenticated;
