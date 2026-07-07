-- T7 (A12a): fim da capacidade servo_publicacoes — /publicacoes vira
-- admin-only (rota + UI já mudaram no código). Em vez de recriar cada
-- policy que usa is_servo_pub() (pedidos_publicacao, publicacoes,
-- campanha_suprimentos, tp_relatorios, notificacoes, publicacao_controle),
-- redefine a própria função pra virar sinônimo de "é admin" — todas essas
-- policies continuam funcionando, só que agora só admin passa.
-- Mantém a coluna profiles.servo_publicacoes (inofensiva, sem uso).
create or replace function is_servo_pub() returns boolean
  language sql security definer stable
  set search_path = public
as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;
