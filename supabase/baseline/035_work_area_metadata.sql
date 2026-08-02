alter table public.quadras
  add column if not exists tipo_area text not null default 'urban-block',
  add column if not exists finalidade text not null default 'regular-preaching',
  add column if not exists origem_geografica text not null default 'imported',
  add column if not exists revisao_status text not null default 'approved',
  add column if not exists confianca text not null default 'high';

alter table public.quadras drop constraint if exists quadras_tipo_area_valido;
alter table public.quadras add constraint quadras_tipo_area_valido check (
  tipo_area in ('urban-block', 'rural-area', 'route', 'locality', 'condominium', 'isolated-point')
);
alter table public.quadras drop constraint if exists quadras_finalidade_valida;
alter table public.quadras add constraint quadras_finalidade_valida check (
  finalidade in ('regular-preaching', 'language-census')
);
alter table public.quadras drop constraint if exists quadras_origem_geografica_valida;
alter table public.quadras add constraint quadras_origem_geografica_valida check (
  origem_geografica in ('imported', 'osm-generated', 'cnefe-suggested', 'manual')
);
alter table public.quadras drop constraint if exists quadras_revisao_status_valido;
alter table public.quadras add constraint quadras_revisao_status_valido check (
  revisao_status in ('suggested', 'approved')
);
alter table public.quadras drop constraint if exists quadras_confianca_valida;
alter table public.quadras add constraint quadras_confianca_valida check (
  confianca in ('high', 'medium', 'low')
);

create index if not exists quadras_finalidade_revisao_idx
  on public.quadras(finalidade, revisao_status)
  where ativa;
