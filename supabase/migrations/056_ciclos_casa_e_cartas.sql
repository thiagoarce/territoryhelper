-- 056: CICLOS de trabalho — o estado visual dos botões deixa de ser eterno.
--
-- Casa em casa: o ciclo é POR QUADRA e já existe implicitamente — é a
-- última conclusão (`quadras.data_conclusao`). Desfecho anterior ou igual
-- a essa data pertence ao ciclo que fechou e volta a aparecer "solto" no
-- próximo trabalho (a trilha `registros` continua intacta). Sem schema
-- novo — só leitura.
--
-- Cartas: o ciclo é GLOBAL e bem mais longo (≈mil prédios, demora até
-- escrever pra todos), então é iniciado MANUALMENTE pelo admin — botão
-- "Iniciar novo ciclo" em /admin/predios. Marcas de "carta escrita"
-- anteriores ao ciclo atual aparecem soltas (esmaecidas, com a data
-- antiga), sem apagar nada.

create table if not exists cartas_ciclos (
  id bigserial primary key,
  iniciado_em date not null default current_date,
  iniciado_por uuid references profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);

comment on table cartas_ciclos is
  'Ciclos do trabalho de cartas (append-only; o atual é o de maior id). Marca de carta escrita só "vale" se >= iniciado_em do ciclo atual.';

alter table cartas_ciclos enable row level security;

-- Leitura aberta (a página pública /cartas/<token> roda com anon e
-- precisa saber quando o ciclo começou — é só uma data, sem dado sensível)
drop policy if exists "cartas_ciclos_select" on cartas_ciclos;
create policy "cartas_ciclos_select" on cartas_ciclos
  for select using (true);

-- Só admin inicia ciclo novo
drop policy if exists "cartas_ciclos_insert" on cartas_ciclos;
create policy "cartas_ciclos_insert" on cartas_ciclos
  for insert with check (is_admin());

-- RPC público do link de cartas passa a respeitar o ciclo: marca antiga
-- (de ciclo passado) conta como "não escrita" — o toggle ESCREVE de novo
-- (data de hoje) em vez de desmarcar. Também limpa/define o autor
-- (null no fluxo público, que não tem auth).
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

  select iniciado_em into v_ciclo from cartas_ciclos order by id desc limit 1;

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
