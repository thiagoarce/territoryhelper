-- 081: RPC leve pra decidir se a aba "Casa a casa" tem ALGUMA coisa pra
-- mostrar (arranjo que dirige, parte de arranjo, território pessoal ou
-- TCE pessoal) — usada no layout raiz (roda em toda navegação) pra
-- esconder o ícone da bottom nav quando não há nada, mesmo padrão já
-- usado pro ícone do TP (profiles.tp_aprovado). Só EXISTS — sem trazer
-- linha nenhuma, CPU desprezível mesmo rodando a cada navegação.
--
-- security invoker (padrão, sem definer): as 5 tabelas envolvidas já são
-- lidas com RLS pelo próprio publicador na tela de Casa a casa
-- (client-side) — essa função só espelha o mesmo acesso.
create or replace function tem_algo_em_casa_a_casa(p_publicador_id uuid)
returns boolean
language sql stable
as $$
  select
    exists (
      select 1 from arranjos
      where dirigente_id = p_publicador_id and ativo = true
    )
    or exists (
      select 1 from arranjo_partes ap
      join arranjos a on a.id = ap.arranjo_id
      where p_publicador_id = any(ap.publicadores) and a.ativo = true
    )
    or exists (
      select 1 from designacoes d
      join designacao_quadras dq on dq.designacao_id = d.id
      where d.publicador_id = p_publicador_id and d.status = 'aberta' and d.tipo != 'cartas'
    )
    or exists (
      select 1 from designacoes d
      join designacao_tces dt on dt.designacao_id = d.id
      where d.publicador_id = p_publicador_id and d.status = 'aberta' and d.tipo != 'cartas'
    );
$$;
