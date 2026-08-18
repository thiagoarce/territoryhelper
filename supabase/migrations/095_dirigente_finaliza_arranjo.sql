-- 095: dirigente não conseguia FINALIZAR DESIGNAÇÃO nem ASSUMIR
-- DIRIGÊNCIA — as duas ações "funcionavam" sem fazer nada.
--
-- Relato real (WhatsApp do dirigente): "me ajuda a finalizar essas
-- designações, pois não estou conseguindo". A home dele acumulava
-- avisos de saídas de julho e agosto que ele já tinha tentado
-- finalizar várias vezes.
--
-- Causa: a única policy de escrita em `arranjos` é a
-- arranjos_admin_write (025), `for all using (is_admin())`. O
-- `update arranjos set ativo=false` do dirigente NÃO dá erro — a RLS
-- filtra a linha pra fora do UPDATE e o PostgREST responde sucesso com
-- 0 linhas afetadas. A tela mostrava "Designação finalizada" e o card
-- continuava lá. É a MESMA armadilha que a migration 090 corrigiu na
-- conclusão de quadra (ver o anti-padrão no CLAUDE.md).
--
-- Duas ações do app dependem disso:
--   1. Finalizar designação (/publicador/casa-a-casa) → ativo = false
--   2. Assumir dirigência (/publicador/arranjo)       → dirigente_id
--
-- Correção: dirigente ganha UPDATE em `arranjos`, com um trigger de
-- guarda que o limita a essas DUAS colunas — mesmo desenho da 090 pra
-- `quadras`. Sem o trigger, dar UPDATE ao dirigente abriria data,
-- horário, território (quadras_ids), modalidade e tudo mais.

create or replace function arranjos_guard_nao_admin() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  -- service_role / postgres (sem auth.uid()) e admin passam direto:
  -- backup/restore, scripts e o /admin/arranjos continuam livres.
  if auth.uid() is null or is_admin() then
    return new;
  end if;
  -- Diff genérico via jsonb: coluna NOVA no futuro já nasce protegida,
  -- sem precisar lembrar de voltar aqui. `atualizado_em` sai do diff
  -- porque quem mexe nela é o trigger arranjos_touch (025).
  if (to_jsonb(new) - 'ativo' - 'dirigente_id' - 'atualizado_em')
     is distinct from
     (to_jsonb(old) - 'ativo' - 'dirigente_id' - 'atualizado_em') then
    raise exception 'Sem permissão: dirigente só pode finalizar a saída ou assumir a dirigência';
  end if;
  return new;
end;
$$;

drop trigger if exists arranjos_guard_nao_admin on arranjos;
create trigger arranjos_guard_nao_admin
  before update on arranjos
  for each row execute function arranjos_guard_nao_admin();

-- Publicador comum continua de fora: finalizar/assumir é poder de
-- dirigente (as actions já checavam o papel, faltava a RLS).
drop policy if exists arranjos_dirigente_update on arranjos;
create policy arranjos_dirigente_update on arranjos for update to authenticated
  using (is_dirigente_or_admin()) with check (is_dirigente_or_admin());
