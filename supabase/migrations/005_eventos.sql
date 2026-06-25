-- ============================================================================
-- 005_eventos.sql — Domínio 4: trilha do que aconteceu
-- registros: append-only de visitas, cartas, undo, etc.
-- ============================================================================

create table registros (
  id bigserial primary key,
  unidade_id bigint not null references unidades(id) on delete cascade,
  publicador_id uuid references profiles(id) on delete set null,
  tipo text not null,                        -- conversou | naoAtendeu | semConversa | carta | carta_undo | interfone | manual | auto | desfeito
  ts timestamptz not null default now(),
  dados jsonb                                -- contexto livre (ex: nota do momento)
);

-- Índices pensados pros patterns mais frequentes:
-- 1. "última visita dessa unidade" → unidade_id + ts DESC
-- 2. "minhas visitas hoje/semana" → publicador_id + ts DESC
create index registros_unidade_ts on registros(unidade_id, ts desc);
create index registros_publicador_ts on registros(publicador_id, ts desc) where publicador_id is not null;
create index registros_tipo_ts on registros(tipo, ts desc);
