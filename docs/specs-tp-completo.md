# Specs: TP completo — equipamentos, disponibilidade, relatórios, servo de publicações, push

**Documento de construção pra IA executora ("o pedreiro").** As migrations
(041–046) já estão escritas, revisadas e commitadas — o schema é FIXO. Sua
tarefa é construir o código (actions + UI) contra esse schema, incremento
por incremento, na ordem abaixo. Não altere as migrations já commitadas;
se um ajuste de schema for mesmo necessário, abra uma migration NOVA
(047+) e justifique.

## ⏯ Status
- ✅ Migrations `041`, `042`, `044`, `046`, `047`, `048` escritas + commitadas
  (aplicar via `/admin/dev/sql` na ordem, uma por incremento — NÃO aplicar
  todas de uma vez; cada incremento aplica a sua e testa).
- ✅ **TP-A concluído**: abas em `/admin/tp` + CRUD de tipos/peças/carrinhos
  (migration 041). Depois, o usuário mandou o PDF oficial de equipamentos
  (catálogo S-80-T) — isso gerou a **`047_tp_pecas_codigo.sql`** (campo
  `codigo`/mnemônico do JW Hub em tipo e peça, mesmo padrão de
  `publicacoes.codigo`) e a **`048_tp_equipamentos_seed.sql`** (seed real:
  5 tipos — Carrinho, Display Simples, Display Duplo, Quiosque, Mesa — e
  19 peças, transcritos do PDF). Aplicar 047 e depois 048 (nessa ordem,
  depois da 041) via `/admin/dev/sql`.
- ✅ **Pivô de arquitetura concluído (TP-F, substitui a antiga TP-C)**: o
  modelo de escala original — `tp_turnos` (grade fixa dia/hora/vagas) +
  `tp_escala` (inscrição num turno numa data) — foi **substituído
  inteiramente** pelo modelo carrinho-centrico: `tp_agendamentos` (schema
  reescrito na migration `043`, incluindo a correção `ponto_id ... on
  delete restrict` pra não violar o `check (num_nonnulls(ponto_id,
  ponto_avulso) = 1)`) + `tp_agendamento_excecoes` +
  `tp_agendamento_participantes` (sem capacidade fixa), com a função pura
  `ocorrenciasAgendamentoEntre` + `ocorrenciaConflitante` em
  `$lib/tp-agendamentos.ts` (recorrência nenhuma/diária/semanal/
  quinzenal/mensal, exceção por ocorrência, detecção de conflito de
  equipamento — 17 testes em `tests/tp-agendamentos.test.ts`).
  `tp_turnos`/`tp_escala` foram **removidas do código** (estavam sem dado
  real cadastrado, confirmado pelo usuário): os 3 arquivos de rota
  (`admin/tp`, `publicador/arranjo`, `publicador` home) + `$lib/arranjos.ts`
  (`ocorrenciasTurnoEntre`/`TurnoBase` removidos) + os 2 testes antigos
  foram todos migrados pro novo modelo. `/admin/tp` virou 5 rotas
  (Planner/Visão geral/Pontos/Equipamentos/Publicadores) com navegação
  compartilhada (`TpNav.svelte` — sidebar no desktop, `BottomSheet` no
  mobile). Detalhes completos na seção **TP-F** abaixo.
- ✅ **Planner virou grade semanal de verdade** (pós-TP-F, mesmo incremento
  de UI): a lista de ocorrências da semana virou uma grade dias×horas
  (`TpGradeSemana.svelte`) — clicar/arrastar um horário vazio cria
  agendamento, arrastar a borda de um card ajusta início/fim direto (sem
  abrir sheet). Chips de equipamento viraram filtro multi-seleção (antes
  era single-select) — com vários marcados, os agendamentos aparecem
  sobrepostos na mesma grade, cada um com a cor do seu carrinho. Mês
  continua como lista.
- ✅ **TP-B concluído**: seção "Testemunho público" em `/perfil` —
  checkbox de transporte + notas (`tp_preferencias`) e janelas de
  disponibilidade dia/hora com adicionar/remover inline
  (`tp_disponibilidade`). Atalho "Informe sua disponibilidade →" no topo
  de `/publicador/arranjo` quando o publicador ainda não cadastrou
  nenhuma janela (só aparece se já existe equipamento cadastrado).
  `/admin/tp/publicadores` e o badge "disponível" do Designar no Planner
  passam a ter dado real.
- ✅ **P-A concluído**, com um desvio deliberado do path do spec: a rota
  ficou em **`/publicacoes`** (top-level), não `/admin/publicacoes` como
  descrito abaixo. Motivo: `/admin/*` é 100% admin-only via
  `src/routes/admin/+layout.server.ts` (`exigirRole(locals, ['admin'])`),
  que roda pra QUALQUER rota aninhada ali — não dava pra abrir uma
  exceção só pra essa rota sem SvelteKit's layout reset (`+page@.svelte`),
  um recurso avançado que o app não usa em nenhum outro lugar (risco de
  misconfiguration sem conseguir testar num browser real aqui). Ficando
  fora de `/admin/*`, a rota já nasce sem esse guard e usa o próprio
  `exigirServoPub` (admin OU `servo_publicacoes`) — resolve exatamente o
  requisito ("servo não-admin acessa direto") sem risco de routing.
  Admin chega por ela pelo drawer (`/admin/publicacoes` citado abaixo lê-se
  como `/publicacoes`); servo não-admin, pelo card na home. Suprimento de
  campanha ficou como link pra `/admin/campanha` (só aparece pro admin —
  um servo não-admin não consegue seguir esse link hoje, mesma razão de
  layout; ficou registrado como limitação conhecida, não escondido).
- ⏳ Código (actions/telas): incrementos TP-D, TP-E, PUSH-A a construir.

## Regras inegociáveis (CLAUDE.md — o que morde)
- **Svelte 5 runes**: em `$effect` leia as deps ANTES de qualquer
  early-return. Pra `Set`/`Map`, derive key primitiva.
- **Defesa em profundidade**: TODA action restrita checa
  `locals.profile?.role` (ou o guard) no início, além da RLS. Sucesso falso
  é bug (uma escrita bloqueada por RLS retorna sucesso silencioso).
- **Datas** `date`: nunca `new Date("yyyy-mm-dd")` — some `T12:00:00`. Use
  `diasDesde()`/helpers de `$lib/utils/data.ts`.
- **Zero emoji na UI** — componente `Icon` (lucide, prop `spin` pra loading).
  Emoji só em marcador de mapa.
- **`Icon` com loading**: use `spin={condição}` — NUNCA
  `class={cond && 'animate-spin'}` (perde o `inline-block` base e quebra
  linha; foi um bug real).
- **`selectAll`** em query de tabela grande.
- **`window.toast`/`toast.*`** em vez de `alert()`. `BottomSheet` pra modais.
- **Loading state** em toda ação assíncrona (`Button loading=` ou `spin`).
- Cada incremento: aplica migration → `npm run build` verde → `npm test`
  verde → commit → push pra `main` → **usuário testa antes do próximo**.

## Superfície existente a reusar (não recriar)
- `src/lib/arranjos.ts`: `rangeDoPeriodo`, `DIAS_SEMANA`, `DIAS_ORDENADOS`
  seguem válidos e reusáveis. **`ocorrenciasTurnoEntre` NÃO é a base do
  TP-F** — ela expande recorrência semanal fixa sem exceção por data, e é
  usada por `arranjos` (outro domínio, não mexe). O TP-F precisa de uma
  função nova, `ocorrenciasAgendamentoEntre` (ver TP-F), com recorrência
  mais rica (diária/quinzenal/mensal) + tabela de exceções — não dá pra
  só estender a função existente sem quebrar o contrato dela.
- `src/lib/server/guards.ts`: `exigirRole(locals, roles[])`. Crie
  `exigirServoPub` no mesmo padrão (admin OU `profile.servo_publicacoes`).
- `src/lib/server/supabase-admin.ts`: `supabaseAdmin` (service role) — já
  existe. É o que o push usa pra ler subscriptions alheias.
- `src/lib/ui/`: `BottomSheet`, `Button`, `Card`, `Icon`, `toast`.
- Padrão GPS "Usar minha localização": `src/routes/admin/tp/+page.svelte`
  (`usarMinhaLocalizacao`) e `AdicionarLocalSheet.svelte`.
- `MapaAdmin.svelte`: tem `onClick` com `lngLat` → base pra "clicar no mapa
  pra posicionar pin" (se o usuário pedir; v1 usa GPS + lat/lng).
- Padrão prédio-pendente: `locais.pendente` criado pelo publicador →
  validado em `/admin/predios`. TP-E copia esse fluxo.
- `/admin/poligonos`: padrão de **abas/modos** numa tela — ainda válido
  como referência de código (seletor de aba com `$state`), mas **não** é
  mais o modelo de navegação do `/admin/tp` (ver TP-F: o usuário pediu
  navegação por seções, não abas no topo de uma tela só).

---

## TP-A — Equipamentos (carrinhos) · migrations 041, 047, 048 · ✅ CONCLUÍDO
**Tabelas**: `tp_carrinho_tipos`, `tp_pecas_catalogo` (categoria
fisica/literatura, `publicacao_id` opcional), `tp_carrinhos` (tipo_id,
guardado_em, custodia_id, status disponivel/manutencao/aposentado). A
`047` adicionou `codigo` (mnemônico do JW Hub) em tipo e peça — mesmo
padrão de `publicacoes.codigo`. Preço/dimensões do PDF ficaram de fora de
propósito: mudam com o tempo e o app não tem controle financeiro em
lugar nenhum; o preço atual mora no JW Hub.

**Nomenclatura**: as tabelas se chamam `tp_carrinho(s)_tipos` (nome
herdado de quando só existia "carrinho" no vocabulário), mas o catálogo
real inclui Display, Quiosque e Mesa — não só carrinho literal. Decisão:
**não renomear o schema** (custaria uma migration de rename + tocar em
todo o código já commitado, só por estética); o rótulo visível na UI já
foi trocado de "Carrinhos" pra "Equipamentos" (zero custo, resolve a
confusão visual). Internamente "carrinho" é o termo guarda-chuva pros 5
tipos de equipamento, como já é de praxe entre publicadores.

**UI** — `/admin/tp` vira **abas**: `Escala | Pontos | Equipamentos`.
Refatore o `+page.svelte` atual (que só tem a grade) pra um seletor de aba
(`let aba = $state<'escala'|'pontos'|'equip'>('escala')`) reusando o
conteúdo atual na aba Escala e a lista de pontos na aba Pontos.
Aba **Equipamentos**:
- Lista de carrinhos (Card por carrinho: nome, tipo, status badge,
  "guardado em", custódia com nome do publicador). Botão editar → sheet.
- Sheet carrinho: nome, select de tipo, guardado_em, select custódia
  (publicadores), select status, notas.
- Seção "Tipos & peças": lista de tipos; ao abrir um tipo, lista as peças
  (nome, categoria, publicação vinculada se literatura, ordem). Sheets pra
  criar/editar tipo e peça.

**Server** (originalmente `/admin/tp/+page.server.ts`, **movido** pro TP-F
pra `/admin/tp/equipamentos/+page.server.ts`): guard admin. Load traz
tipos, peças, carrinhos (join custódia→nome). Actions:
`criarTipo`/`atualizarTipo`/`apagarTipo`, `criarPeca`/`atualizarPeca`/
`apagarPeca`, `criarCarrinho`/`atualizarCarrinho`/`apagarCarrinho`.

**Seed**: ✅ pronto em `048_tp_equipamentos_seed.sql` — 5 tipos (Carrinho de
publicações, Display Simples, Display Duplo, Quiosque, Mesa) transcritos
do PDF oficial S-80-T, com 19 peças (físicas + literatura) e os
mnemônicos reais do JW Hub. É seed de dado (não idempotente) — rodar uma
vez; ajustes depois pela própria UI.

**Verificado**: build + testes verdes. Conferência funcional dos 5 tipos
+ 19 peças fica pro usuário depois de aplicar 047+048 no `/admin/dev/sql`.

**✅ Addendum pós-TP-F (concluído)**: a navegação por abas (`Escala |
Pontos | Equipamentos`) dentro de uma única `/admin/tp/+page.svelte` foi
substituída pela navegação em 5 seções do TP-F (Planner / Visão geral /
Pontos / Equipamentos / Publicadores, cada uma sua própria rota — ver
TP-F). O CRUD de tipos/peças/carrinhos construído aqui não teve a lógica
retrabalhada — só mudou de arquivo (da aba "Equipamentos" de uma página
só pra `/admin/tp/equipamentos/+page.server.ts`/`.svelte`), ganhando
também o campo `cor` do carrinho (necessário pra Visão geral).

## TP-B — Disponibilidade + transporte · migration 042 · ✅ CONCLUÍDO
**Tabelas**: `tp_preferencias` (transporta_carrinho, notas),
`tp_disponibilidade` (janelas dia_semana/hora).

**UI** — nova seção "Testemunho público" em **`/perfil`**:
- Checkbox "Consigo levar o carrinho até o ponto" (→ `tp_preferencias`).
- Lista de janelas de disponibilidade (dia da semana + hora início/fim),
  com adicionar/remover inline.
- Atalho na Agenda (`/publicador/arranjo`), no card/topo de TP: "Informe
  sua disponibilidade →" apontando pra `/perfil`.

**Server** (`/perfil/+page.server.ts`): actions
`salvarPreferenciasTp` (upsert em `tp_preferencias`),
`adicionarDisponibilidade`, `removerDisponibilidade`. Guard: login (RLS já
restringe ao próprio).

**Verificar**: publicador marca transporta + 2 janelas; recarrega e
persiste; admin consegue ler (será usado no TP-C).

## TP-F — Agendamentos (carrinho é o calendário) · migration 043 · SUBSTITUI TP-C · ✅ CONCLUÍDO
**Pivô de arquitetura, não ajuste fino** (motivo completo no cabeçalho da
migration `043_tp_agendamentos.sql`). O modelo antigo — ponto fixo +
grade semanal de turnos (`tp_turnos`) + inscrição (`tp_escala`), com
`vagas` fixas — vira: **carrinho (equipamento) como calendário**, cada um
com sua própria agenda; "visão geral" sobrepõe todos os carrinhos
coloridos por `tp_carrinhos.cor`; agendamento tem recorrência tipo Google
Calendar; participação é sem teto.

**Schema** (`tp_agendamentos` / `tp_agendamento_excecoes` /
`tp_agendamento_participantes`, detalhado na migration):
- `tp_agendamentos`: carrinho_id + ponto (ponto_id fixo OU ponto_avulso
  texto livre — `num_nonnulls=1`) + data (primeira/única ocorrência) +
  hora_inicio/hora_fim + `recorrencia`
  (nenhuma/diaria/semanal/quinzenal/mensal) + `recorrencia_fim` opcional +
  `ativo` (soft-delete da série).
- `tp_agendamento_excecoes`: por `(agendamento_id, data)` — `cancelada`
  (some só aquele dia) OU campos de override (hora/carrinho/ponto/notas,
  null = herda do agendamento base). Editar/excluir "só esta ocorrência"
  grava aqui; "toda a série" mexe direto no `tp_agendamentos`.
- `tp_agendamento_participantes`: `(agendamento_id, data, publicador_id)`
  — **sem coluna de vaga/capacidade**, N publicadores por ocorrência.
  `origem` ('inscricao'|'designacao') + `designado_por`.

**`ocorrenciasAgendamentoEntre` (nova, `$lib/tp-agendamentos.ts`)** —
função pura, análoga a `ocorrenciasTurnoEntre` mas não reaproveitada dela
(recorrência mais rica + exceções):
- Entrada: `agendamentos[]`, `excecoes[]`, `isoIni`, `isoFim`.
- Expande cada agendamento ativo dentro do range conforme `recorrencia`:
  - `nenhuma`: só a `data`.
  - `diaria`: todo dia entre `data` e `recorrencia_fim` (ou fim do range).
  - `semanal`/`quinzenal`: mesmo dia da semana, passo de 7/14 dias.
  - `mensal`: mesmo dia do mês. **Edge case dia 29-31**: meses sem esse
    dia (fev, e abr/jun/set/nov pro dia 31) **pulam a ocorrência daquele
    mês** em vez de rolar pro próximo dia válido (comportamento mais
    prático pra escala de TP do que "vaza" pro dia 1 do mês seguinte;
    documentar isso na UI de criar agendamento mensal).
- Pra cada ocorrência gerada, aplica a exceção `(agendamento_id, data)`
  se existir: `cancelada=true` remove a ocorrência; senão, campos
  não-nulos da exceção sobrescrevem os do agendamento base (coalesce).
- Retorna ocorrências concretas `{agendamento_id, data, carrinho_id,
  ponto_id|ponto_avulso, hora_inicio, hora_fim, notas}` prontas pra
  renderizar e pra cruzar com `tp_agendamento_participantes`.

**Detecção de conflito de equipamento** (função pura também, mesmo
arquivo) — dado o `carrinho_id` e a ocorrência (data + [hora_inicio,
hora_fim)) que se está criando/editando, expande TODOS os agendamentos
ativos daquele carrinho no mesmo `data` (via `ocorrenciasAgendamentoEntre`
com range = só aquele dia) e rejeita se algum intervalo se sobrepuser ao
novo. Roda **na action** (server), não dá pra expressar como constraint
de banco (precisa expandir recorrência + aplicar exceções). Mensagem de
erro cita o outro agendamento (ponto + horário) que colide.

**Navegação — tensão sidebar vs. mobile-first (resolvida)**: o pedido foi
"sidebar com poucos itens: Planner / Visão geral / Pontos / Equipamentos
/ Publicadores", rejeitando abas no topo e menu grande. O app inteiro é
mobile-first e não tem sidebar persistente em nenhuma outra tela — criar
uma só pro TP quebraria a convenção e não funciona em tela de celular.
Resolução: 5 rotas próprias sob `/admin/tp/*` (não mais uma `+page.svelte`
com estado de aba):
- `/admin/tp` (Planner — agenda semanal/mensal **por carrinho
  selecionado**, um seletor de carrinho no topo).
- `/admin/tp/geral` (Visão geral — todos os carrinhos sobrepostos,
  coloridos por `cor`).
- `/admin/tp/pontos` (CRUD de pontos, já existia como aba — só muda de
  rota).
- `/admin/tp/equipamentos` (CRUD de tipos/peças/carrinhos, TP-A movido
  pra cá).
- `/admin/tp/publicadores` (nova — roster: lista de publicadores com
  disponibilidade cadastrada, ver TP-B, útil pro admin escalar).
No **desktop**, essas 5 aparecem como uma coluna estreita à esquerda
(sidebar de verdade, só dentro da seção `/admin/tp`) — satisfaz o pedido
literal. No **mobile** (viewport estreito), a mesma lista de 5 vira um
`BottomSheet`/dropdown compacto acionado por um botão no topo (não dá pra
manter sidebar fixa em tela pequena sem roubar espaço da agenda) — não é
"aba no topo" nem "menu grande", é o mesmo conjunto de 5 itens
reempacotado pro formato que cabe. Implementação: um componente
`TpNav.svelte` compartilhado pelas 5 rotas, com `md:` breakpoint do
Tailwind decidindo sidebar vs. sheet.

**Server** (ações por rota, implementado em `_shared.ts` +
`+page.server.ts` de cada rota):
- `/admin/tp/+page.server.ts` (Planner): load traz agendamentos do
  carrinho selecionado (via `?carrinho=`) + ocorrências expandidas da
  janela visível (`?periodo=semana|mes`). Actions: `criarAgendamento`,
  `atualizarAgendamento` (parâmetro `aplicar_a: 'ocorrencia'|'serie'` →
  grava em `tp_agendamento_excecoes` ou no `tp_agendamentos` conforme
  escolha), `cancelarOcorrencia`, `arquivarAgendamento` (soft:
  `ativo=false`), `apagarAgendamentoDefinitivo` (hard delete, bloqueado
  com mensagem amigável se houver relatório vinculado — TP-D),
  `designarParticipante`/`removerParticipante`. Conflito checado
  expandindo TODAS as ocorrências futuras da série candidata (não só a
  primeira data) antes de criar/editar. **Push (PUSH-A) ainda não
  existe** — quando entrar, disparar em `designarParticipante`.
- `/admin/tp/geral/+page.server.ts`: load traz ocorrências expandidas de
  TODOS os carrinhos ativos na janela visível (`?periodo=semana|mes`).
- `/publicador/arranjo/+page.server.ts`: load passa a trazer ocorrências
  de `tp_agendamentos` (via `ocorrenciasAgendamentoEntre`) em vez de
  `tp_turnos`/`tp_escala`; actions `inscreverAgendamento`/`sairAgendamento`
  substituem `inscreverTurno`/`sairTurno` (mesma regra: publicador só
  mexe em nome próprio, `origem='inscricao'`, sem checagem de vaga).
- `/publicador/+page.server.ts`: `meusAgendamentosTp` (era `meusTurnosTp`)
  troca o embed `tp_escala→tp_turnos→tp_pontos` por
  `tp_agendamento_participantes→tp_agendamentos→tp_pontos` (embed
  simples, sem `!inner` em `tp_pontos` — precisa aceitar ponto avulso
  null).

**UI admin (Planner)**: seletor de carrinho (chips coloridos) + toggle
semana/mês + lista de ocorrências por data, cada uma com ponto + horário
+ participantes (badge "designado" pra `origem='designacao'`). Botão
"Designar" abre sheet listando TODOS os publicadores, com badge
"disponível" pra quem tem `tp_disponibilidade` compatível com o dia/hora
(TP-B ainda não tem UI própria pro publicador cadastrar isso — a tabela
já existe e a lista só fica sem badges até lá; **não** filtra a lista a
publicadores compatíveis, só destaca, senão a função fica inutilizável
antes do TP-B existir). Criar/editar agendamento: form com recorrência
(select) + data fim opcional + ponto (select fixo ou checkbox "avulso" →
texto livre). Editar ocorrência recorrente pergunta "só esta ocorrência
ou toda a série" (radio); série ganha botões extras "Arquivar toda a
série" / "Excluir de vez".

**UI campo** (card na Agenda/`arranjo` e home): mostra ponto + horário +
quem mais vai; "Me inscrever" pra horário livre (sem teto — sempre
disponível, diferente do antigo "vagas esgotadas"); badge "designado"
quando aplicável.

**Testes puros** (`tests/tp-agendamentos.test.ts`, 17 testes — substituem
os 2 testes de `tp_turnos`/`tp_escala` removidos de
`tests/arranjos.test.ts`): expansão de recorrência
(nenhuma/diária/semanal/quinzenal/mensal, incluindo o edge case dia 31),
aplicação de exceção (cancelada + override de horário/ponto), e detecção
de conflito de carrinho (sobreposto, adjacente, carrinho diferente,
ignora o próprio agendamento, cruza recorrências diferentes).

**Verificado**: build + testes verdes (35 no total). Criar/editar/
cancelar agendamento, designar/remover participante, Visão geral e o
corte de `tp_turnos`/`tp_escala` do código de produção ficam pra
conferência funcional do usuário (sem acesso a Supabase real neste
ambiente) depois de aplicar a `043` (reescrita) e `045` (ajustada) via
`/admin/dev/sql`.

## P-A — Área do Servo de Publicações · migration 044 · ✅ CONCLUÍDO (rota real: `/publicacoes`, ver Status)
**Escopo confirmado (mais amplo que só TP)**: o servo de publicações NÃO
cuida só da literatura do carrinho/campanha — cuida de **qualquer
publicação da congregação** (ex: alguém pede uma Bíblia num idioma
específico, fora de qualquer contexto de TP/campanha). O admin (o
usuário) continua sendo quem monta os agendamentos do carrinho (TP-F);
`servo_publicacoes` é uma capacidade adicional e independente, não uma
substituição de papel. Por isso `/admin/publicacoes` fica fora do
namespace `/admin/tp/*` — é uma área própria, não uma aba de TP.

**Schema**: `profiles.servo_publicacoes`, `is_servo_pub()`,
`pedidos_publicacao`; policies de `publicacoes`/`campanha_suprimentos`
agora aceitam `is_servo_pub()`.

**Guard**: `exigirServoPub(locals)` em `guards.ts`.

**UI** — rota nova **`/admin/publicacoes`** (guard: admin OU
`servo_publicacoes`):
- Seção **Pedidos**: fila de `pedidos_publicacao` (filtro por status),
  cada um com publicador, publicação/descrição, qtd; botões
  aberto→pedido→entregue + campo `notas_servo`.
- Seção **Suprimento de campanha**: reusar os componentes/ações do
  `/admin/campanha` (catálogo + checklist). Extraia pra componente
  compartilhado se ficar limpo; senão, link "Gerenciar em Campanha →".
- Seção **Reposição**: chega no TP-D.

Entrada no **drawer admin** (`src/routes/+layout.svelte`, grupo
Administrar, ícone `inbox`). Pro servo NÃO-admin: card "Área do servo →" na
home do campo (`/publicador`), e o drawer não aparece (ele é role
publicador) — então o acesso dele é por esse card + link direto.

**Usuários**: checkbox "Servo de publicações" no editar-usuário de
`/admin/usuarios` (grava `profiles.servo_publicacoes`; a trigger
`profiles_guard_sensitive` já exige admin pra mudar isso).

**Campo**: card/sheet "Pedir publicação" na home (`/publicador`) — select
do catálogo OU texto livre + qtd → insere `pedidos_publicacao`.

**Verificar**: publicador pede "Bíblia em russo"; servo (não-admin, com
flag) abre `/admin/publicacoes`, marca entregue; publicador vê o status
mudar.

## TP-D — Relatório de fim de agendamento · migration 045
**Schema**: `tp_relatorios` (agendamento+data unique, FK
`tp_agendamentos` — ajustado na 045 durante o pivô TP-F), `tp_relatorio_itens`
(peca_id, estado ok/acabando/zerado/danificado, qtd_colocada, resolvido_*).

**UI campo** — no card do agendamento (Agenda e home), quando `data <=
hoje` e o publicador estava na ocorrência (inscrito/designado): botão
"Relatório do turno" → sheet com o checklist das peças do **tipo do
carrinho da ocorrência** (`carrinho_id` da ocorrência expandida —
`ocorrenciasAgendamentoEntre`, já resolve override de exceção — →
`tp_carrinhos.tipo_id` → `tp_pecas_catalogo`): físicas mostram
ok/danificado; literatura mostra ok/acabando/zerado + campo qtd colocada.
Notas gerais. Em campanha ativa, inclua a publicação principal
(`campanhas.publicacao_id`) no checklist.

**Server**: action `salvarRelatorio(agendamento_id, data, itens[], notas)`
— valida que o publicador estava na ocorrência (participante); upsert do
relatório + itens.

**UI servo** — seção "Reposição" em `/admin/publicacoes`: itens com
`resolvido_em is null` e estado ≠ ok, agrupados por carrinho/ponto; botão
"Resolvido" (grava resolvido_em/por). Card simples de tendência: soma de
`qtd_colocada` por publicação por mês.

**Verificar**: publicador relata "Sentinela zerada" + 5 colocações; item
aparece na Reposição; servo marca resolvido e some da fila.

## TP-E — Solicitar ponto na minha área · sem migration (colunas na 041)
**Server** (`/publicador/arranjo/+page.server.ts`): action `sugerirPonto`
(nome, endereco, lat, lng) → insere `tp_pontos` com `pendente=true,
ativo=false, criado_por=uid` (RLS `tp_pontos_sugerir` já permite).

**UI campo**: sheet "Sugerir ponto de TP" na Agenda (nome/endereço + GPS
"Usar minha localização", padrão do `/admin/tp`).

**UI admin** (aba Pontos do `/admin/tp`): badge "⏳ N pendentes"; cada
pendente com Aprovar (set `pendente=false, ativo=true`) / Recusar (apaga) —
padrão do validar-prédio de `/admin/predios`.

**Verificar**: publicador sugere ponto com GPS; admin aprova; ponto vira
ativo e aparece na lista normal.

## PUSH-A — Notificações (in-app + Web Push) · migration 046
**Schema**: `notificacoes` (fonte da verdade, alimenta o sino),
`push_subscriptions`.

**Arquitetura (siga à risca — é a parte não-óbvia):**
1. **`src/lib/server/push.ts`** — `criarNotificacao(publicadorIds[],
   {titulo, corpo, url})`: grava linhas em `notificacoes` via
   `supabaseAdmin` (bypassa RLS, permite notificar outros) e chama
   `enviarTickle(publicadorIds)`.
2. **`enviarTickle`**: lê `push_subscriptions` dos alvos (via
   `supabaseAdmin`), e pra cada endpoint faz `POST` **sem corpo** com header
   `Authorization: vapid t=<jwt>, k=<vapidPublicKeyBase64Url>` + `TTL`.
   O JWT é ES256 assinado com `VAPID_PRIVATE_KEY` via **WebCrypto**
   (`crypto.subtle.importKey`/`sign`) — a lib `web-push` do npm NÃO roda em
   Cloudflare Workers. Sem payload = sem criptografia aes128gcm (a parte
   difícil). Em falha do POST, `falhas++`; poda subscription com muitas
   falhas.
3. **`src/service-worker.ts`** — adicione listener `push`: ao receber (push
   vazio), `event.waitUntil(fetch('/api/notificacoes?nao_lidas=1',
   {credentials:'include'}))` → pega a mais recente → `showNotification`.
   Listener `notificationclick` → abre `notification.data.url`.
4. **`/api/notificacoes/+server.ts`** — GET (sessão) devolve notificações do
   usuário (`notificacoes` via `locals.supabase`, RLS filtra); POST marca
   lida. Rota autenticada por cookie (mesma origem — o SW fetch inclui
   credentials).
5. **Sino no header** (`src/routes/+layout.svelte`): ícone `bell` com badge
   de não-lidas; dropdown/sheet lista as notificações; clicar marca lida e
   navega pra `url`. **Este é o fallback universal** — funciona sem push.
6. **Registro** em `/perfil`: botão "Ativar notificações" (pede permissão
   via GESTO do usuário — obrigatório no iOS; iOS exige PWA instalado,
   16.4+) → `registration.pushManager.subscribe({userVisibleOnly:true,
   applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_PUBLIC_KEY)})`
   → POST da subscription (endpoint/p256dh/auth) pra gravar.

**Disparos v1** (transacionais, dentro das actions existentes):
- designação de território criada (`/admin` criarDesignacao,
  `/admin/predios` designarCartas) → publicadores designados.
- `designarParticipante` (TP-F) → publicador designado no agendamento.
- `pedidos_publicacao` mudou status (P-A) → solicitante.
- saiu de um agendamento nas próximas 48h (`sairAgendamento`, TP-F) →
  servo/admin.

**Env novas**: `PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (gerar par
VAPID; documentar no `.env.example` + `wrangler secret put`).
`SUPABASE_SERVICE_ROLE_KEY` já existe.

**Verificar**: em celular real com PWA instalado, ativar notificação no
`/perfil`; admin designa território → push chega e abre a tela certa. Sem
permissão concedida, o sino mostra a mesma notificação.

## PUSH-B — Lembrete agendado ("seu turno é amanhã") · v2, FORA deste plano
Precisa de cron (adapter-cloudflare não expõe scheduled handler). Caminho
futuro: pg_cron no Supabase + Edge Function. Só depois do PUSH-A provar a
infra.

---

## Fora do escopo v1 (não construir)
- Troca de turno entre publicadores (sai um / entra outro resolve).
- SMS / e-mail (push + in-app cobrem).
- Rotas móveis de carrinho (pontos fixos bastam).
- Aprovação prévia de publicador pra TP.
- Multi-congregação / escala metropolitana.

## Riscos / atenção
- **Corte do código velho (`tp_turnos`/`tp_escala`) — feito**: os 3
  arquivos de rota (`admin/tp`, `publicador/arranjo`,
  `publicador` home) + `$lib/arranjos.ts` (`ocorrenciasTurnoEntre`/
  `TurnoBase` removidos) + os 2 testes antigos de
  `tests/arranjos.test.ts` foram migrados pro modelo `tp_agendamentos`.
  Usuário confirmou que não havia dado real cadastrado. **Falta**:
  aplicar as migrations `043`/`045` no Supabase real via
  `/admin/dev/sql` e conferir na UI (não foi possível testar contra
  Supabase real neste ambiente — sem acesso de rede — só validado via
  Postgres local + build/testes).
- **Recorrência mensal, dia 29-31**: `ocorrenciasAgendamentoEntre` pula a
  ocorrência em meses sem aquele dia (não rola pro próximo dia válido).
  Documentar isso na UI de criar agendamento (texto de ajuda perto do
  select de recorrência) pra não parecer bug quando fevereiro "some" do
  agendamento do dia 30.
- **Sidebar vs. mobile-first**: o app não tem sidebar persistente em
  nenhuma outra tela; a solução (sidebar real só no desktop dentro de
  `/admin/tp/*`, vira sheet/dropdown no mobile) é uma exceção pontual —
  não usar esse padrão como precedente pra outras seções do app sem
  necessidade equivalente.
- **Conflito de carrinho**: a validação é na action (expande recorrência
  + exceções pra achar a ocorrência real do dia); a RLS não cobre isso.
  Cobrir com teste puro (`ocorrenciasAgendamentoEntre` + função de
  conflito).
- **iOS push**: só PWA instalado (16.4+) + gesto do usuário. Documentar no
  MANUAL.md quando o PUSH-A entrar.
- **SW fetch com sessão expirada**: `/api/notificacoes` pode dar 401 —
  tratar no SW (não mostrar notificação quebrada).
- **P-A muda policies da 037**: ao aplicar a 044, as policies de
  publicacoes/suprimentos são substituídas — reaplicar limpo no
  `/admin/dev/sql`.

## Docs a atualizar quando cada bloco entrar
- `CLAUDE.md`: mover as tabelas novas da seção "em construção" pro modelo
  de dados corrente conforme forem ganhando UI; listar `/admin/publicacoes`
  e as 5 rotas de `/admin/tp/*` (Planner, Visão geral, Pontos,
  Equipamentos, Publicadores) nas telas principais — substituindo a
  descrição antiga de abas numa página só.
- `docs/MANUAL.md`: seções de TP (disponibilidade, agendamentos/planner,
  relatório, sugerir ponto), área do servo, e o passo de ativar
  notificações (com a ressalva do iOS).
- `docs/CHANGELOG.md`: uma entrada por incremento.
