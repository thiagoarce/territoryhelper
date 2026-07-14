-- 088: publicador pode apagar as PRÓPRIAS notificações já lidas.
--
-- notificacoes não tinha nenhuma policy de DELETE (só select/update do
-- próprio dono, insert de admin/servo) — o publicador não tinha como
-- limpar o sino depois de ler, só marcar como lida e conviver com a
-- lista crescendo. RLS restringe a linha (auth.uid()); a UI
-- (NotificacoesBell.svelte) restringe pra só apagar as JÁ LIDAS — não
-- é enforced aqui de propósito (dono da própria notificação pode
-- querer descartar até uma não lida; a política de "só depois de ler"
-- é UX, não segurança).
drop policy if exists notificacoes_delete on notificacoes;
create policy notificacoes_delete on notificacoes for delete
  using (publicador_id = auth.uid());
