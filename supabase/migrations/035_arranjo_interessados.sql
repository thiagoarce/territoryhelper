-- ============================================================================
-- 035_arranjo_interessados.sql — Campanhas v2, incremento C3: inscrição
-- antecipada em arranjo. Publicador sinaliza interesse; dirigente vê a
-- lista ao repartir (não cria parte automaticamente — repartição continua
-- sendo decisão do dirigente).
-- ============================================================================

alter table arranjos add column if not exists interessados uuid[] not null default '{}';

-- RLS de arranjos só permite escrita a admin (025_arranjos.sql) — dirigente
-- nem publicador comum pode dar UPDATE direto. RPC security definer expõe
-- só essa operação pontual: alterna o PRÓPRIO uid, nada além disso.
create or replace function toggle_interesse_arranjo(p_arranjo_id bigint)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  v_atuais uuid[];
  v_novos uuid[];
  v_interessado boolean;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select interessados into v_atuais from arranjos where id = p_arranjo_id for update;
  if not found then
    raise exception 'arranjo não encontrado';
  end if;

  v_interessado := auth.uid() = any(v_atuais);
  if v_interessado then
    v_novos := array_remove(v_atuais, auth.uid());
  else
    v_novos := array_append(coalesce(v_atuais, '{}'), auth.uid());
  end if;

  update arranjos set interessados = v_novos where id = p_arranjo_id;
  return not v_interessado; -- true = ficou interessado, false = removeu
end;
$$;

grant execute on function toggle_interesse_arranjo(bigint) to authenticated;
