begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

-- Usuários isolados deste teste. O trigger on_auth_user_created cria os profiles.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '10000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'publisher-contract@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Publicador de teste"}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    'admin-contract@example.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"nome":"Admin de teste"}'::jsonb,
    now(),
    now()
  );

-- A preparação ocorre como postgres, sem UID de usuário final.
update profiles
set role = 'admin'
where id = '10000000-0000-0000-0000-000000000002'::uuid;

-- Simula uma chamada PostgREST do publicador comum.
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$update public.profiles
    set nome = 'Nome alterado pelo próprio usuário'
    where id = '10000000-0000-0000-0000-000000000001'::uuid$$,
  'publicador pode alterar o próprio nome'
);

select throws_ok(
  $$update public.profiles
    set role = 'admin'
    where id = '10000000-0000-0000-0000-000000000001'::uuid$$,
  'P0001',
  'Apenas admin pode alterar role, status ativo, servo de publicações ou aprovação de testemunho público',
  'publicador não pode promover a própria role'
);

select throws_ok(
  $$update public.profiles
    set ativo = false
    where id = '10000000-0000-0000-0000-000000000001'::uuid$$,
  'P0001',
  'Apenas admin pode alterar role, status ativo, servo de publicações ou aprovação de testemunho público',
  'publicador não pode desativar o próprio perfil'
);

select throws_ok(
  $$update public.profiles
    set servo_publicacoes = true
    where id = '10000000-0000-0000-0000-000000000001'::uuid$$,
  'P0001',
  'Apenas admin pode alterar role, status ativo, servo de publicações ou aprovação de testemunho público',
  'publicador não pode conceder a si mesmo a capacidade de publicações'
);

select throws_ok(
  $$update public.profiles
    set tp_aprovado = true
    where id = '10000000-0000-0000-0000-000000000001'::uuid$$,
  'P0001',
  'Apenas admin pode alterar role, status ativo, servo de publicações ou aprovação de testemunho público',
  'publicador não pode aprovar a si mesmo para testemunho público'
);

reset role;

-- Simula uma sessão autenticada do admin.
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$update public.profiles
    set tp_aprovado = true
    where id = '10000000-0000-0000-0000-000000000001'::uuid$$,
  'admin pode conceder aprovação para testemunho público'
);

select is(
  (
    select tp_aprovado
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'::uuid
  ),
  true,
  'aprovação concedida pelo admin foi persistida'
);

select * from finish();
rollback;
