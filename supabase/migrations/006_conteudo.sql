-- ============================================================================
-- 006_conteudo.sql — Domínio 5: material editorial
-- campanha: objetivos estruturados por modalidade (casa, comercial, cartas…)
-- ============================================================================

create table campanha (
  id bigserial primary key,
  tipo text not null,                        -- geral | semana
  modalidade text not null,                  -- casa | comercial | rural | cartas | telefone | publico
  titulo text not null,
  descricao text,
  link text,                                 -- URL externa (Drive, Sheets, etc)
  anexo_nome text,
  anexo_url text,
  publico boolean not null default false,    -- se aparece no painel público
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index campanha_ordem_idx on campanha(ordem);
create index campanha_publico_idx on campanha(publico) where publico = true;
