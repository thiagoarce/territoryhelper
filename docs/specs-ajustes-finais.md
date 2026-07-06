# Specs — Ajustes finais do app (rodada pós-auditoria)

> Escrito pra ser implementado por agente (Sonnet) em incrementos pequenos.
> Leia o CLAUDE.md antes. Workflow por incremento: migration validada →
> `npm run build` verde → `npm test` verde → commit → push pra `main`.
> Nunca alterar migration já aplicada — sempre criar uma nova.
> A ordem de execução e o tamanho de cada incremento estão em
> `docs/tasks-ajustes-finais.md`. Numeração de migrations começa em 057.
>
> Convenções que NÃO podem ser violadas: zero emoji na UI (só componente
> `Icon`; emoji apenas em marcador de mapa), `window.toast` (nunca
> alert), datas `yyyy-mm-dd` sempre com `T12:00:00` ao virar `Date`,
> "hoje" server-side via `hojeIsoBrasil()`, actions mutantes sempre
> auto-guardadas (`exigirAdminAction` / posse), queries grandes via
> `selectAll`.

---

## A1 — Agenda (publicador): remover "Quero participar"

O botão de interesse antecipado (`toggleInteresse`) não faz sentido no
fluxo real — participação vem por designação/parte, não por inscrição.

- Remover o botão e a função `toggleInteresse` de
  `src/routes/publicador/arranjo/+page.svelte` e a action
  `toggleInteresse` de `+page.server.ts`.
- NÃO remover a coluna `arranjos.interessados` nem o sort por
  interessado no sheet de repartir (casa-a-casa) — só deixa de ter
  entrada de dados; o campo morre naturalmente (limpeza futura).
- Aceite: aba Agenda sem o botão; build/test verdes.

## A2 — Casa a casa: card do dirigente ("Seu grupo")

Hoje clicar numa quadra do mapa "Seu grupo" abre o detalhe da quadra.
O dirigente não quer detalhe ali (detalhe é pra quem trabalha — Sua
parte / Território pessoal). O que ele quer em campo é **concluir** ou
**compartilhar**.

- Clique em quadra do mapa/chips de "Seu grupo" abre um `BottomSheet`
  de ação com: **Marcar concluída** (mesma action da tela da quadra,
  role dirigente/admin, com confirm) e **Compartilhar** (link público
  `/t/` já existente). Mostrar cobertura (X/Y endereços) no sheet.
- Mapas de "Sua parte" e "Território pessoal" continuam abrindo o
  detalhe da quadra (comportamento atual).
- **Finalizar designação com conferência**: o botão "Finalizar
  designação" (seção vermelha) passa a abrir um sheet listando as
  quadras da ocorrência com status (concluída neste ciclo ✓ / não
  concluída) e o texto "As não concluídas ficam livres pra outra
  designação". Confirmar executa o `finalizarArranjo` atual. Nada muda
  no backend — é só a UI de confirmação ficar explícita por quadra.
- Arquivos: `src/routes/publicador/casa-a-casa/+page.svelte` (+ action
  `concluirQuadra` nova no `+page.server.ts` — copiar a lógica de
  `publicador/quadra/[id]?/concluirQuadra`, com guard dirigente/admin e
  gravação em `quadras_conclusoes`).

## A3 — Densidade em DOIS tipos (endereços × residências)

Preciso de dois modos de densidade em todos os mapas que colorem por
densidade:

- **por endereço**: nº de `locais` na quadra (já existe —
  `contarLocaisPorQuadra` em `src/lib/server/queries.ts`);
- **por residências**: nº de `unidades` na quadra (um prédio de 40
  aptos pesa 40, não 1). Criar `contarResidenciasPorQuadra(supabase)`
  no queries.ts (locais→unidades, via `selectAll`, agrupar por
  `quadra_id`).
- `MapaAdmin.svelte` (mapa do admin/Geral): o modo "densidade" vira
  dois: `densidade_enderecos` e `densidade_residencias` (mesma escala
  de cor, só muda a métrica passada por quadra).
- `AdminMapa.svelte` (mapa do campo): ganhar os mesmos modos (ver A13).
- Aceite: /admin (Geral) e /publicador/mapa mostram os dois tipos.

## A4 — Home (Designações): tudo dentro de "Minhas designações"

Estrutura final da home (`src/routes/publicador/+page.svelte`), de cima
pra baixo:

1. Alerta "Finalize a designação" (como está).
2. Banner de campanha (como está).
3. **H1 "Minhas designações"** — e DENTRO desta seção, nesta ordem,
   como subseções com separadores:
   a. "Você dirige" (card atual, 1 arranjo + "+N outras");
   b. "Pregação em grupo — sua parte" (cards atuais);
   c. "Território pessoal" (separador + mapa mini + cards atuais);
   d. "Cartas designadas";
   e. "Territórios comerciais" (TCEs).
4. Turnos de TP (card teal, como está).
5. Card "Área do servo" (remover no A16) e card "Publicações" no final
   (como está).

É reordenação de template — mover os blocos pra dentro da seção, sem
mudar server. Manter abas Abertas/Concluídas dentro do Território
pessoal.

## A5 — Prédios: remover trava de posse pra EDITAR + curadoria

Publicadores estão acostumados a editar prédio sem trava; a divisão por
partes se prova sozinha com o tempo. **Editar overlay deixa de exigir
posse**; em compensação, TODA edição de publicador entra numa fila de
curadoria do admin (A6).

- Remover o check `podeEditarLocal` das actions de EDIÇÃO DE OVERLAY:
  `atualizarLocal` (em `/predio/[id]` e `/publicador/quadra/[id]`),
  `atualizarUnidade`, `uploadFoto`, `removerFoto`, `criarLocal` (a
  criação já era liberada com `pendente=true` em outras telas — manter
  o padrão), `excluirUnidade`/`excluirLocal` NÃO liberar: exclusão
  direta continua com posse; sem posse o publicador usa "não existe
  mais" (A7), que é reversível.
- **RLS**: `pode_editar_local` continua valendo pra
  registros/desfechos/cartas (trabalho), mas o UPDATE de overlay em
  `locais`/`unidades` precisa de uma policy mais aberta. Migration 057:
  policy de UPDATE em `locais` e `unidades` para `authenticated`
  restrita às colunas de overlay via trigger de guarda (ou função
  `pode_editar_overlay()` que retorna true pra qualquer autenticado
  ativo). Mais simples e seguro: criar RPC `editar_local_overlay(...)` /
  manter update direto mas com policy `using (auth.role() =
  'authenticated')` + trigger `bloqueia_colunas_criticas` que impede
  mudar `geo`, `quadra_id`, `logradouro`, `numero`, `tipo` sem ser
  admin. Escolher a via mais simples que passe nos testes locais.
- Desfechos/cartas continuam exigindo posse (nada muda).

## A6 — Curadoria de edições do publicador (admin)

O publicador edita e vale na hora ("temporário"); o admin **confirma**
(vira definitivo) ou **reverte** (volta ao estado anterior).

- Migration 057 (mesma do A5): tabela `curadoria_edicoes`:
  `id bigserial, local_id bigint, unidade_id bigint null, publicador_id
  uuid, tipo text check in ('edicao','criacao','nao_existe'),
  antes jsonb, depois jsonb, status text default 'pendente' check in
  ('pendente','confirmado','revertido'), criado_em timestamptz,
  resolvido_por uuid null, resolvido_em timestamptz null`. RLS: insert
  authenticated (o próprio), select/update admin (+ select do próprio).
- Nas actions de edição de overlay (A5): depois do UPDATE bem-sucedido,
  gravar uma linha com `antes` (snapshot dos campos alterados antes) e
  `depois`. Admin editando NÃO gera linha (já é curado).
- Tela admin: seção "Curadoria" — pode ser um bloco novo em
  `/admin/predios` (chip/aba) OU abaixo da Visão Geral em `/admin`
  (ver A24): lista pendentes agrupados por prédio, diff campo a campo,
  botões **Confirmar** e **Reverter** (reverter aplica `antes` de volta
  no registro e marca `revertido`).
- Aceite: publicador edita nome do prédio → aparece na curadoria →
  admin reverte → prédio volta ao nome antigo.

## A7 — Feedback de precisão: "não existe mais" + endereço aproximado

- Migration 057: coluna `locais.marcado_nao_existe boolean default
  false` (+ `marcado_por uuid null, marcado_em timestamptz null`).
- Na tela da quadra e do prédio: ação "Este endereço não existe mais"
  (menu/edit sheet). Marca a flag, gera linha na curadoria
  (`tipo='nao_existe'`). O local aparece esmaecido/riscado nas listas e
  SAI das contagens de progresso. Admin confirma (aí sim
  inativa/exclui de verdade, em Polígonos) ou reverte (volta ao normal).
- **Endereço aproximado ao criar local**: no form de criar endereço
  (`/publicador/quadra/[id]` e `/buscar`), depois de pegar GPS,
  pré-preencher `logradouro` e `numero` com o local mais próximo já
  cadastrado (haversine sobre `locais_geo` da mesma quadra — padrão de
  sort por proximidade já usado no app; number = do vizinho mais
  próximo, editável). Sem chamada externa de geocoding.

## A8 — Detalhe da quadra: ordem da lista

- **Inverter ordem**: botão (ícone `arrow-down-up` ou similar) no
  header da lista que inverte a ordem de exibição dos locais (sentido
  anti-horário). Só client-side (`$state` + `.toReversed()`).
- **Ajuste fino da ordem**: a ordem nem sempre corresponde à posição
  geográfica. Adicionar modo "reordenar" (admin e publicador): setinhas
  ▲▼ por local que ajustam um campo novo `locais.ordem_na_quadra int
  null` (migration 057). Ordenação da lista: `ordem_na_quadra` quando
  presente, senão a heurística atual. Edição gera linha de curadoria
  (`tipo='edicao'`, campo ordem) — admin confirma/reverte como o resto.
- **Comércios espalhados**: na lista do detalhamento da quadra os
  comércios aparecem soltos em vez de agrupados como na aba Prédios.
  Diagnóstico esperado: o agrupamento por local funciona pra
  tipo='predio' mas comércios com mesmo endereço são `locais` distintos
  (1 unidade cada). Corrigir agrupando visualmente por
  `logradouro+numero` (mesmo prédio físico): um card "galeria/prédio
  comercial" com os comércios dentro, igual à aba Prédios faz.

## A9 — Offline mínimo viável

Hoje sem internet o Safari mostra erro de página. Meta desta rodada
(não é offline total):

1. **App shell offline**: service worker (`static/sw.js` /
   `src/service-worker.ts` — ver o que o projeto já tem pro push) com
   precache do shell e fallback de navegação pra uma página `/offline`
   simpática ("Você está sem internet — o que já foi carregado continua
   disponível") em vez do erro do Safari.
2. **Cache de leitura**: runtime cache (stale-while-revalidate) das
   respostas de `load` das rotas do campo (`/publicador`,
   `/publicador/quadra/*`, `/predio/*`) via Cache API no SW — quem
   abriu uma quadra com internet consegue reabrir sem.
3. **Banner "sem conexão"**: no root layout, `$state` ligado aos
   eventos `online`/`offline` + banner fixo discreto. A fila de escrita
   offline (`src/lib/offline/`) já existe — o banner deve mostrar
   "N registros aguardando envio" quando a fila tiver itens.
- Aceite: modo avião → abrir o app instalado → home carrega do cache
  com banner; quadra já visitada abre; desfecho marcado entra na fila e
  sobe quando voltar a rede.

## A10 — Push: diagnóstico (app × Cloudflare)

O sino in-app funciona; o Web Push não. Roteiro de diagnóstico (fazer
ANTES de mexer em código):

1. **Runtime env**: no dashboard Cloudflare, `VAPID_PRIVATE_KEY` e
   `PUBLIC_VAPID_PUBLIC_KEY` precisam estar em **Settings → Variables
   and secrets** (runtime), NÃO em "Build". Já erramos isso uma vez.
   Conferir com um endpoint temporário de debug ou log em
   `enviarTickle` (`src/lib/server/push.ts` já loga "[enviarTickle]
   VAPID não configurado").
2. **Subscription no aparelho**: a tabela `push_subscriptions` estava
   vazia — o dispositivo nunca se inscreveu. No **iPhone, Web Push SÓ
   funciona com o app ADICIONADO À TELA DE INÍCIO** (PWA instalado,
   iOS 16.4+) e permissão concedida a partir de um gesto (o botão em
   `/perfil` já faz isso). Safari na aba NÃO recebe push. Testar:
   instalar na tela de início → abrir pelo ícone → /perfil → ativar →
   conferir linha em `push_subscriptions` → admin manda teste.
3. Se a subscription existe e o tickle não chega: logar o status HTTP
   da chamada ao endpoint APNs/FCM em `enviarTickle` e tratar 404/410
   (subscription morta → deletar linha).
- Entregável: relatório do ponto exato da falha + fix se for código.

## A11 — Login: recuperação de senha

- **Esqueci minha senha** no `/login`: como convite hoje é por link (via
  WhatsApp), seguir o mesmo caminho — SEM depender de SMTP:
  1. Publicador toca "Esqueci minha senha" → tela dizendo "peça ao
     admin um link de redefinição".
  2. **Admin** em `/admin/usuarios`: ação "Gerar link de redefinição"
     por usuário — cria um novo convite apontando pro `publicador_id`
     existente (reusar o fluxo `/convite/[token]`, que já define senha
     pra usuário existente). Admin manda o link pelo WhatsApp.
- Se o projeto tiver SMTP configurado no Supabase, adicionalmente
  habilitar `resetPasswordForEmail` + rota `/redefinir` — checar antes;
  se não tiver, só o fluxo por link do admin.
- Aceite: admin gera link pra usuário existente; usuário abre, define
  senha nova, loga.

## A12 — Publicações: sem "servo", revistas mensais e reposição por carrinho

**A12a — fim do `servo_publicacoes`.** Ou é admin, ou dirigente, ou
publicador. Remover: gate `exigirServoPub` (rota `/publicacoes` passa a
`exigirRole(['admin'])` no layout ou load), checkbox em
`/admin/usuarios`, card "Área do servo" na home, `is_servo_pub()` nas
policies que o usam (migration: recriar policies com `is_admin()`).
Manter a coluna no banco (inofensiva). Atualizar CLAUDE.md.

**A12b — revistas mensais (A Sentinela / Despertai!).** Tipo especial
de publicação com edição mensal:
- Migration: `publicacoes.periodicidade text null check in ('mensal')`
  + marcar as revistas; publicações mensais NÃO aparecem no catálogo de
  pedido especial do publicador.
- O que o publicador informa (card Publicações da home, substituindo os
  contadores atuais de revista): pra cada revista mensal, quantidade
  que precisa **pra público**, e flag **letras grandes** (A Sentinela
  edição de estudo: qtd própria + letras grandes). Modelar em
  `publicador_necessidade_regular`: adicionar colunas `variante text
  null check in ('publico','estudo')` e `letras_grandes boolean
  default false` (uma linha por publicação+variante).
- O que o servo/admin vê em `/publicacoes`: seção "Revistas do mês" —
  soma das necessidades por revista/variante/letras-grandes + campo de
  estoque atual + "quanto pedir" (= necessidade − estoque, editável).

**A12c — reposição = inventário POR CARRINHO.** A seção Reposição de
`/publicacoes` passa a ser organizada por carrinho (equipamento):
- Migration: `tp_carrinho_inventario` (`carrinho_id, publicacao_id
  null, descricao text null, qtd int, atualizado_em/por`) — o que TEM
  em cada carrinho (item + qtd).
- UI: um card por carrinho com a lista item+qtd (editável inline,
  padrão +/- da lista de controle) e, abaixo, os itens de relatório de
  turno ainda não resolvidos daquele carrinho (o que já existe hoje,
  reagrupado). O servo bate o olho e sabe como cada carrinho está
  suprido.

## A13 — Mapa geral (/publicador/mapa): modos de visualização

Adicionar ao mapa read-only do dirigente os modos do mapa do admin:
- Seletor de cor: **conclusão (recência)** (default atual), **por
  território**, **densidade por endereços**, **densidade por
  residências** (A3).
- Clique numa quadra abre popup de DETALHE (nome, território, última
  conclusão, nº endereços/residências) — sem ação nenhuma (concluir/
  designar só no admin).
- Implementar os modos em `AdminMapa.svelte` (prop `colorirPor`
  ampliada) pra reaproveitar em A2/A24. Cuidado com o anti-padrão
  MapLibre (`interpolate` fora de `match`).

## A14 — Preferência global de estilo de mapa (em /perfil)

- Migration: `profiles.pref_basemap text default 'positron' check in
  ('positron','liberty','bright')`.
- `/perfil`: seletor "Estilo do mapa" (cinza = positron, brilhante =
  liberty/bright com preview textual).
- Todos os componentes de mapa (`MapaAdmin`, `AdminMapa`,
  `MapaPoligonos`, `QuadraMap` se houver) leem a preferência (via
  `locals.profile` → prop, com fallback atual) e **removem o seletor
  local de basemap** das telas (Geral, Polígonos, etc.).

## A15 — Toggle "modo campo ↔ modo admin" no header

- Pra `role='admin'`: botão no header global (`src/routes/+layout.svelte`)
  que alterna entre `/admin` e `/publicador` (ícone `repeat` ou
  similar + rótulo curto). Sai do drawer o item "Modo campo" e o item
  "Perfil" (perfil já está no topo).

## A16 — (fundido no A12a)

## A17 — Campanha admin: suprimento vinculado ao estoque do catálogo

- `campanha_suprimentos.qtd_em_maos` deixa de ser digitado — passa a
  LER `publicacoes.qtd_estoque` (join no load; remover o input em
  `/admin/campanha`, mostrar read-only com link "ajustar no catálogo").
  Manter `qtd_necessaria`, `pedido_feito`, `notas`.

## A18 — Campanha publicador: tela rica

Reescrever `/publicador/campanha` (hoje: hero + objetivos):
1. Hero com progresso (já feito) + **mapa** das quadras do período
   (reaproveitar `AdminMapa` colorindo concluídas no período vs não —
   o admin/campanha já calcula `quadrasConcluidasNoPeriodo`; expor um
   load equivalente ao publicador).
2. Gráfico semanal simples (barras por semana — copiar o cálculo
   `conclusoesSemana` de `/admin/campanha/+page.server.ts`).
3. Metas e objetivos (seção atual).
4. **Metas pessoais**: migration `campanha_metas_pessoais`
  (`campanha_id, publicador_id, texto text, feito boolean default
  false`) — publicador cria/marca/apaga as próprias metas (RLS own).
5. **"Minha colaboração"**: card calculado com a atividade do próprio
   publicador no período da campanha: nº de desfechos que registrou
   (`registros` por `publicador_id` no período, por tipo), cartas
   escritas (`unidades.carta_escrita_por` + data no período) e
   entregues (registros tipo='carta'). Texto compartilhável.

## A19 — Ciclo de cartas: POR PRÉDIO (corrige o modelo global)

O ciclo global (migration 056) foi um passo intermediário — o certo é
por prédio (cada prédio recomeça quando fizer sentido pra ele).

- Migration 057/058: `cartas_ciclos` ganha `local_id bigint null
  references locais(id) on delete cascade`. Linhas antigas (globais,
  `local_id null`) continuam valendo como corte GLOBAL mínimo
  (compatibilidade); ciclo efetivo de um prédio = `max(iniciado_em)`
  entre o global e os ciclos daquele `local_id`.
- `cicloCartasAtual(supabase)` → `cicloCartasPorLocal(supabase,
  localIds?)` devolvendo `Map<localId, iniciado_em>` (+ o global). Os
  call-sites (predio/[id], cartas/[token], listarPredios,
  carregarPredioDetalhado, home) passam a usar o corte do prédio.
- RPC `carta_publica_toggle`: considerar o ciclo do local (max global ×
  local) — nova migration recria a função.
- UI: **remover o card global** de `/admin/predios`; botão "Iniciar
  novo ciclo de cartas" passa pro header do `/predio/[id]` (admin only)
  e/ou menu do prédio em `/admin/predios`, mostrando "ciclo desde
  <data> · <quem>" pequeno.
- `$lib/ciclos.ts` não muda (o helper já recebe o início como
  parâmetro); testes continuam valendo.

## A20 — Polígonos: Auditar útil + sem seletor de mapa

- Seletor de basemap sai (A14).
- Modo **Auditar** reformulado pra ser acionável, com 3 listas:
  1. **Endereços sem face** (`locais.face_ibge is null`) — ação:
     focar no mapa + atribuir face/quadra;
  2. **Quadras sem endereço** (0 locais) — ação: focar + link juntar/
     excluir;
  3. **Múltiplos clusters na mesma quadra** (já detecta) — ações de
     resolução: **unificar clusters** (aceitar como uma quadra só) e
     **ver endereços das quadras vizinhas** (destacar no mapa os locais
     das quadras adjacentes pra checar se o cluster pertence à vizinha;
     mover local de quadra já existe no modo Vincular).

## A21 — TCE: virar designação de verdade

Hoje o TCE criado não vai a lugar nenhum. Modelo alvo:

1. **Representação**: parar de desenhar o convex hull cortando quadras.
   TCE passa a ser destacado pelas **quadras que contêm suas unidades**
   (highlight das quadras + contorno) — derivável de
   `tce_unidades → unidades → locais.quadra_id`, sem migration de
   geometria (manter `poly` legado, ignorar na UI).
2. **Filtro "TCEs" na tela Geral** (`/admin`): modo que esconde o resto
   e mostra os TCEs (pelas quadras que os contêm), com painel lateral
   listando-os (status, designado, prazo).
3. **Designável como território**:
   - a **arranjo**: `arranjos.tce_id` já existe (single). Migration:
     `arranjos.tces_ids text[] default '{}'` (migrar `tce_id` pra
     dentro, manter coluna legada até limpeza).
   - a **território pessoal**: `designacoes` ganham TCEs via nova N:N
     `designacao_tces (designacao_id, tce_id)`.
   - `arranjo_partes.tces_ids text[]` — dirigente reparte TCEs entre
     publicadores como faz com quadras.
4. Home/carteira e casa-a-casa mostram TCEs designados dentro das
   seções (a home já lista TCEs com `publicador_id` direto — migrar a
   exibição pra via `designacao_tces`; manter `tces.publicador_id`
   funcionando em paralelo até limpeza).
5. Fases no tasks.md — é o item mais estrutural; fase 1 = filtro +
   designação a arranjo; fase 2 = designação pessoal + partes.

## A22 — TP: redesign do fluxo mensal (o maior item)

### Conceito
Três fases por mês, controladas pelo admin ("abrir/fechar o
calendário"):
1. **Disponibilidade** — publicador marca, num mini-calendário DO MÊS,
   os DIAS e HORÁRIOS em que está disponível (não mais "costumo estar
   disponível" semanal). Pré-preencher com o padrão semanal antigo se
   existir, editável dia a dia.
2. **Montagem** — admin monta os arranjos (turnos) manual ou
   automaticamente (algoritmo abaixo).
3. **Publicado** — publicador vê a grade do mês com os turnos onde FOI
   DESIGNADO e responde **Aceitar / Recusar**. Nos horários que
   SOBRARAM (sem turno), pode **pedir reserva**: cria um turno próprio
   escolhendo equipamento disponível + convidando outros publicadores.
   "Me inscrever" numa lista morre — ou você é designado e aceita, ou
   reserva uma sobra.

### Modelo de dados (migrations)
- `tp_meses` (`mes text 'YYYY-MM' pk, fase text check in
  ('disponibilidade','montagem','publicado','fechado'), atualizado_por,
  atualizado_em`). Admin transiciona a fase em `/admin/tp`.
- `tp_disponibilidade_mes` (`publicador_id, mes, dia date, hora_inicio,
  hora_fim`) — substitui o uso de `tp_disponibilidade` semanal
  (que vira só template de pré-preenchimento) e de
  `tp_disponibilidade_confirmacoes` (a existência de linhas no mês JÁ É
  a confirmação — remover o banner/União de confirmação).
- `tp_agendamento_participantes` ganha `status text default 'designado'
  check in ('designado','aceito','recusado')`.
- Reserva: `tp_agendamentos` ganha `origem text default 'admin' check
  in ('admin','reserva')` + `criado_por`. Reserva de publicador cria
  agendamento pontual (`recorrencia='nenhuma'`) com participantes
  já em status 'designado' (convidados aceitam igual).

### UI publicador (`/publicador/tp`)
- Fase disponibilidade: modal atual vira "Disponível em <mês>" com
  mini-calendário do mês (grid que já existe) — tap no dia abre
  horários em chips de faixas de 2h **e** dois inputs `type="time"` pra
  quem quiser digitar o horário exato (as faixas só pré-preenchem os
  inputs). Tirar textos "costumo estar disponível".
- Fase publicado: **grade** (não lista): mobile retrato = coluna por
  dia (navegação por dia/dias-da-semana), paisagem/desktop = grade
  semanal/mensal (adaptar `TpGradeSemana.svelte`, que já desenha grade
  com cores por equipamento). Cada célula: turno designado (cor do
  equipamento; badge "aceitar/recusar" se pendente), turno de outros
  (neutro), **sobra** (célula vazia clicável → sheet de reserva:
  escolher tipo de equipamento COM equipamento cadastrado e livre
  naquele horário, convidar publicadores, confirmar). A reserva só é
  válida com o conjunto completo: equipamento livre + ponto + só
  publicadores **aprovados** (ver "Aprovação" abaixo) — o sheet não
  deixa confirmar sem isso.
- Relatório de turno (TP-D) continua como está (botão no turno passado
  em que participou).

### Aprovação de publicador pra carrinho
Nem todo publicador é aprovado pro testemunho público. As listas de
publicador em TODO o fluxo de TP (montagem automática/manual, convites
de reserva, designação) só mostram os aprovados.
- Migration: `profiles.tp_aprovado boolean not null default false`
  (fica em profiles porque é o ADMIN que concede — RLS de profiles já
  é admin-managed; `tp_preferencias` é do próprio publicador, não
  serve).
- `/admin/tp/publicadores` (o roster read-only) ganha a função: toggle
  "Aprovado" por publicador (action admin-guarded) + a coluna no
  roster. Vira a "aba de publicadores aprovados".
- Publicador NÃO aprovado ainda marca disponibilidade normalmente (o
  admin pode aprovar depois) — mas não aparece pra
  montagem/reserva/designação enquanto não aprovado.

### UI admin (`/admin/tp`)
- Controle de fase do mês (abrir disponibilidade → montar → publicar →
  fechar).
- Painel de disponibilidades do mês (quem marcou o quê — matriz
  dia×publicador).
- Ver reservas pedidas (aprovar/cancelar — reserva nasce ativa mas
  admin pode cancelar; decidir simples: nasce ativa).
- **Algoritmo de montagem automática** (`$lib/tp-montagem.ts`, puro e
  testável): entrada = disponibilidades do mês + turnos-alvo (pontos ×
  horários que o admin define ou herda do mês anterior) + equipamentos;
  saída = designações propostas. Heurística: (a) preencher cada turno
  com 2–3 pessoas por carrinho (3–5 quando dois equipamentos no mesmo
  ponto/horário; combinações carrinho+display valem); (b) pelo menos 1
  pessoa com `transporta_carrinho` por turno; (c) balancear carga
  (quem tem menos turnos no mês entra primeiro); (d) nunca designar
  fora da disponibilidade. Admin revisa a proposta e publica (aí viram
  `tp_agendamento_participantes` status 'designado' + notificação).
- Notificações (`criarNotificacao`): designado ao publicar; lembrete de
  aceite pendente; convite de reserva.

## A23 — (fundido no A13/A14)

## A24 — Tela Geral (admin): limpeza

- Remover o botão/sheet "Designações" da Geral (o hub
  `/admin/designacoes` já cobre; manter as ações de mapa multi-seleção
  de designar/anexar que são o diferencial ESPACIAL da tela — o que sai
  é a LISTA de designações duplicada).
- Seletor de basemap sai (A14).
- Modos de cor: **fundir "status" e "idade da conclusão"** num modo só
  "conclusão" (status ≠ inativa é derivado da data de conclusão mesmo;
  inativa continua cinza nesse modo). Adicionar densidade por
  residências (A3). Resultado: conclusão · território · densidade
  endereços · densidade residências.
- **Popup atrapalhando seleção**: no modo multi-seleção, o popup de
  detalhe não deve abrir em cada tap. Solução: popup só em long-press
  (tap = seleciona), ou um painel fixo pequeno no rodapé mostrando a
  última quadra tocada. Escolher a opção mais simples no MapLibre sem
  quebrar o long-press existente (histórico de conclusão).
- **Abaixo da Visão Geral**: bloco "Feedback do campo" com os itens de
  curadoria pendentes (A6: inserções, edições, não-existe) com link pra
  efetivar em Polígonos/curadoria.

## A25 — Backup: exportar tudo + restaurar

O dado da congregação só existe no Supabase. Precisamos de export
completo e de um caminho de restauração.

- **Export**: página `/admin/dev/backup` (admin-only, fora da bottom
  nav): botão "Exportar backup" gera um JSON com TODAS as tabelas de
  dados (profiles sem campos de auth, territorios, quadras,
  quadras_conclusoes, locais, unidades, registros, designacoes + N:N,
  arranjos, arranjo_partes, tces, tce_unidades, cartas_*, campanha*,
  publicacoes, pedidos_publicacao, publicacao_controle,
  publicador_necessidade_regular, tp_*, notificacoes NÃO — é
  descartável). Server lê via `selectAll` + `supabaseAdmin` (algumas
  tabelas são RLS-fechadas), monta `{ versao, gerado_em, tabelas: {...} }`
  e devolve como download. Geometrias exportadas como GeoJSON (usar as
  views `*_geo`).
- **Restore**: na mesma página, upload do JSON + confirmação digitando
  "RESTAURAR". Estratégia: **upsert por id, na ordem de FKs**
  (territorios → quadras → locais → unidades → registros → ...), sem
  deletar nada que não esteja no arquivo (restore é "recuperar", não
  "espelhar"). Geometria reconvertida via `ST_GeomFromGeoJSON` (RPC).
  Processar em lotes de 500 (limite de payload do Workers ~100MB —
  se o arquivo for grande, aceitar upload por tabela).
- Risco alto: task marcada pra execução com revisão reforçada.

## A26 — Transferir dirigência em série

Dirigente de férias: hoje é editar arranjo por arranjo.
- Em `/admin/arranjos`: ação "Transferir dirigência" — escolhe
  dirigente A, dirigente B e um período (default: tudo futuro); um
  UPDATE em `arranjos` (`dirigente_id A→B` nas ocorrências ativas com
  `data >= hoje` do período). Confirm com contagem ("7 designações de
  X serão transferidas pra Y"). Notificar B (`criarNotificacao`).
- O próprio dirigente NÃO transfere (só admin) — evita surpresas.

## A27 — Histórico do publicador (admin)

Em `/admin/usuarios`, expandir um usuário mostra um resumo de
atividade: quadras que trabalhou (registros por publicador_id — count
por mês, últimos 6 meses), conclusões que marcou (quadras_conclusoes),
turnos de TP no mês (tp_agendamento_participantes), cartas escritas
(unidades.carta_escrita_por). Read-only, um card compacto — serve pro
admin acompanhar e pro algoritmo de TP ser justo no futuro.

---

## Decisões confirmadas pelo usuário (06/07/2026)

1. **A5/RLS**: liberar edição de overlay pra qualquer autenticado — OK
   (mitigada pela curadoria + trilha).
2. **A22 reserva**: nasce valendo, admin pode cancelar — OK, DESDE QUE
   completa (equipamento + ponto + publicadores aprovados).
3. **A22 disponibilidade**: faixas de 2h — OK, mantendo inputs de
   horário exato digitável.
4. **A12b**: publicador informa quantidade da edição de estudo também
   (com letras grandes) — OK.
5. **A11**: recuperação de senha por link gerado pelo admin — OK.
6. Novos aceitos: A25 (backup export+restore), A26 (transferir
   dirigência), A27 (histórico do publicador), aprovação de publicador
   pra carrinho (dentro do A22).
