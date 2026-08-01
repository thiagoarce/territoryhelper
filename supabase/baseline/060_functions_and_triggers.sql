create or replace function public.participa_designacao(p_designacao_id bigint, p_publicador_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.designacoes d
    where d.id = p_designacao_id and d.status = 'aberta'
      and (d.publicador_id = p_publicador_id or exists (
        select 1 from public.designacao_publicadores dp
        where dp.designacao_id = d.id and dp.publicador_id = p_publicador_id
      ))
  );
$$;

create or replace function public.pode_concluir_quadra(p_quadra_id text, p_publicador_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_dirigente_or_admin() or exists (
    select 1 from public.designacao_quadras dq
    join public.designacoes d on d.id = dq.designacao_id
    where dq.quadra_id = p_quadra_id and d.tipo = 'pessoal' and d.status = 'aberta'
      and public.participa_designacao(d.id, p_publicador_id)
  );
$$;

create or replace function public.pode_editar_local(p_local_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_dirigente_or_admin()
    or exists (
      select 1 from public.locais l
      join public.designacao_quadras dq on dq.quadra_id = l.quadra_id
      join public.designacoes d on d.id = dq.designacao_id
      where l.id = p_local_id and public.participa_designacao(d.id, auth.uid())
    )
    or exists (
      select 1 from public.designacao_locais dl
      join public.designacoes d on d.id = dl.designacao_id
      where dl.local_id = p_local_id and public.participa_designacao(d.id, auth.uid())
    )
    or exists (
      select 1 from public.arranjo_partes ap
      join public.arranjos a on a.id = ap.arranjo_id
      join public.locais l on l.id = p_local_id
      where auth.uid() = any(ap.publicadores) and a.ativo
        and (a.data is null or a.data >= current_date - 1)
        and (l.quadra_id = any(ap.quadras_ids) or p_local_id = any(ap.locais_ids))
    );
$$;

create or replace function public.tem_algo_em_casa_a_casa(p_publicador_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.designacoes d
    where d.status = 'aberta' and (
      d.publicador_id = p_publicador_id
      or exists (select 1 from public.designacao_publicadores dp where dp.designacao_id = d.id and dp.publicador_id = p_publicador_id)
    )
  ) or exists (
    select 1 from public.arranjos a
    where a.ativo and a.dirigente_id = p_publicador_id
  ) or exists (
    select 1 from public.arranjo_partes ap
    join public.arranjos a on a.id = ap.arranjo_id
    where a.ativo and p_publicador_id = any(ap.publicadores)
  ) or exists (
    select 1 from public.tces t where t.status = 'aberto' and t.publicador_id = p_publicador_id
  );
$$;

create or replace function public.quadras_guard_nao_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if not public.pode_concluir_quadra(old.id, auth.uid()) then raise exception 'QUADRA_NOT_ASSIGNED'; end if;
  if (to_jsonb(new) - 'data_conclusao' - 'atualizado_em') is distinct from
     (to_jsonb(old) - 'data_conclusao' - 'atualizado_em') then
    raise exception 'QUADRA_STRUCTURAL_CHANGE_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

drop trigger if exists quadras_guard_nao_admin on public.quadras;
create trigger quadras_guard_nao_admin before update on public.quadras
for each row execute function public.quadras_guard_nao_admin();

create or replace function public.guard_locais_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if current_setting('app.permitir_correcao_posicao', true) = 'true' then return new; end if;
  if (new.geo is distinct from old.geo) or (new.quadra_id is distinct from old.quadra_id)
     or (new.logradouro is distinct from old.logradouro) or (new.numero is distinct from old.numero)
     or (new.setor is distinct from old.setor) or (new.quadra_ibge is distinct from old.quadra_ibge)
     or (new.face_ibge is distinct from old.face_ibge) or (new.pendente is distinct from old.pendente)
     or (new.origem is distinct from old.origem) or (new.origem_id is distinct from old.origem_id)
     or (new.origem_raw is distinct from old.origem_raw) or (new.criado_por is distinct from old.criado_por) then
    raise exception 'LOCAL_STRUCTURAL_CHANGE_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

create or replace function public.guard_unidades_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.local_id is distinct from old.local_id or new.legacy_row is distinct from old.legacy_row
     or new.origem is distinct from old.origem or new.origem_id is distinct from old.origem_id
     or new.origem_raw is distinct from old.origem_raw then
    raise exception 'UNIT_STRUCTURAL_CHANGE_NOT_ALLOWED';
  end if;
  if (new.carta_entregue is distinct from old.carta_entregue)
     or (new.carta_escrita is distinct from old.carta_escrita)
     or (new.carta_escrita_por is distinct from old.carta_escrita_por) then
    if not public.pode_editar_local(new.local_id) then raise exception 'LOCAL_NOT_ASSIGNED'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_locais_update on public.locais;
create trigger trg_guard_locais_update before update on public.locais for each row execute function public.guard_locais_update();
drop trigger if exists trg_guard_unidades_update on public.unidades;
create trigger trg_guard_unidades_update before update on public.unidades for each row execute function public.guard_unidades_update();

create or replace function public.registrar_conclusao_quadra(
  p_quadra_id text, p_data date, p_marcado_em timestamptz default null
) returns public.quadras_conclusoes
language plpgsql security definer set search_path = public as $$
declare v_result public.quadras_conclusoes;
begin
  if auth.uid() is null or not public.pode_concluir_quadra(p_quadra_id, auth.uid()) then
    raise exception 'QUADRA_NOT_ASSIGNED';
  end if;
  insert into public.quadras_conclusoes(quadra_id, data_conclusao, marcado_por, marcado_em, hora_informada)
  values (p_quadra_id, p_data, auth.uid(), coalesce(p_marcado_em, now()), p_marcado_em is not null)
  returning * into v_result;
  update public.quadras set data_conclusao = greatest(coalesce(data_conclusao, p_data), p_data)
  where id = p_quadra_id;
  if not found then raise exception 'QUADRA_NOT_FOUND'; end if;
  return v_result;
end;
$$;

create or replace function public.auto_vincular_locais() returns table(vinculados bigint, pendentes bigint)
language plpgsql security definer set search_path = public as $$
declare v_count bigint;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.locais l set quadra_id = q.id
  from public.quadras q
  where l.quadra_id is null and l.geo is not null and q.ativa and ST_Covers(q.poly, l.geo);
  get diagnostics v_count = row_count;
  return query select v_count, count(*)::bigint from public.locais where quadra_id is null;
end;
$$;

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_id text;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_id := coalesce(v_new->>'id', v_old->>'id', '');
  insert into public.audit_log(tabela, registro_id, acao, antes, depois, autor_id)
  values (tg_table_name, v_id, tg_op, v_old, v_new, auth.uid());
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.curadoria_delete_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_snapshot jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    -- A exclusão de um local apaga suas unidades em cascata. Guardamos o
    -- agregado numa única entrada e ignoramos os triggers filhos, para que
    -- a curadoria consiga restaurar a operação inteira sem duplicidade.
    if tg_table_name = 'unidades' and pg_trigger_depth() > 1 then return old; end if;
    if tg_table_name = 'locais' then
      v_snapshot := jsonb_build_object(
        'local', to_jsonb(old),
        'unidades', coalesce((select jsonb_agg(to_jsonb(u) order by u.id)
          from public.unidades u where u.local_id = old.id), '[]'::jsonb)
      );
    else
      v_snapshot := to_jsonb(old);
    end if;
    insert into public.curadoria_edicoes(local_id, unidade_id, publicador_id, tipo, entidade, antes)
    values (
      case when tg_table_name = 'locais' then old.id else old.local_id end,
      case when tg_table_name = 'unidades' then old.id else null end,
      auth.uid(), 'exclusao', case when tg_table_name = 'locais' then 'local' else 'unidade' end,
      v_snapshot
    );
  end if;
  return old;
end;
$$;

drop trigger if exists curadoria_delete_local on public.locais;
create trigger curadoria_delete_local before delete on public.locais for each row execute function public.curadoria_delete_snapshot();
drop trigger if exists curadoria_delete_unidade on public.unidades;
create trigger curadoria_delete_unidade before delete on public.unidades for each row execute function public.curadoria_delete_snapshot();

do $$ declare table_name text; begin
  foreach table_name in array array['territorios','quadras','locais','unidades','designacoes','tces','profiles'] loop
    execute format('drop trigger if exists audit_%I on public.%I', table_name, table_name);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_trigger()', table_name, table_name);
  end loop;
end $$;

revoke execute on function public.participa_designacao(bigint, uuid) from public;
revoke execute on function public.pode_concluir_quadra(text, uuid) from public;
revoke execute on function public.pode_editar_local(bigint) from public;
revoke execute on function public.tem_algo_em_casa_a_casa(uuid) from public;
revoke execute on function public.registrar_conclusao_quadra(text, date, timestamptz) from public;
grant execute on function public.participa_designacao(bigint, uuid), public.pode_concluir_quadra(text, uuid),
  public.pode_editar_local(bigint), public.registrar_conclusao_quadra(text, date, timestamptz) to authenticated;
grant execute on function public.tem_algo_em_casa_a_casa(uuid) to authenticated;
grant execute on function public.auto_vincular_locais() to authenticated;
