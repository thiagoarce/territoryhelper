# Tasks — Rodada Workers/Offline (ordem de execução)

> Cada task = 1 incremento: (migration validada 2x no Postgres local se
> houver) → `npm run build` verde → `npm test` verde → `npm run check`
> sem subir o baseline de erros → commit descritivo com "Não testado:"
> → push branch + merge `main`. Specs em `docs/specs-workers-offline.md`
> (LER o diagnóstico de CPU no topo antes de qualquer task — ele muda
> como se pensa toda a rodada). Migrations a partir de **076**.
>
> 🟢 = Sonnet sozinho; 🟡 = protocolo de verificação reforçado;
> 🔴 = checar com o usuário antes de dar por pronto.

## Onda 0 — já resolvido nesta sessão

- [x] **W1** Reset de testes não apaga mais `quadras_conclusoes` nem
      zera `quadras.data_conclusao` (registro de quadras feitas fica).

## Onda 1 — Infra

- [x] 🟢 **W2** Mover `$lib/server/queries.ts` → `$lib/queries.ts` com
      shim de re-export; criar `$lib/supabase-browser.ts` (singleton);
      página da quadra passa a usar o singleton. Zero mudança de
      comportamento.

## Onda 2 — Leituras fora do Worker (o fix do 1102)

- [x] 🟡 **W3** `/admin` (Geral): load vira `+page.ts` universal com
      client browser + `ssr = false`; `+page.server.ts` fica só com
      actions. Aceite: salvar designação N vezes seguidas sem 1102 e
      sem `__data.json` no Network.

- [x] 🟡 **W4** `/admin/poligonos` e `/publicador/casa-a-casa`: mesma
      conversão (poligonos é o load mais pesado do app, ~19k locais).
      `/publicador` home: converter se a receita estiver tranquila,
      senão anotar como pendência.

## Onda 3 — Cache local

- [x] 🟡 **W5** `$lib/offline/cache-leitura.ts` (stale-while-revalidate
      em IndexedDB) aplicado aos loads convertidos + carteira. Leitura
      offline do último estado; escrita offline NÃO muda nesta rodada.

## Onda 3b — Modo rua (o cenário "salão → rua → salão")

- [x] 🟡 **W8** (a) Prefetch da carteira ao abrir /publicador online
      (dados de todas as quadras designadas + TCEs → cache W5);
      (b) `/publicador/quadra/[id]` e `/publicador/tce/[id]` viram
      `+page.ts` universal cache-first (mesma receita W3/W4);
      (c) desfechos/cartas dessas duas telas trocam POST direto por
      `postComFila` (padrão de `/predio/[id]`, com overlay otimista).
      Aceite = teste em modo avião descrito no spec.

## Onda 4 — Backup funcionando de verdade

- [x] 🔴 **W6** Migration 076 (policies de Storage pra admin no bucket
      `backups-auto`) + snapshot gerado no browser (fetch do export →
      upload direto pro Storage) + restore em lotes (browser parseia,
      manda ~400 linhas por action `restaurarLote`, `realinharSequences`
      no final). Remover o caminho antigo (waitUntil/restore de arquivo
      inteiro). 🔴 porque só conta como pronto depois de testado com a
      base REAL (gerar snapshot → restaurar dele, fluxo completo).

## Onda 5 — Docs

- [x] 🟢 **W7** CLAUDE.md: modelo real de CPU do Workers (cumulativo por
      invocação; `ssr=false` não tira `+page.server.ts` do Worker) +
      corrigir comentários de U5/U6 que assumem "rajada entre awaits".

## Fase 2 — 100% offline do modo campo (depois da Fase 1 inteira)

> Recorte: campo 100% (depois de logado); admin só leitura em cache.
> Detalhes e justificativas no spec.
>
> **Executor (decisão do usuário)**: W9/W10/W12 = SONNET — seguem
> receitas já implementadas várias vezes na Fase 1 (load universal +
> comCache; postComFila + overlay otimista; UI sobre o `cacheInfo` que
> os loads já devolvem — copiar os exemplos existentes, não inventar).
> W11 = FABLE — único item sem padrão pré-existente (integração de
> ferramenta nova). PRÉ-REQUISITO de toda a fase: a Fase 1 testada em
> produção (migration 076 aplicada, salvar designação sem 1102, modo
> avião, snapshot/restore) — não empilhar em cima de base não validada.

- [ ] 🟡 **W9** (Sonnet) Leitura offline total do campo: converter os
      loads de campo restantes (agenda, TP, prédios, campanha,
      /predio/[id]) pra universal+comCache; prefetch completo "Baixar
      pra usar offline" com timestamp visível.

- [ ] 🟡 **W10** (Sonnet) Escrita offline total do campo + fila 2.0:
      todos os POSTs de campo enfileiráveis via postComFila (concluir
      quadra/TCE, não-existe, overlay, reordenar, criar prédio
      pendente, relatório TP, pedidos); fila guarda descrição+status+
      erro por item, falha não bloqueia os demais, sheet de pendências/
      falhas com tentar de novo/descartar. Online-only (documentado):
      link público, Overpass, PNG/WhatsApp, inscrição TP, foto.
      ATENÇÃO: refatora queue.ts, que protege dado de campo — protocolo
      reforçado + testar "item com falha não bloqueia os demais".

- [ ] 🔴 **W11** (Fable) Mapa offline via PMTiles: extract do município
      (script documentado), bucket público `mapa-offline` no Storage,
      botão de download em /perfil, componentes de mapa usam style
      local + pmtiles:// quando disponível/offline (glifos/sprites
      locais via @protomaps/basemaps). Sem padrão no código — não
      delegar pro executor de receita.

- [ ] 🟢 **W12** (Sonnet) UX de estado offline: "dados de HH:MM" por
      tela, seção Offline em /perfil (última sync, baixar tudo, limpar).

## Regras pro executor

1. Ordem: W2 → W3 → W4 → W5 → W8 → W6 → W7. Não pular W2 (W3/W4
   dependem); W8 depende de W5 (cache) e da receita de W3/W4.
2. Ao converter um load: NUNCA importar `$lib/server/*` de um `+page.ts`
   universal (o build quebra de propósito) — é o sinal de que falta
   mover um helper pro shim.
3. As actions NÃO se movem pro browser. Guards e defesa em profundidade
   ficam exatamente onde estão.
4. Depois de W3 e W4, conferir no preview local (`npm run preview`) que
   as rotas convertidas funcionam logado — e listar no commit o que só
   dá pra confirmar em produção.
5. Atualizar CLAUDE.md quando a task mudar arquitetura descrita lá
   (W2/W3/W4 mudam: "Backend (+page.server.ts)" e layout de arquivos).
