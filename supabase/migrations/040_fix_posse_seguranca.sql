-- ============================================================================
-- 040_fix_posse_seguranca.sql — pode_editar_local v7: fecha 2 buracos reais
-- achados numa revisão de segurança.
--
-- 1) BURACO DE SEGURANÇA: a cláusula de "prédio dentro de arranjo de cartas
--    ativo" (migration 026/029) exigia `a.dirigente_id = auth.uid() or
--    a.dirigente_id is null` — essa trava foi perdida na reescrita da
--    migration 030 e nunca voltou. Resultado: QUALQUER publicador autenticado
--    conseguia editar unidades/local de QUALQUER prédio que estivesse listado
--    em `cartas_locais_ids` de QUALQUER arranjo ativo no sistema, mesmo sem
--    nenhuma relação com aquele arranjo. Restaurada a trava original.
--
-- 2) O guard `exigirQuadraDesignada` (defesa em profundidade) tinha uma
--    cláusula "quadra em arranjo ativo, qualquer publicador da saída" que
--    NUNCA teve contrapartida na RLS — abria a rota /publicador/quadra/[id]
--    (guard passava) mas a escrita de verdade sempre falhava calada na RLS
--    (retornando sucesso falso pro publicador, sem persistir nada). Em vez
--    de só remover a intenção do produto (qualquer um da saída pode ajudar
--    em qualquer quadra do arranjo, não só na sua parte), demos a ela uma
--    base de dados real: exige ter uma PARTE nesse MESMO arranjo (em
--    qualquer quadra dele), não mais "nenhuma relação".
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
        and (a.recorrente = false or a.data_fim is null or a.data_fim >= current_date)
        and (l.quadra_id = any(pt.quadras_ids) or pt.locais_ids @> array[p_local_id])
    )
    or exists (
      -- quadra dentro de arranjo ativo onde EU tenho parte (em qualquer
      -- quadra dele) — saída de grupo: quem tem parte na saída pode ajudar
      -- em qualquer quadra do arranjo, não só na sua própria parte.
      select 1
      from locais l
      join arranjos a on a.quadras_ids @> array[l.quadra_id]
      join arranjo_partes pt on pt.arranjo_id = a.id
      where l.id = p_local_id
        and a.ativo = true
        and (a.data is null or a.data >= current_date - 1)
        and (a.recorrente = false or a.data_fim is null or a.data_fim >= current_date)
        and auth.uid() = any(pt.publicadores)
    )
    or exists (
      -- prédio dentro de arranjo de cartas ativo — só o DIRIGENTE desse
      -- arranjo (restaura a trava original das migrations 026/029, perdida
      -- na 030). Participante de parte já cai na cláusula acima.
      select 1
      from arranjos a
      where a.ativo = true
        and a.cartas_locais_ids @> array[p_local_id]
        and a.dirigente_id = auth.uid()
    );
$$;

-- ============================================================================
-- 3) tp_escala_insert permitia inscrição em turno já desativado pelo admin
--    (a policy só checava publicador_id, nunca tp_turnos.ativo — a UI
--    filtrava, mas um POST direto ainda passava). Ação já valida isso
--    (src/routes/publicador/arranjo/+page.server.ts::inscreverTurno), RLS
--    acompanha como defesa em profundidade.
-- ============================================================================

drop policy if exists tp_escala_insert on tp_escala;
create policy tp_escala_insert on tp_escala for insert
  with check (
    (publicador_id = auth.uid() or is_admin())
    and exists (select 1 from tp_turnos t where t.id = turno_id and t.ativo = true)
  );
