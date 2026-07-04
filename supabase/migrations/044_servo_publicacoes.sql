-- ============================================================================
-- 044_servo_publicacoes.sql — TP completo, incremento P-A: área do Servo de
-- Publicações. Servo NÃO é um 4º role (evita mexer em is_admin()/RLS geral):
-- é uma capacidade (profiles.servo_publicacoes) exposta por is_servo_pub().
--
-- Dá ao servo: fila de pedidos especiais de publicação (publicador pede,
-- servo atende) + escrita no catálogo de publicações e no suprimento de
-- campanha (antes só admin).
-- ============================================================================

alter table profiles add column if not exists servo_publicacoes boolean not null default false;

-- Capacidade "servo de publicações": admin sempre é; ou a flag no perfil.
create or replace function is_servo_pub() returns boolean
  language sql security definer stable
  set search_path = public
as $$
  select coalesce(
    (select role = 'admin' or servo_publicacoes from profiles where id = auth.uid()),
    false
  );
$$;

-- servo_publicacoes é privilégio (destrava escrita em publicações/suprimento
-- + leitura de pedidos alheios): só admin pode ligar/desligar. Estende a
-- trigger de campos sensíveis de profiles (era só role/ativo — migration 010).
create or replace function profiles_guard_sensitive() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if (new.role is distinct from old.role
      or new.ativo is distinct from old.ativo
      or new.servo_publicacoes is distinct from old.servo_publicacoes)
     and not is_admin() then
    raise exception 'Apenas admin pode alterar role, status ativo ou servo de publicações';
  end if;
  return new;
end;
$$;

-- Fila de pedidos especiais. publicacao_id null = pedido fora do catálogo
-- (texto livre em descricao, ex: "Bíblia em russo").
create table if not exists pedidos_publicacao (
  id bigserial primary key,
  publicador_id uuid not null references profiles(id) on delete cascade,
  publicacao_id bigint references publicacoes(id) on delete set null,
  descricao text,
  qtd int not null default 1,
  status text not null default 'aberto'
    check (status in ('aberto','pedido','entregue','cancelado')),
  notas_servo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pedidos_publicacao_status_idx on pedidos_publicacao(status);
create index if not exists pedidos_publicacao_pub_idx on pedidos_publicacao(publicador_id);

alter table pedidos_publicacao enable row level security;

-- Publicador cria/vê os seus; servo vê e atende todos.
drop policy if exists pedidos_publicacao_select on pedidos_publicacao;
create policy pedidos_publicacao_select on pedidos_publicacao for select
  using (publicador_id = auth.uid() or is_servo_pub());
drop policy if exists pedidos_publicacao_insert on pedidos_publicacao;
create policy pedidos_publicacao_insert on pedidos_publicacao for insert
  with check (publicador_id = auth.uid());
drop policy if exists pedidos_publicacao_update on pedidos_publicacao;
create policy pedidos_publicacao_update on pedidos_publicacao for update
  using (is_servo_pub() or (publicador_id = auth.uid() and status = 'aberto'))
  with check (is_servo_pub() or (publicador_id = auth.uid()));
drop policy if exists pedidos_publicacao_delete on pedidos_publicacao;
create policy pedidos_publicacao_delete on pedidos_publicacao for delete using (is_servo_pub());

-- Servo passa a escrever no catálogo e no suprimento (antes só admin — 037).
drop policy if exists publicacoes_admin_write on publicacoes;
drop policy if exists publicacoes_write on publicacoes;
create policy publicacoes_write on publicacoes for all using (is_servo_pub()) with check (is_servo_pub());

drop policy if exists campanha_suprimentos_admin_write on campanha_suprimentos;
drop policy if exists campanha_suprimentos_write on campanha_suprimentos;
create policy campanha_suprimentos_write on campanha_suprimentos for all using (is_servo_pub()) with check (is_servo_pub());
