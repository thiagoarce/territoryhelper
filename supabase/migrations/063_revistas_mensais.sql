-- T17 (A12b): revistas mensais (A Sentinela / Despertai!) — tipo
-- especial de publicação com necessidade recorrente por variante
-- (público × edição de estudo, essa com letras grandes opcional).
-- Publicações mensais NÃO entram no catálogo de pedido especial
-- avulso (isso é feito em código: filtra periodicidade is null).

alter table publicacoes add column if not exists periodicidade text null check (periodicidade in ('mensal'));

-- Marca as 2 revistas já semeadas na migration 052 (Despertai!/A Sentinela).
update publicacoes set periodicidade = 'mensal' where codigo in ('g', 'wp') and periodicidade is null;

alter table publicador_necessidade_regular add column if not exists variante text not null default 'publico'
  check (variante in ('publico', 'estudo'));
alter table publicador_necessidade_regular add column if not exists letras_grandes boolean not null default false;

-- Unicidade agora é por (publicador, publicação, variante) — o publicador
-- pode ter uma linha "público" e outra "estudo" da mesma revista.
alter table publicador_necessidade_regular drop constraint if exists publicador_necessidade_regular_publicador_id_publicacao_id_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'publicador_necessidade_regular_unq'
  ) then
    alter table publicador_necessidade_regular
      add constraint publicador_necessidade_regular_unq unique (publicador_id, publicacao_id, variante);
  end if;
end $$;
