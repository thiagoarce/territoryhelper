begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

select has_table('public', 'profiles', 'profiles existe');
select has_table('public', 'quadras', 'quadras existe');
select has_table('public', 'territorio_tokens', 'territorio_tokens existe');
select has_table('public', 'cartas_tokens', 'cartas_tokens existe');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS está habilitada em profiles'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.quadras'::regclass),
  'RLS está habilitada em quadras'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'territorio_tokens'
      and cmd = 'SELECT'
      and 'anon' = any(roles)
  ),
  'anon não pode enumerar territorio_tokens'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cartas_tokens'
      and cmd = 'SELECT'
      and 'anon' = any(roles)
  ),
  'anon não pode enumerar cartas_tokens'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'territorio_tokens'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ),
  'authenticated mantém leitura de territorio_tokens'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cartas_tokens'
      and cmd = 'SELECT'
      and 'authenticated' = any(roles)
  ),
  'authenticated mantém leitura de cartas_tokens'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'territorio_publico'
      and pg_get_function_identity_arguments(p.oid) = 'p_token uuid'
      and p.prosecdef
  ),
  'territorio_publico(uuid) existe como SECURITY DEFINER'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'territorio_publico'
      and pg_get_function_identity_arguments(p.oid) = 'p_token uuid'
  ),
  1,
  'há uma única assinatura canônica de territorio_publico(uuid)'
);

select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'quadras'
      and t.tgname = 'quadras_guard_nao_admin'
      and not t.tgisinternal
  ),
  'quadras possui trigger de guarda para não-admin'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'quadras'
      and policyname = 'quadras_dirigente_conclusao'
      and cmd = 'UPDATE'
      and 'authenticated' = any(roles)
  ),
  'dirigente possui policy de UPDATE para conclusão de quadra'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.erros_client'::regclass
      and conname = 'erros_client_tamanho'
  ),
  'erros_client possui limite de tamanho no banco'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'erros_client'
      and policyname = 'erros_client_insert'
      and cmd = 'INSERT'
      and with_check ilike '%publicador_id%auth.uid%'
  ),
  'erros_client exige autoria do usuário autenticado'
);

select * from finish();
rollback;
