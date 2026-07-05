-- ============================================================================
-- 053_publicacao_controle.sql — Listas de controle por publicação (servo de
-- publicações escolhe uma publicação e vê um checklist de todos os
-- publicadores com contador de quantidade pedida e quantidade entregue).
--
-- Diferente de pedidos_publicacao (fila de pedidos especiais avulsos, cada
-- um com status próprio): aqui é um registro manual, 1 linha por
-- (publicacao, publicador), sem fluxo/aprovação — o servo só confirma
-- "fulano pediu N, já entreguei M". Mesma capacidade is_servo_pub() de
-- sempre, sem criar role novo (decisão do usuário: capacidades > roles).
-- ============================================================================

create table if not exists publicacao_controle (
  id bigserial primary key,
  publicacao_id bigint not null references publicacoes(id) on delete cascade,
  publicador_id uuid not null references profiles(id) on delete cascade,
  qtd_pedida int not null default 0,
  qtd_entregue int not null default 0,
  atualizado_em timestamptz not null default now(),
  unique(publicacao_id, publicador_id)
);
create index if not exists publicacao_controle_pub_idx on publicacao_controle(publicacao_id);

alter table publicacao_controle enable row level security;

drop policy if exists publicacao_controle_all on publicacao_controle;
create policy publicacao_controle_all on publicacao_controle for all
  using (is_servo_pub()) with check (is_servo_pub());
