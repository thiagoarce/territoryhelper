-- 075: U2 — publicador reporta que a posição de um endereço está errada.
-- Dois casos:
--   (a) pertence à quadra, mas o pino está no lugar errado → só corrige geo.
--   (b) não pertence a esta quadra → move quadra_id (+ setor/quadra_ibge/
--       face_ibge, copiados de um endereço já existente na quadra de
--       destino, senão fica null e cai no fluxo de "sem face IBGE").
--
-- geo/quadra_id/setor/quadra_ibge/face_ibge são colunas ESTRUTURAIS
-- bloqueadas pro não-admin desde a migration 057
-- (guard_locais_update trigger) — decisão do usuário (mesma pergunta
-- de esclarecimento do resto desta rodada): aplica na hora + fica
-- pendente de curadoria, igual o overlay livre já funciona, em vez de
-- exigir aprovação prévia do admin.
--
-- guard_locais_update() já checa is_admin() antes de bloquear; adiciono
-- uma segunda saída via GUC transaction-local
-- (app.permitir_correcao_posicao) que só esta função liga, depois de
-- confirmar posse via pode_editar_local — não abre a trava geral pra
-- mais ninguém, só pra esta chamada específica dentro da mesma
-- transação.

create or replace function reportar_posicao_incorreta(
  p_local_id bigint,
  p_novo_geo jsonb default null,
  p_nova_quadra_id text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_setor text;
  v_quadra_ibge text;
  v_face_ibge text;
  v_geo geometry;
begin
  if not pode_editar_local(p_local_id) then
    raise exception 'Sem posse deste endereço';
  end if;
  if p_novo_geo is null and p_nova_quadra_id is null then
    raise exception 'Nada pra atualizar';
  end if;

  if p_novo_geo is not null then
    v_geo := ST_SetSRID(ST_GeomFromGeoJSON(p_novo_geo::text), 4326);
  end if;

  perform set_config('app.permitir_correcao_posicao', 'true', true);

  if p_nova_quadra_id is not null then
    select setor, quadra_ibge, face_ibge
      into v_setor, v_quadra_ibge, v_face_ibge
    from locais
    where quadra_id = p_nova_quadra_id and setor is not null
    limit 1;

    update locais
    set quadra_id = p_nova_quadra_id,
        setor = v_setor,
        quadra_ibge = v_quadra_ibge,
        face_ibge = v_face_ibge,
        geo = coalesce(v_geo, geo)
    where id = p_local_id;
  else
    update locais set geo = coalesce(v_geo, geo) where id = p_local_id;
  end if;
end;
$$;

revoke execute on function reportar_posicao_incorreta(bigint, jsonb, text) from anon;
grant execute on function reportar_posicao_incorreta(bigint, jsonb, text) to authenticated, service_role;

-- Segunda saída no trigger de guarda (mesma checagem is_admin() já
-- existente, só adiciona a checagem da GUC transaction-local acima).
create or replace function guard_locais_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if is_admin() then return new; end if;
  if current_setting('app.permitir_correcao_posicao', true) = 'true' then return new; end if;
  if (new.geo is distinct from old.geo)
    or (new.quadra_id is distinct from old.quadra_id)
    or (new.logradouro is distinct from old.logradouro)
    or (new.numero is distinct from old.numero)
    or (new.setor is distinct from old.setor)
    or (new.quadra_ibge is distinct from old.quadra_ibge)
    or (new.face_ibge is distinct from old.face_ibge)
    or (new.pendente is distinct from old.pendente)
    or (new.nao_eh_predio is distinct from old.nao_eh_predio)
    or (new.criado_por is distinct from old.criado_por)
  then
    raise exception 'Coluna estrutural do endereço — só admin altera';
  end if;
  return new;
end;
$$;
