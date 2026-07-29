-- 090: dirigente pode CONCLUIR quadra (bug real: "marcar concluída" no
-- modo campo não fazia nada).
--
-- Diagnóstico: a única policy de escrita em `quadras` é a
-- `quadras_admin_write` (008_rls.sql), `for all ... using (is_admin())`.
-- O `update quadras set data_conclusao=...` do dirigente NÃO dava erro —
-- a RLS simplesmente filtrava a linha pra fora do UPDATE, o PostgREST
-- devolvia sucesso com 0 linhas afetadas e a action respondia "Quadra
-- concluída em ...". Resultado: toast verde e nada mudava no mapa.
-- (`quadras_conclusoes` sempre aceitou o INSERT — qc_insert_auth vale
-- pra qualquer autenticado — então o histórico até registrava, mas a
-- coluna que as telas leem, `quadras.data_conclusao`, não.)
--
-- Isso é ANTERIOR à feature de hora informada: a versão antiga da action
-- fazia o mesmo update direto. A hora não quebrou nada — só herdou.
--
-- Correção: dirigente ganha UPDATE em `quadras`, mas um trigger de
-- guarda limita ele à coluna `data_conclusao` (mesmo padrão da
-- migration 057 pra `locais`: policy larga + trigger que barra as
-- colunas estruturais). Sem o trigger, dar UPDATE ao dirigente abriria
-- poly/territorio_id/ativa/reserva de campanha junto.

-- ---------------------------------------------------------------------
-- Guarda de coluna: não-admin só altera data_conclusao
-- ---------------------------------------------------------------------
-- Diff genérico via jsonb (em vez de listar coluna por coluna): coluna
-- NOVA adicionada no futuro já nasce protegida, sem precisar lembrar de
-- voltar aqui. `atualizado_em` sai do diff porque quem mexe nela é o
-- trigger bump_atualizado_em (BEFORE UPDATE, roda antes deste — "b" < "q"
-- na ordem alfabética de trigger).
create or replace function quadras_guard_nao_admin() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  -- service_role / postgres (sem auth.uid()) e admin passam direto:
  -- backup/restore, scripts de migração e o /admin continuam livres.
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  if (to_jsonb(new) - 'data_conclusao' - 'atualizado_em')
     is distinct from
     (to_jsonb(old) - 'data_conclusao' - 'atualizado_em') then
    raise exception 'Sem permissão: nesta conta só a conclusão da quadra pode ser alterada';
  end if;
  return new;
end;
$$;

drop trigger if exists quadras_guard_nao_admin on quadras;
create trigger quadras_guard_nao_admin
  before update on quadras
  for each row execute function quadras_guard_nao_admin();

-- ---------------------------------------------------------------------
-- Policy: dirigente (e admin) podem dar UPDATE
-- ---------------------------------------------------------------------
-- Publicador comum continua de fora — concluir quadra é poder de
-- dirigente (as actions já checavam role, era só a RLS que faltava).
drop policy if exists quadras_dirigente_conclusao on quadras;
create policy quadras_dirigente_conclusao on quadras for update to authenticated
  using (is_dirigente_or_admin()) with check (is_dirigente_or_admin());

-- ---------------------------------------------------------------------
-- Desfazer conclusão: dirigente precisa apagar a última linha do histórico
-- ---------------------------------------------------------------------
-- Antes só admin apagava (qc_delete_admin), então o "Desfazer" do
-- dirigente apagava nada e deixava histórico e quadra divergentes.
-- INSERT nessa tabela já é livre pra qualquer autenticado desde a 019 —
-- deixar o dirigente remover a própria marcação errada não amplia poder
-- de forma relevante, e o app depende disso pro undo funcionar.
drop policy if exists qc_delete_admin on quadras_conclusoes;
drop policy if exists qc_delete_dirigente on quadras_conclusoes;
create policy qc_delete_dirigente on quadras_conclusoes for delete to authenticated
  using (is_dirigente_or_admin());
