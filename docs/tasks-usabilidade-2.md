# Tasks — Rodada de usabilidade 2 (ordem de execução)

> Cada task = 1 incremento: (migration validada no Postgres local se
> houver) → `npm run build` verde → `npm test` verde → commit descritivo
> → push branch + merge `main`. Specs completos por área em
> `docs/specs-usabilidade-2.md` (referências U1–U13). Não inventar além
> do spec; em dúvida real, perguntar antes de codar.
>
> Migrations desta rodada: numerar a partir de **074** (073 já foi
> aplicada nesta sessão, fora deste round, como fix de regressão —
> ver U13). Nunca editar migration antiga.
>
> **Executor por task** — mesma legenda das rodadas anteriores:
> 🟢 = Sonnet sozinho; 🟡 = Sonnet + protocolo de verificação reforçado;
> 🔴 = decisão de segurança/dado/infra — checar com o usuário antes de
> rodar, mesmo que o spec já descreva o "como".

## Onda 0 — já resolvido nesta sessão

- [x] **U13** Densidade por residências/endereços ficava cinza —
      regressão da migration 071 (bigint/numeric serializado como
      string). Corrigido na migration 073 + `Number()` defensivo em
      `queries.ts`. Commitado e mergeado em `main`.
- [x] **U4** "Pra que serve o botão Auditoria na sidebar?" — respondido:
      é o visualizador de `audit_log` (trilha genérica de mudanças,
      filtrável por tabela). Não precisa de mudança de código.

## Onda 1 — Quick wins (sem migration)

- [ ] 🟢 **U3** Publicador não-aprovado no TP não vê a aba/ícone do TP
      (só admin vê mesmo sem `tp_aprovado`). Bottom nav + drawer +
      qualquer link direto.

- [ ] 🟢 **U8** Botão pra voltar fase do TP (montagem → disponibilidade)
      ou reabrir um mês já fechado. Backend (`definirFaseMes`) já
      aceita qualquer transição — só falta UI.

- [ ] 🟢 **U9** Dirigente ganha opção de finalizar a designação de
      arranjo ANTES do prazo (voluntário), sem esperar `precisaFinalizar()`.

- [ ] 🟢 **U10** Polígonos: barra de abas com overflow no mobile
      (aba Curadoria nova estourou). CSS only.

- [ ] 🟢 **U1** Ordenar endereços da quadra automaticamente ao redor do
      centro (sentido horário) como ORDEM PADRÃO quando não há
      `ordem_na_quadra` manual.

## Onda 2 — Performance (backup + CPU)

- [ ] 🟡 **U5** Corrigir export de backup (1kb + 500 = worker estourando
      CPU/tempo no meio do loop de 39 tabelas + 1 JSON.stringify
      gigante). Reescrever como streaming.

- [ ] 🟡/🔴 **U12** Varredura de otimização contínua: aplicar o mesmo
      raciocínio de U5 a outros endpoints pesados candidatos (ver spec)
      — sem prazo fixo, é um item recorrente desta e das próximas rodadas.

## Onda 3 — Versionamento de dados (depende de U5)

- [ ] 🔴 **U6** Snapshot JSON automático agendado (Cron Trigger) +
      restauração a partir de um snapshot escolhido em
      `/admin/dev/backup`. Requer U5 pronto (o cron reusa o export).

## Onda 4 — Polígonos / Auditar

- [ ] 🟡 **U11** Auditar (Polígonos): mostrar os ENDEREÇOS de cada
      cluster (não só a contagem), com link de Street View por
      endereço, e uma seleção "pertence a esta quadra" por endereço —
      os não selecionados caem em "sem quadra" → fluxo já existente de
      Atribuir quadra.

## Onda 5 — Posição do prédio errada (decisão estrutural)

- [ ] 🔴 **U2** Publicador reporta posição errada: (a) endereço certo,
      posição errada dentro da mesma quadra — botão "usar minha
      localização atual"; (b) endereço não pertence a esta quadra —
      escolher a quadra certa entre as próximas. Aplica na hora +
      gera `curadoria_edicoes` (mesmo padrão do overlay livre, T11).

## Onda 6 — Reset de dados de teste (destrutivo, por último)

- [x] 🔴 **U7** `scripts/reset-rodada-testes.sql` — utilitário PERMANENTE
      (não um script de uso único): apaga histórico de trabalho de
      campo + designações/arranjos/TP/campanha de teste, mantendo
      território/quadras/endereços e todos os catálogos intactos.
      Validado localmente com fixture real (dados inseridos, script
      rodado, resultado conferido linha a linha). **Decisão do
      usuário**: deixar salvo no repo, NÃO rodar agora — ele aciona via
      `/admin/dev/sql` quando quiser, e o script deve ser mantido
      atualizado a cada tabela nova (documentado no cabeçalho do
      arquivo e no CLAUDE.md).

## Regras pro agente executor

1. Uma task por vez, na ordem das ondas. U5 antes de U6 e U12
   (mesma técnica de streaming). U7 é a ÚLTIMA da rodada.
2. Migration nova sempre validada 2x no Postgres local antes de
   commitar; avisar o usuário pra aplicar via `/admin/dev/sql`.
3. Task 🔴: nunca executar a parte destrutiva/estrutural sem
   confirmação explícita do usuário no chat, mesmo com o spec escrito.
4. Não refatorar fora do escopo da task. Não renomear tabelas/rotas
   (ex.: `tp_carrinhos` continua com esse nome — só o rótulo na UI já
   foi trocado pra "Equipamentos" numa rodada anterior).
5. Atualizar CLAUDE.md quando a task mudar modelo de dados ou telas
   descritas lá.

## Protocolo de verificação (obrigatório nas 🟡/🔴, recomendado nas 🟢)

1. `npm run build` e `npm test` verdes (sempre).
2. `npm run check 2>&1 | tail -1` — nº de erros não pode subir.
3. Migration: 2x no Postgres local (idempotência).
4. Simular o fluxo ponta a ponta e listar no commit os caminhos NÃO
   testados.
5. RLS/policies novas ou RPC SECURITY DEFINER: escrever no commit qual
   role pode o quê.
6. Se o spec não bater com o código real, parar e perguntar.
