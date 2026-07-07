# Tasks — Ajustes finais (ordem de execução)

> Cada task = 1 incremento: (migration validada no Postgres local se
> houver) → `npm run build` verde → `npm test` verde → commit descritivo
> → push branch + merge `main`. Specs completos por área em
> `docs/specs-ajustes-finais.md` (referências A1–A24). Não inventar
> além do spec; em dúvida real, perguntar antes de codar.
>
> Migrations desta rodada: numerar a partir de **057**, uma por task
> quando precisar (nunca editar migration antiga). Avisar o usuário ao
> final de cada task que tenha migration: "aplicar 0XX via /admin/dev/sql".
>
> **Executor por task** — cada task tem uma marca:
> 🟢 = Sonnet sozinho (escopo fechado, padrão já existe no código);
> 🟡 = Sonnet executa, MAS roda o protocolo de verificação reforçado
>      (seção final) e o resultado deve ser revisado (Fable ou humano)
>      antes de seguir pra próxima task dependente;
> 🔴 = Fable (ou Sonnet só com supervisão passo a passo) — segurança,
>      SQL não-trivial, service worker ou design de algoritmo.

## Onda 1 — Quick wins (sem migration, exceto T6)

- [x] 🟢 **T1 (A1)** Remover "Quero participar" da Agenda.
      Arquivos: `src/routes/publicador/arranjo/+page.svelte` (+server).
      DoD: botão e action fora; nada mais muda.

- [x] 🟢 **T2 (A4)** Home: mover "Você dirige", "Sua parte", Cartas e TCEs
      pra DENTRO da seção "Minhas designações" (ordem: dirige → parte →
      território pessoal → cartas → TCEs), com separadores. Só template.
      Arquivo: `src/routes/publicador/+page.svelte`.

- [x] 🟢 **T3 (A15)** Header: botão modo campo ↔ modo admin (só admin);
      remover "Modo campo" e "Perfil" do drawer.
      Arquivo: `src/routes/+layout.svelte`.

- [x] 🟢 **T4 (A8-parte)** Detalhe da quadra: botão inverter ordem da
      lista (client-side). Arquivo:
      `src/routes/publicador/quadra/[id]/+page.svelte`.

- [x] 🟢 **T5 (A8-parte)** Detalhe da quadra: agrupar comércios do mesmo
      endereço num card (como a aba Prédios). Mesmo arquivo + comparar
      com `src/routes/publicador/predios/+page.svelte`.

- [x] 🟡 **T6 (A14)** Preferência global de mapa: migration 059
      (`profiles.pref_basemap`), seletor em `/perfil`, componentes de
      mapa leem a pref, REMOVER seletores locais (Geral, Polígonos e
      onde mais houver `basemap` bindable na UI).
      Arquivos: `MapaAdmin/MapaPoligonos/AdminMapa.svelte`, `/perfil`,
      `/admin/+page.svelte`, `/admin/poligonos/+page.svelte`.

- [x] 🟡 **T7 (A12a)** Fim do servo_publicacoes: `/publicacoes` vira
      admin-only, some o checkbox de usuários, some o card da home,
      migration recriando policies que usam `is_servo_pub()` com
      `is_admin()`. Atualizar CLAUDE.md.

## Onda 2 — Mapas e Geral

- [x] 🟢 **T8 (A3)** `contarResidenciasPorQuadra` no queries.ts + modos
      `densidade_enderecos`/`densidade_residencias` no `MapaAdmin`
      (Geral) — substituindo o modo "densidade" único.

- [x] 🟡 **T9 (A13)** `AdminMapa.svelte`: prop `colorirPor` ampliada
      (conclusão/território/densidades) + popup de detalhe no clique;
      `/publicador/mapa` ganha o seletor de modos e o popup (sem ação).

- [x] 🟡 **T10 (A24)** Geral: fundir cor "status"+"idade" em "conclusão";
      remover botão/lista "Designações" (manter ações espaciais);
      popup só em long-press OU painel de rodapé (escolher o mais
      simples); densidade por residências no seletor.

## Onda 3 — Curadoria + edição livre + feedback de precisão

- [x] 🔴 **T11 (A5+A6)** ✅ feita pelo Fable (migration 057) Migration 057: `curadoria_edicoes` +
      `locais.marcado_nao_existe/por/em` + `locais.ordem_na_quadra` +
      ajuste de RLS/trigger pra edição de overlay por qualquer
      autenticado (validar 2x no Postgres local). Remover
      `podeEditarLocal` das actions de OVERLAY (não das de
      desfecho/carta/exclusão) em `/predio/[id]` e
      `/publicador/quadra/[id]`; gravar linha de curadoria em cada
      edição de publicador.

- [x] 🟡 **T12 (A6)** Tela de curadoria do admin (bloco em /admin/predios
      ou /admin — ver spec): pendentes com diff, Confirmar / Reverter
      (reverter aplica `antes`). + bloco "Feedback do campo" abaixo da
      Visão Geral (A24) linkando pra cá.

- [ ] 🟢 **T13 (A7)** "Não existe mais": ação nas telas de quadra/prédio,
      esmaecer + tirar das contagens, entrada na curadoria. Endereço
      aproximado no criar local (prefill por vizinho mais próximo).

- [ ] 🟢 **T14 (A8-parte)** Reordenação manual: setinhas ▲▼ gravando
      `ordem_na_quadra` (+ curadoria), lista ordena por ele quando
      presente.

## Onda 4 — Casa a casa (dirigente) + ciclo por prédio

- [ ] 🟢 **T15 (A2)** "Seu grupo": clique na quadra abre sheet de ação
      (Concluir + Compartilhar + cobertura), nova action
      `concluirQuadra` no casa-a-casa server; "Finalizar designação"
      vira sheet de conferência por quadra.

- [ ] 🟡 **T16 (A19)** Ciclo de cartas POR PRÉDIO: migration
      (`cartas_ciclos.local_id` + RPC novo), `cicloCartasPorLocal`,
      call-sites, botão por prédio, remover card global de
      /admin/predios. Testes de `$lib/ciclos.ts` continuam passando.

## Onda 5 — Publicações e campanha

- [ ] 🟡 **T17 (A12b)** Revistas mensais: migration
      (`publicacoes.periodicidade`, variante/letras_grandes em
      `publicador_necessidade_regular`), card da home reformulado
      (público × estudo × letras grandes), seção "Revistas do mês" em
      /publicacoes (necessidade agregada × estoque × quanto pedir),
      revistas fora do pedido especial.

- [ ] 🟢 **T18 (A12c)** Reposição por carrinho: migration
      `tp_carrinho_inventario`, seção Reposição reorganizada por
      carrinho (inventário item+qtd editável + pendências de relatório
      do carrinho).

- [ ] 🟢 **T19 (A17)** Suprimento de campanha lê estoque do catálogo
      (read-only + link), remove input duplicado.

- [ ] 🟢 **T20 (A18)** Campanha do publicador: mapa do período + gráfico
      semanal + metas pessoais (migration `campanha_metas_pessoais`) +
      card "Minha colaboração" calculado.

## Onda 6 — Login/offline/push

- [ ] 🟡 **T21 (A11)** Recuperação de senha via link do admin (reusar
      convite pra usuário existente) + tela "esqueci minha senha"
      informativa no /login. (+ e-mail de reset só se SMTP existir.)

- [x] 🔴 **T22 (A9)** ✅ feita pelo Fable Offline mínimo: SW com precache do shell + página
      /offline + runtime cache das rotas do campo + banner
      online/offline com contagem da fila.

- [x] 🔴 **T23 (A10)** ✅ lado-código feito pelo Fable (falta o teste no aparelho — ver relatório) Diagnóstico do push com o roteiro do spec
      (runtime vars → subscription no iPhone com PWA instalado →
      status do tickle). Entregar relatório + fix pontual se for app.

## Onda 7 — TCE (2 fases)

- [ ] 🟡 **T24 (A21-f1)** Representação por quadras-contêiner + filtro
      "TCEs" na Geral + `arranjos.tces_ids[]` (migration) com anexar
      múltiplos TCEs a arranjo.

- [ ] 🟡 **T25 (A21-f2)** `designacao_tces` + `arranjo_partes.tces_ids` —
      TCE como designação pessoal e repartível; home/casa-a-casa
      exibem via designação.

## Onda 8 — TP mensal (maior; 4 fases)

- [x] 🟡 **T26 (A22-f1)** ✅ feita pelo Fable (migration 058) Migrations do modelo (`tp_meses`,
      `tp_disponibilidade_mes`, `status` em participantes, `origem` em
      agendamentos) + controle de fase do mês no /admin/tp +
      disponibilidade mensal por mini-calendário no /publicador/tp
      (substitui semanal+confirmação; pré-preenche do padrão antigo).

- [x] 🔴 **T27 (A22-f2)** ✅ feita pelo Fable Grade do publicador (adaptar TpGradeSemana:
      retrato = por dia, paisagem/desktop = semana/mês) com turnos
      designados + Aceitar/Recusar + notificações.

- [ ] 🟡 **T28 (A22-f3)** Reservas de sobra: célula vazia → sheet
      (tipo com equipamento livre no horário + convidar publicadores)
      → cria agendamento origem='reserva'; admin vê/cancela.

- [ ] 🟡 **T29 (A22-f4)** Algoritmo de montagem (`$lib/tp-montagem.ts`
      puro + testes) + painel de montagem no admin (proposta → revisar
      → publicar) + matriz de disponibilidades.

## Onda 8b — Aprovação TP (pode rodar antes da Onda 8)

- [ ] 🟢 **T31 (A22-aprovação)** `profiles.tp_aprovado` (migration) +
      toggle "Aprovado" em `/admin/tp/publicadores` + TODAS as listas
      de publicador do fluxo TP filtram aprovados (designar no
      Planner atual, montagem, reserva). Pode ser feita já na Onda 1 —
      o Planner atual já se beneficia.

## Onda 9 — Polígonos

- [ ] 🟢 **T30 (A20)** Auditar acionável: 3 listas (sem face / quadra
      vazia / multi-cluster) com ações de foco, unificar cluster e ver
      vizinhas.

## Onda 10 — Operação e backup

- [ ] 🟡 **T32 (A26)** Transferir dirigência em série (/admin/arranjos):
      A→B num período, confirm com contagem, notificação.

- [ ] 🟢 **T33 (A27)** Histórico do publicador em /admin/usuarios
      (card read-only: registros/mês, conclusões, turnos TP, cartas).

- [x] 🔴 **T34 (A25)** ✅ feita pelo Fable Backup: export JSON completo em
      /admin/dev/backup + restore por upsert em ordem de FK com
      confirmação forte. Export primeiro (entrega valor sozinho);
      restore como sub-incremento separado, revisado.

## Regras pro agente executor

1. Uma task por vez, na ordem (dependências: T8→T9→T10; T11→T12→T13→T14;
   T26→T27→T28→T29). Marcar o checkbox aqui no arquivo ao concluir.
2. Migration nova SEMPRE validada 2x no Postgres local (idempotência)
   antes de commitar; avisar o usuário pra aplicar via /admin/dev/sql.
3. Não refatorar fora do escopo da task. Não renomear tabelas/rotas.
4. Testes: lógica pura nova vai pra `tests/*.test.ts` (harness próprio,
   sem framework).
5. Atualizar CLAUDE.md quando a task mudar modelo de dados ou telas
   descritas lá (uma linha, no estilo existente).

## Protocolo de verificação (obrigatório nas 🟡, recomendado nas 🟢)

1. `npm run build` e `npm test` verdes (sempre).
2. `npm run check 2>&1 | tail -1` — o nº de ERRORS não pode SUBIR em
   relação ao baseline antes da task (rodar antes e depois; hoje ~85,
   são erros pré-existentes de $types).
3. Migration: rodar 2x no Postgres local (`sudo -u postgres
   pg_ctlcluster 16 main start`; db `territ_test`) — a 2ª rodada prova
   idempotência. Obs: a migration 020 tem um bug conhecido local-only
   (ver histórico); replays completos usam workaround local, NUNCA
   editar o arquivo committado.
4. Simular o fluxo mentalmente ponta a ponta e listar no commit os
   caminhos NÃO testados (ex: "não testei com quadra sem geometria").
5. RLS/policies novas: escrever no commit qual role pode o quê, e
   conferir que actions server têm guard espelhando a policy.
6. Se algo do spec não bater com o código real (nome de coluna, rota,
   componente), PARAR e perguntar — não improvisar rename.

## Quando escalar (parar e chamar Fable/humano)

- Qualquer mudança não prevista em RLS, trigger ou função SQL.
- Alterar `service worker` / manifest / fluxo de push.
- Migração de dados (UPDATE em massa) fora do que o spec descreve.
- Refatoração que "parece necessária" mas não está no spec.
- Dois builds quebrados seguidos na mesma task.
