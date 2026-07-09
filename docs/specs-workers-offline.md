# Specs — Rodada Workers/Offline (W1–W7)

> Objetivo da rodada: acabar com o erro 1102 (CPU do Cloudflare Workers)
> continuando no plano FREE, deixar o app abrir com dados locais
> (cache-first), e consertar snapshot/restore de backup. Ordem de
> execução em `docs/tasks-workers-offline.md`. Migrations a partir de
> **076**. Convenções gerais do CLAUDE.md valem todas.

---

## O diagnóstico que governa a rodada inteira (ler antes de codar)

**Modelo de CPU real do Workers Free: ~10ms de CPU POR INVOCAÇÃO,
CUMULATIVO.** A premissa usada nas rodadas anteriores ("o limite é por
rajada síncrona entre awaits") estava ERRADA — awaits não zeram o
contador; todo o CPU gasto numa mesma invocação soma contra o teto.
Streaming (U5) ajudou memória/latência e por sorte o export cabe no
teto, mas a conta é cumulativa. Consequências:

1. **Não existe "quebrar em pedacinhos com await" como mitigação.** A
   única mitigação estrutural no free é **tirar trabalho do Worker**:
   leituras → browser (que não tem limite), agregações → Postgres (já
   em curso desde as migrations 070/071).
2. **Por que "salvar designação no mapa geral" derruba**: a action
   `criarDesignacao` em si é leve (2 checagens + 3 inserts). O custo é
   o que vem DEPOIS — o cliente chama `invalidateAll()` (11 chamadas em
   `/admin/+page.svelte`, 25 em `/admin/poligonos/+page.svelte`), que
   reexecuta o `load()` INTEIRO da rota no Worker + serializa tudo com
   devalue. `/admin` agrega quadras+geo+designações+publicadores+TCEs+
   campanha+curadoria; `/admin/poligonos` carrega ~19k `locais_geo` via
   `selectAll`. Cada salvamento = um reload pesado = roleta de 1102. Uso
   intenso do admin = vários 1102 seguidos = degradação temporária que
   afeta todo mundo (o que você observou).
3. **A auth (`hooks.server.ts`) roda em toda request** mas é leve (1
   query pequena) — não é o problema.

**A tese da rodada**: o app foi desenhado RLS-first ("RLS faz o controle
de acesso" — CLAUDE.md). `locals.supabase` usa a MESMA sessão/anon key
que o browser do usuário. Logo, toda leitura feita hoje no `load()`
server pode ser feita direto browser→Supabase com permissões idênticas,
custo zero de Worker, e o `invalidateAll()` vira operação puramente
client-side. O Worker fica só com: shell HTML (1x), actions (pequenas),
rotas públicas por token, push e backup.

⚠️ Nuance que o "conselho genérico" erra: `export const ssr = false`
SOZINHO não resolve nada — um `+page.server.ts` load continua rodando no
Worker (via `__data.json`) mesmo com ssr desligado. O que resolve é
**mover o load pra `+page.ts` (universal)** com o client browser; com
`ssr = false`, universal load roda 100% no browser.

---

## W1 — [FEITO nesta sessão] Reset não apaga registro de quadras feitas

Decisão do usuário: `quadras_conclusoes` e `quadras.data_conclusao`
ficam de fora do `scripts/reset-rodada-testes.sql` (o ciclo do casa em
casa sobrevive ao reset). Editado + validado no Postgres local.

## W2 — Infra: queries portáveis + client Supabase do browser

Pré-requisito de W3/W4. Sem migration.

- **Mover `src/lib/server/queries.ts` → `src/lib/queries.ts`** (é
  portável: só importa `@supabase/supabase-js` types, `$lib/ciclos`,
  `$lib/types`, `$lib/arranjos` — tudo shared). Deixar
  `src/lib/server/queries.ts` como shim de re-export (`export * from
  '$lib/queries'`) pra não tocar nos ~15 imports server existentes.
- Mesmo tratamento pra qualquer helper puro que os loads convertidos
  precisarem (ex.: `$lib/server/posse.ts` é puro por design — se
  casa-a-casa precisar dele no browser, mover com shim igual).
- **Criar `src/lib/supabase-browser.ts`**: singleton
  `createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)`
  (mesmo padrão já usado ad-hoc em `/publicador/quadra/[id]/+page.svelte`
  pro realtime — consolidar; a página da quadra passa a importar daqui).
- Aceite: build verde, testes verdes, nenhum comportamento muda ainda.

## W3 — /admin (Geral): leituras no browser

A rota do incidente relatado ("salvar designações no mapa geral").

- Converter o `load` de `src/routes/admin/+page.server.ts` pra
  `src/routes/admin/+page.ts` (universal), usando o client de
  `$lib/supabase-browser` e os helpers de `$lib/queries`. Adicionar
  `export const ssr = false` na rota.
- O `+page.server.ts` CONTINUA existindo só com as `actions` (SvelteKit
  suporta `+page.ts` com load + `+page.server.ts` só com actions).
  Actions não mudam: guards `exigirAdminAction`, checagens de conflito e
  `criarNotificacao` ficam como estão (defesa em profundidade).
- Guard de rota: `/admin/+layout.server.ts` (`exigirRole(['admin'])`)
  fica — é barato e continua bloqueando não-admin no primeiro hit. A
  leitura de dados em si é protegida por RLS (mesma sessão).
- Dados de sessão no load universal: usar `await parent()` (o root
  layout já devolve `session`/`profile` via `PageData`).
- Os `invalidateAll()` existentes passam a reexecutar o load NO BROWSER
  — não precisa removê-los (viram grátis pro Worker). NÃO gastar tempo
  em atualização otimista nesta rodada.
- Aceite (o teste que importa): com a aba Network aberta, salvar uma
  designação no mapa geral NÃO gera nenhuma request `__data.json` pro
  domínio do app — só a POST da action (pequena) e queries diretas pra
  `*.supabase.co`. Repetir o salvamento várias vezes seguidas sem 1102.

## W4 — /admin/poligonos + /publicador/casa-a-casa: idem

- `/admin/poligonos`: o load MAIS pesado do app (~19k `locais_geo` via
  `selectAll` + quadras+territórios+TCEs+curadoria). Mesma conversão de
  W3. Com 25 `invalidateAll()` na tela, é onde o ganho por clique é
  maior. Atenção: `selectAll` pagina em 19+ requests — no browser isso é
  ok (sem limite de CPU), mas conferir que a UX de loading da tela
  aguenta (spinner/estado de carregando já existe?).
- `/publicador/casa-a-casa`: também usa `listarQuadrasComGeo` (rota já
  apareceu nos estouros de CPU investigados nesta sessão). Mesma
  conversão; as actions (`finalizarArranjo`, `concluirQuadra`,
  repartição) ficam no server.
- `/publicador` (home): converter TAMBÉM SE a conversão de casa-a-casa
  se mostrar tranquila — mesma receita; senão, deixar explicitamente
  anotado como pendência da próxima rodada.
- Aceite: navegar e editar polígonos/vincular endereços em sequência sem
  1102; Network mostra queries indo direto pro Supabase.

## W5 — Cache local (IndexedDB) stale-while-revalidate

O "funcionar com os dados baixados" pragmático. Depende de W3/W4 (os
loads precisam estar no browser pra poderem ler/escrever cache local).

- Criar `src/lib/offline/cache-leitura.ts`: helper
  `comCache(chave, versao, fetcher)` — devolve imediatamente o valor do
  IndexedDB se existir (com `gravado_em`), dispara o `fetcher` em
  background e atualiza tela + cache quando chegar (padrão
  stale-while-revalidate). Reusar a infra IndexedDB de `$lib/offline`
  (fila de escrita já existe lá).
- Aplicar nos loads convertidos (W3/W4) e na carteira do publicador:
  chave por rota+usuário. Ao voltar de uma action, o `invalidateAll()`
  refaz o fetch e re-grava o cache.
- Offline real: com service worker + cache, abrir o app sem rede mostra
  o último estado conhecido dessas telas (LEITURA). Escrita offline
  continua só onde já existe fila (`postComFila` em `/predio/[id]`) —
  **não** construir sync bidirecional/resolução de conflito nesta
  rodada (ver "o que fica de fora" abaixo).
- Aceite: abrir /publicador em modo avião (após 1 visita online) mostra
  a carteira; online, telas abrem instantâneo com dado de cache e
  atualizam sozinhas em seguida.

## W6 — Backup: consertar snapshot + restore (client-orchestrated)

Os dois itens que você reportou quebrados. Causa provável dos dois é o
MESMO modelo de CPU acima:

- **Snapshot nunca gera**: `gerarSnapshotSeNecessario` roda no Worker
  (via `waitUntil`) e faz `JSON.stringify` de tabela por tabela + join
  de ~MBs — CPU cumulativa estoura e o waitUntil morre silencioso
  (`console.error` só visível no dashboard). Design da U6 estava errado
  pra plataforma.
- **Restore não restaura**: a action recebe o arquivo inteiro, faz UM
  `JSON.parse` de vários MB + dezenas de upserts na MESMA invocação —
  1102 quase garantido com base real.

Redesenho (o browser faz o trabalho pesado; Worker só grava lotes):

- **Migration 076**: policies de Storage no bucket `backups-auto` pra
  admin autenticado (select/insert/delete `where bucket_id =
  'backups-auto' and is_admin()`) — hoje só o service role acessa.
- **Snapshot**: gerado NO BROWSER — a tela `/admin/dev/backup` faz
  `fetch('/admin/dev/backup/export')` (o export streaming JÁ funciona),
  recebe o blob e sobe DIRETO pro Storage com o client browser (policy
  nova). Botão "Gerar snapshot agora" + auto-check ao abrir a tela (se o
  mais recente > 20h, gera sozinho). Rotação (manter 7) feita no browser
  via list+remove. REMOVER `gerarSnapshotSeNecessario`/`waitUntil` do
  `+page.server.ts` (código morto após a mudança); listagem de snapshots
  pode vir do browser também.
- **Restore em lotes**: o BROWSER parseia o JSON (upload do arquivo OU
  download do snapshot do Storage — parse no browser é grátis) e envia
  lotes de ~400 linhas por vez pra uma action nova `restaurarLote`
  (admin-gated, service role, upsert com `onConflict` da tabela — reusar
  `TABELAS_BACKUP`/ordem de FK do `_tabelas.ts`). Barra de progresso por
  tabela. Ao final, action `realinharSequences` (o bloco de `setval` que
  já existe, isolado). Mantém a confirmação "RESTAURAR". A action
  `restaurar` antiga (arquivo inteiro) morre; `restaurarSnapshot` idem.
- Aceite: gerar snapshot com a base real (aparece no bucket), baixar,
  restaurar do próprio snapshot num fluxo completo sem 1102 — testar com
  a base REAL antes de dar por pronto, porque foi exatamente onde o
  design anterior quebrou.

## W7 — Documentação do modelo de CPU

- CLAUDE.md: corrigir/registrar em "Deploy" ou "Anti-padrões": CPU do
  Workers Free é ~10ms POR INVOCAÇÃO, CUMULATIVA (awaits não zeram);
  leitura pesada pertence ao browser ou ao Postgres, nunca ao Worker;
  `+page.server.ts` load roda no Worker MESMO com `ssr = false` — pra
  tirar do Worker tem que ser `+page.ts` universal.
- Ajustar os comentários otimistas de U5/U6 que citam "rajada entre
  awaits" (só o TEXTO — o export funciona, não mexer no código dele).

---

## O que fica DELIBERADAMENTE de fora desta rodada

- **Sync bidirecional/local-first completo** (escrita offline em tudo,
  resolução de conflitos, delta sync por `atualizado_em`): custo alto,
  benefício baixo enquanto o problema real é CPU de leitura. O W5 cobre
  o caso de uso citado ("as coisas não mudam drasticamente") pra
  LEITURA; escrita offline segue nos fluxos de campo que já têm fila.
- **Atualização otimista nas telas admin** (remover invalidateAll):
  depois de W3/W4 o invalidateAll é grátis pro Worker — vira só
  polimento de UX, não urgência.
- **Trocar de host (Vercel/VPS) ou plano pago**: descartado por decisão
  do usuário; e com W3/W4/W6 o Worker fica com quase nada pra fazer.
