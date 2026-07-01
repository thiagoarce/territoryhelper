-- ============================================================================
-- 028_locais_pendente.sql — Prédio pendente criado por publicador (Fase 2).
--
-- Publicador em campo pode criar prédio (nome + portaria + qtd) quando não
-- encontra na busca. Fica marcado como pendente=true até admin validar
-- (associar a quadra correta, ajustar geo, marcar pendente=false).
--
-- Idempotente.
-- ============================================================================

alter table locais add column if not exists pendente boolean not null default false;
create index if not exists locais_pendente_idx on locais(pendente) where pendente;

-- Ajusta RLS de INSERT: publicador pode criar local pendente (com quadra_id
-- null ou de suposição). Local NÃO-pendente segue exigindo a mesma regra
-- de escopo (quadra numa designação sua) OU role dirigente/admin.
drop policy if exists locais_insert_scope on locais;
create policy locais_insert_scope on locais
  for insert to authenticated
  with check (
    is_admin()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','dirigente'))
    or (
      quadra_id is not null
      and exists (
        select 1 from designacao_quadras dq
        join designacoes d on d.id = dq.designacao_id
        where dq.quadra_id = locais.quadra_id
          and d.publicador_id = auth.uid()
          and d.status = 'aberta'
      )
    )
    -- Novo: qualquer publicador logado pode criar prédio marcado como pendente
    or (pendente = true and criado_por = auth.uid())
  );

-- Busca por proximidade: retorna N locais mais próximos + distância em metros.
-- Usado por /buscar quando publicador ativa geolocation. Ignora prédios
-- pendentes (não confundir busca com validação).
create or replace function buscar_locais_proximos(
  p_lat float,
  p_lng float,
  p_limite int default 30,
  p_raio_m int default 2000
) returns table (
  id bigint,
  tipo text,
  logradouro text,
  numero text,
  nome text,
  quadra_id text,
  distancia_m float
)
language sql stable security definer set search_path = public
as $$
  select
    l.id, l.tipo, l.logradouro, l.numero, l.nome, l.quadra_id,
    ST_Distance(l.geo::geography, ST_MakePoint(p_lng, p_lat)::geography) as distancia_m
  from locais l
  where l.geo is not null
    and l.pendente = false
    and ST_DWithin(l.geo::geography, ST_MakePoint(p_lng, p_lat)::geography, p_raio_m)
  order by l.geo <-> ST_MakePoint(p_lng, p_lat)::geometry
  limit p_limite;
$$;

grant execute on function buscar_locais_proximos(float, float, int, int) to authenticated;
