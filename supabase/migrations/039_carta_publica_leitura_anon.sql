-- ============================================================================
-- 039_carta_publica_leitura_anon.sql — Corrige bug real: /cartas/[token]
-- consultava `locais`/`unidades` direto com o client anon, mas essas
-- tabelas só liberam SELECT pra `authenticated` (migration 008). Um
-- visitante DESLOGADO com token válido recebia 404 "Prédio não
-- encontrado" — só não apareceu em testes porque quem testava estava
-- logado. O WRITE (carta_publica_toggle) já era RPC security definer e
-- funcionava; faltava o equivalente pra leitura. Mesmo padrão de
-- territorio_publico (migration 030).
-- ============================================================================

create or replace function carta_publica_dados(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_local_id bigint;
  v_expira timestamptz;
  v_local jsonb;
  v_unidades jsonb;
begin
  select local_id, expira_em into v_local_id, v_expira
    from cartas_tokens where token = p_token;

  if v_local_id is null then
    raise exception 'Token inválido';
  end if;
  if v_expira is not null and v_expira < now() then
    raise exception 'Token expirado';
  end if;

  select to_jsonb(l) - 'geo' into v_local
    from (
      select id, logradouro, numero, nome, tipo_entrada, acesso_caixas,
             acesso_interfones, irmao_mora, nome_irmao, notas
      from locais where id = v_local_id
    ) l;

  if v_local is null then
    raise exception 'Prédio não encontrado';
  end if;

  select coalesce(jsonb_agg(u order by u.ordem nulls last, u.complemento), '[]'::jsonb)
    into v_unidades
    from (
      select id, complemento, carta_entregue, desocupado, nao_escrever, nota, ordem
      from unidades where local_id = v_local_id
    ) u;

  return jsonb_build_object('local', v_local, 'unidades', v_unidades);
end;
$$;

revoke execute on function carta_publica_dados(uuid) from public;
grant execute on function carta_publica_dados(uuid) to anon, authenticated;
