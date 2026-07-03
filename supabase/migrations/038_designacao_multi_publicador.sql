-- ============================================================================
-- 038_designacao_multi_publicador.sql — pode_editar_local v6: a designação
-- multi-publicador (designacao_publicadores) grava participantes desde a
-- migration 001, mas só o LÍDER (designacoes.publicador_id) conseguia
-- trabalhar de fato — RLS só checava publicador_id, não a junção. Um
-- publicador adicionado como participante numa dupla/trio tomava 403.
-- ============================================================================

create or replace function pode_editar_local(p_local_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    is_admin()
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('admin','dirigente')
    )
    or exists (
      -- designação pessoal cobrindo a quadra do local — líder OU participante
      select 1
      from locais l
      join designacao_quadras dq on dq.quadra_id = l.quadra_id
      join designacoes d on d.id = dq.designacao_id
      where l.id = p_local_id
        and d.status = 'aberta'
        and (
          d.publicador_id = auth.uid()
          or exists (
            select 1 from designacao_publicadores dp
            where dp.designacao_id = d.id and dp.publicador_id = auth.uid()
          )
        )
    )
    or exists (
      -- designação de cartas (prédio designado direto) — líder OU participante
      select 1
      from designacao_locais dl
      join designacoes d on d.id = dl.designacao_id
      where dl.local_id = p_local_id
        and d.status = 'aberta'
        and (
          d.publicador_id = auth.uid()
          or exists (
            select 1 from designacao_publicadores dp
            where dp.designacao_id = d.id and dp.publicador_id = auth.uid()
          )
        )
    )
    or exists (
      -- parte de arranjo ativa que me inclui (quadra do local OU o próprio local)
      select 1
      from arranjo_partes pt
      join arranjos a on a.id = pt.arranjo_id
      join locais l on l.id = p_local_id
      where auth.uid() = any(pt.publicadores)
        and a.ativo = true
        and (a.data is null or a.data >= current_date - 1)
        and (l.quadra_id = any(pt.quadras_ids) or pt.locais_ids @> array[p_local_id])
    )
    or exists (
      -- prédio dentro de arranjo de cartas ativo (saída de grupo)
      select 1
      from arranjos a
      where a.ativo = true
        and a.cartas_locais_ids @> array[p_local_id]
    );
$$;
