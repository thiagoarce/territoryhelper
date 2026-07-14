-- 083: fecha ENUMERAÇÃO de tokens públicos (achado da revisão de segurança).
--
-- territorio_tokens e cartas_tokens tinham SELECT `using (true)` pro papel
-- `anon` (030 e 014) — com a PUBLIC_SUPABASE_ANON_KEY (que é pública por
-- definição, vai no bundle do client) qualquer pessoa listava TODOS os
-- tokens direto no PostgREST:
--   GET /rest/v1/territorio_tokens?select=token
-- e com cada token chamava territorio_publico()/carta_publica_dados()
-- (e até carta_publica_toggle(), que ESCREVE) — anulando por completo a
-- proteção de "uuid não-adivinhável" dos links públicos.
--
-- A leitura anon é DESNECESSÁRIA: as páginas públicas /t/[token] e
-- /cartas/[token] nunca leem essas tabelas — resolvem tudo por RPCs
-- `security definer` (territorio_publico, carta_publica_dados/toggle),
-- que enxergam a tabela como definer. Todos os call sites do app que
-- leem as tabelas são server-side AUTENTICADOS (+page.server.ts com
-- locals.supabase). Restringir a `authenticated` não muda nenhum fluxo.

drop policy if exists territorio_tokens_select on territorio_tokens;
create policy territorio_tokens_select on territorio_tokens
  for select to authenticated using (true);

drop policy if exists "cartas_tokens_anon_select" on cartas_tokens;
create policy cartas_tokens_select on cartas_tokens
  for select to authenticated using (true);
