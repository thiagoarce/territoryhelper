create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(), email text not null, nome text not null,
  role public.role_usuario not null default 'publicador', token uuid not null default gen_random_uuid() unique,
  publicador_id uuid references public.profiles(id) on delete cascade,
  criado_por uuid references public.profiles(id) on delete set null,
  expira_em timestamptz not null default (now() + interval '14 days'), usado_em timestamptz,
  usado_por uuid references public.profiles(id) on delete set null, criado_em timestamptz not null default now()
);

create table if not exists public.designacoes (
  id bigserial primary key, publicador_id uuid references public.profiles(id) on delete set null,
  tipo text not null default 'pessoal' check (tipo in ('pessoal', 'cartas')),
  criada_em timestamptz not null default now(), prazo date,
  status text not null default 'aberta' check (status in ('aberta', 'concluida', 'cancelada')),
  notas text, criado_por uuid references public.profiles(id) on delete set null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.designacao_quadras (
  designacao_id bigint not null references public.designacoes(id) on delete cascade,
  quadra_id text not null references public.quadras(id) on delete cascade,
  primary key (designacao_id, quadra_id)
);
create table if not exists public.designacao_publicadores (
  designacao_id bigint not null references public.designacoes(id) on delete cascade,
  publicador_id uuid not null references public.profiles(id) on delete cascade,
  papel text not null default 'participante' check (papel in ('lider', 'participante')),
  adicionado_em timestamptz not null default now(), primary key (designacao_id, publicador_id)
);
create table if not exists public.designacao_locais (
  designacao_id bigint not null references public.designacoes(id) on delete cascade,
  local_id bigint not null references public.locais(id) on delete cascade,
  primary key (designacao_id, local_id)
);

create table if not exists public.tces (
  id text primary key, nome text not null, tipo text not null default 'comercial',
  poly geometry(Polygon, 4326), publicador_id uuid references public.profiles(id) on delete set null,
  prazo date, status text not null default 'aberto', criado_em timestamptz not null default now(),
  data_conclusao date, notas text, atualizado_em timestamptz not null default now()
);
create table if not exists public.tce_unidades (
  tce_id text not null references public.tces(id) on delete cascade,
  unidade_id bigint not null references public.unidades(id) on delete cascade,
  primary key (tce_id, unidade_id)
);
create table if not exists public.designacao_tces (
  designacao_id bigint not null references public.designacoes(id) on delete cascade,
  tce_id text not null references public.tces(id) on delete cascade,
  primary key (designacao_id, tce_id)
);

create table if not exists public.arranjo_modalidades (
  id bigserial primary key, nome text not null,
  tipo_territorio text not null check (tipo_territorio in ('quadras','cartas_lista','arquivo','ponto_tp')),
  default_local text, default_dia_semana int check (default_dia_semana between 0 and 6),
  default_hora time, cor text default '#3b82f6', ativo boolean not null default true,
  ordem int not null default 0, criado_em timestamptz not null default now()
);
create table if not exists public.arranjos (
  id bigserial primary key, modalidade_id bigint references public.arranjo_modalidades(id) on delete restrict,
  nome text, recorrente boolean not null default false, dia_semana int check (dia_semana between 0 and 6),
  data date, hora_inicio time, hora_fim time, local_endereco text,
  local_lat double precision, local_lng double precision,
  dirigente_id uuid references public.profiles(id) on delete set null,
  quadras_ids text[] not null default '{}', cartas_locais_ids bigint[] not null default '{}',
  tces_ids text[] not null default '{}', interessados uuid[] not null default '{}',
  arquivo_url text, arquivo_nome text, notas text, ativo boolean not null default true,
  data_inicio date, data_fim date, criado_em timestamptz not null default now(),
  criado_por uuid references public.profiles(id) on delete set null, atualizado_em timestamptz not null default now()
);
create table if not exists public.arranjo_partes (
  id bigserial primary key, arranjo_id bigint not null references public.arranjos(id) on delete cascade,
  quadras_ids text[] not null default '{}', locais_ids bigint[] not null default '{}',
  tces_ids text[] not null default '{}', publicadores uuid[] not null default '{}',
  notas text, criado_por uuid references public.profiles(id) on delete set null,
  criada_em timestamptz not null default now()
);

create table if not exists public.registros (
  id bigserial primary key, unidade_id bigint not null references public.unidades(id) on delete cascade,
  publicador_id uuid references public.profiles(id) on delete set null,
  tipo text not null, ts timestamptz not null default now(), dados jsonb
);
create table if not exists public.quadras_conclusoes (
  id bigserial primary key, quadra_id text not null references public.quadras(id) on delete cascade,
  data_conclusao date not null, marcado_por uuid references public.profiles(id) on delete set null,
  marcado_em timestamptz not null default now(), hora_informada boolean not null default false
);

create table if not exists public.curadoria_edicoes (
  id bigserial primary key,
  local_id bigint references public.locais(id) on delete set null,
  unidade_id bigint references public.unidades(id) on delete set null,
  publicador_id uuid references public.profiles(id) on delete set null,
  tipo text not null check (tipo in ('edicao','criacao','nao_existe','exclusao')),
  entidade text check (entidade in ('local','unidade')),
  antes jsonb, depois jsonb,
  status text not null default 'pendente' check (status in ('pendente','confirmado','revertido')),
  criado_em timestamptz not null default now(),
  resolvido_por uuid references public.profiles(id) on delete set null, resolvido_em timestamptz
);

create table if not exists public.audit_log (
  id bigserial primary key, tabela text not null, registro_id text not null,
  acao text not null, antes jsonb, depois jsonb,
  autor_id uuid references public.profiles(id) on delete set null, ts timestamptz not null default now()
);

create table if not exists public.cartas_ciclos (
  id bigserial primary key, local_id bigint references public.locais(id) on delete cascade,
  iniciado_em date not null default current_date, criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.campanhas (
  id bigserial primary key, nome text not null, data_inicio date not null, data_alvo date not null,
  meta_semanal integer, ativa boolean not null default false,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create unique index if not exists campanhas_uma_ativa on public.campanhas(ativa) where ativa = true;
do $$ begin
  alter table public.quadras add constraint quadras_reservada_campanha_fk
    foreign key (reservada_campanha_id) references public.campanhas(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists designacoes_publicador_idx on public.designacoes(publicador_id);
create index if not exists designacoes_status_idx on public.designacoes(status);
create index if not exists designacao_quadras_quadra_idx on public.designacao_quadras(quadra_id);
create index if not exists designacao_publicadores_pub_idx on public.designacao_publicadores(publicador_id);
create index if not exists designacao_locais_local_idx on public.designacao_locais(local_id);
create index if not exists designacao_tces_tce_idx on public.designacao_tces(tce_id);
create index if not exists arranjos_data_idx on public.arranjos(data);
create index if not exists arranjo_partes_arranjo_idx on public.arranjo_partes(arranjo_id);
create index if not exists registros_unidade_ts on public.registros(unidade_id, ts desc);
create index if not exists registros_publicador_ts on public.registros(publicador_id, ts desc) where publicador_id is not null;
create index if not exists quadras_conclusoes_quadra_idx on public.quadras_conclusoes(quadra_id, data_conclusao desc);
create index if not exists curadoria_edicoes_status_idx on public.curadoria_edicoes(status, criado_em desc);
create index if not exists audit_log_ts_idx on public.audit_log(ts desc);

drop trigger if exists bump_designacoes on public.designacoes;
create trigger bump_designacoes before update on public.designacoes for each row execute function public.bump_atualizado_em();
drop trigger if exists bump_arranjos on public.arranjos;
create trigger bump_arranjos before update on public.arranjos for each row execute function public.bump_atualizado_em();
drop trigger if exists bump_tces on public.tces;
create trigger bump_tces before update on public.tces for each row execute function public.bump_atualizado_em();
drop trigger if exists bump_campanhas on public.campanhas;
create trigger bump_campanhas before update on public.campanhas for each row execute function public.bump_atualizado_em();
