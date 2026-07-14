# CLAUDE.md — Guia para agentes IA neste repo

App PWA de gestão de territórios JW. **SvelteKit 2 + Svelte 5 (runes)**,
**Tailwind 3**, **Supabase** (Postgres + Auth + RLS + Storage + Realtime),
**MapLibre GL + OpenFreeMap** (tiles vetoriais grátis), deploy em
**Cloudflare Workers**. O app antigo em Google Apps Script foi 100% portado
e arquivado (tag/branch `v1-google-apps-script` no git).

## Layout de arquivos

- `src/routes/` — páginas SvelteKit (`+page.svelte` UI, `+page.server.ts`
  load + actions). Só 2 modos (specs.md revisado): **admin** e **campo**.
  - `admin/` — Geral (`/admin`, com concluir/reverter/histórico de
    conclusão — Registro foi fundido aqui), `poligonos`, `predios`
    (com Trabalhar + GPS + Designar cartas), `campanha`, `arranjos`,
    `tp`, `designacoes`, `usuarios`, `auditoria`, `dev/sql`,
    `dev/backup` (export JSON de todas as tabelas + restore por upsert)
  - `publicador/` — modo campo (**tanto publicador quanto dirigente**):
    home/carteira (território pessoal + ✉ cartas + pregação em grupo via
    `arranjo_partes` + TCEs), `quadra/[id]` (com "Marcar concluída" se
    dirigente), `mapa` (visão geral READ-ONLY do território de toda a
    congregação — só dirigente/admin, sem concluir/repartir/POI/PNG,
    acessível por um ÍCONE no header, não é aba da bottom nav; concluir
    geral e repartir geral são papel do admin/servo de território, não do
    dirigente comum), `casa-a-casa` (mapa com GPS pra publicador E
    dirigente identificarem qual quadra é qual — 3 seções possíveis:
    "seu grupo" = mapa do arranjo INTEIRO que você dirige + botão
    **Repartir território** (migrou de `arranjo`, fica junto do mapa que
    edita) + lista de partes já criadas; "sua parte" = mapa só do
    subconjunto que te cabe; "território pessoal". Banner linkando pra
    Prédios; notificação de "parte criada" leva pra cá),
    `predios` (busca+GPS+criar pendente+designar),
    `arranjo` (agenda só de pregação em grupo — inscrição de interesse,
    dirigente ganha Assumir; TP e Repartir saíram daqui),
    `tp` (agenda mensal de testemunho público — turnos/inscrição/
    relatório/sugerir ponto + disponibilidade e confirmação mensal,
    migrou de `arranjo` + `/perfil`),
    `campanha` (sem ícone na bottom nav — acessível pelo banner na home),
    `tce/[id]`
  - `dirigente/` — só um `+layout.server.ts` que redireciona pra
    `/publicador/*` (URLs antigas)
  - `predio/[id]` — **tela ÚNICA de trabalhar prédio**, toggle
    🚪 casa-em-casa vs ✉ cartas + edit + WhatsApp share
  - públicas (sem auth): `cartas/[token]`, `t/[token]` (território/arranjo
    read-only + compartilhar c/ imagem), `convite/[token]`, `c`, `login`
- `src/lib/components/` — `MapaAdmin.svelte` (mapa de quadras reutilizável),
  `MapaPoligonos.svelte` (editor de polígonos + terra-draw), `AdminMapa.svelte`,
  `QuadraMap.svelte` (pinos numerados por endereço + GPS; usado em
  `/publicador/quadra/[id]` com polígono da quadra E em `/publicador/tce/[id]`
  sem polígono — nesse caso ajusta o zoom pros pontos em vez do centro fixo),
  `EditarLocalSheet.svelte`, `InstallPrompt.svelte`, `TpGradeSemana.svelte`
  (grade semanal do Planner de TP), `NotificacoesBell.svelte` (sino no
  header global — fallback in-app de PUSH-A, funciona sem push)
- `src/lib/server/push.ts` — `criarNotificacao(publicadorIds, {titulo,
  corpo, url})` grava em `notificacoes` (via `supabaseAdmin`, bypassa RLS
  pra notificar outros) e dispara `enviarTickle` (Web Push "tickle" sem
  payload — JWT VAPID assinado via WebCrypto, não a lib `web-push` do npm,
  que não roda em Cloudflare Workers). `/api/notificacoes` serve o sino
  E o service worker (que busca o conteúdo ao receber o push vazio).
- `src/lib/server/queries.ts` — helpers de query. **`selectAll<T>()`** pagina
  além do limite 1000 do PostgREST + dedup por id. `contarLocaisPorQuadra`/
  `contarResidenciasPorQuadra` (usadas por `listarQuadrasComGeo`, chamada
  em `/admin`, `/publicador` e `/publicador/casa-a-casa`) leem a view
  `quadras_contagens` (migration 071, `GROUP BY` em SQL) — antes traziam
  TODAS as linhas de `locais`/`unidades` do banco pro Worker via
  `selectAll` e reduziam em JS, bloco síncrono que contribuía pros
  estouros de CPU do Cloudflare Workers nessas rotas.
- `src/lib/ui/` — primitives: `Button`, `Card`, `BottomSheet`, `toast.svelte.ts`
- `src/lib/s13.ts` — lógica PURA dos ciclos do Relatório S-13 (rodada
  Exportáveis, E2; testada): designação de território abre no primeiro
  evento (designação/arranjo) que toca quadra dele e fecha quando
  (quase) todas as quadras têm conclusão >= abertura — `fechamento()`
  tolera até `max(2, 10% das quadras)` sem conclusão pra fechar mesmo
  assim (margem, evita ciclo preso meses por 1-2 quadras teimosas).
  Ciclo travado além da margem NÃO engole redesignações reais pra
  sempre: se uma nova designação/arranjo REAL (não `inferido`) chegar
  pro mesmo território enquanto o ciclo anterior segue aberto,
  `fechamentoForcado()` fecha esse ciclo na melhor conclusão disponível
  (ou `null` se nenhuma quadra jamais concluiu) e abre o ciclo novo pra
  redesignação — sinalizado com `fechamentoForcado: true` (o S-13
  imprime um † na data de conclusão + nota de rodapé). Uma conclusão
  ÓRFÃ sozinha (`inferido`) não força nada — continua engolindo, só uma
  redesignação de verdade prova que o território seguiu adiante. Ciclo
  INFERIDO (órfão) tem a janela de busca da conclusão LIMITADA à próxima
  designação/arranjo REAL (`proximoRealApos`) — sem isso, uma quadra
  esquecida e concluída sozinha (histórico solto) ficava aberta
  esperando o resto do território e, quando uma redesignação de
  verdade vinha meses depois e terminava o serviço, o ciclo órfão
  "roubava" essa conclusão pra si (fechava tarde demais, com a data
  certa mas escondendo a redesignação real por trás). Território que
  NUNCA teve designação/arranjo real (100% concluído direto no mapa,
  sem `proximoRealApos` pra se apoiar) usa um segundo teto:
  `limiteGapInferido` fecha o ciclo órfão se ficar `> 60 dias`
  (`GAP_ABANDONO_DIAS`) sem NENHUMA conclusão nova em qualquer quadra do
  território — silêncio longo é tratado como território esquecido
  (bug real do território 29: quadra concluída sozinha, resto retomado
  73 dias depois sem nenhuma designação/arranjo por trás; sem o gap o
  ciclo órfão ficava esperando pra sempre e engolia a retomada inteira
  num só ciclo). Ciclo REAL não tem nenhum desses dois tetos — evento
  dentro dele continua pertencendo a ele, regra de sempre.
  Rótulo "Arranjo" (constante `DESIGNADO_ARRANJO`) quando não há nome
  de pessoa pra mostrar (arranjo sem dirigente, ou conclusão sem
  designação/arranjo nenhum — `inferido`). `folhasImpressasS13` modela
  o formulário FÍSICO: cada folha lista TODOS os territórios (ordem
  NATURAL — "10" depois de "9", texto por último). O ano cabe em 4
  designações por território; se ALGUM território estoura isso, nasce
  uma "passada" nova (folha nova de verdade, quebra de página forçada
  num `<div>` — NÃO em `<tbody>`, que o Safari/iOS ignora) reescrevendo
  TODOS os territórios com a "Última data concluída" de cada um
  preenchida (a última conclusão até o fim da passada anterior) e os
  ciclos excedentes nas colunas; quem não estourou aparece com nome +
  última data e colunas em branco. Se os territórios já ocupam N
  páginas, cada passada ocupa N páginas. Consumida por
  `/admin/relatorios/s13` (folha imprimível por ano de serviço set→ago,
  PDF = window.print; `thead` repete em toda página impressa, cada
  território não quebra no meio).
  `statusDoTerritorio` classifica pendente/iniciado/concluído (usado
  na Visão Geral). `CartaoTerritorio.svelte` (E1) gera o Cartão S-12
  como PNG (mapa MapLibre oculto + composição canvas), plugado no
  "Compartilhar com imagem" do `/t/[token]` (RPC `territorio_publico`
  ganhou `contexto` na migration 078 — quadras do MESMO território do
  arranjo/designação — e quadras VIZINHAS de qualquer território dentro
  de 250m via `ST_DWithin` na migration 080, pro dirigente saber se dá
  pra avançar quando termina cedo; mesma classificação/legenda de
  sempre, sem mudança no componente). Limiar de "feita há pouco" do
  cartão (marca ✕ vermelho) é em DIAS (15/30/60, default 30) — era em
  meses (3/6/12); o ciclo real de território desta congregação gira a
  cada ~2 meses, então o limiar em meses quase nunca desmarcava nada.
  `/admin/dashboard` (E5) = saúde
  do território, incluindo fim de semana vs meio de semana POR
  território (taxa por dia, não bruto). Ideia futura (não
  implementada): quadras trabalhadas mais de manhã vs à tarde —
  `data_conclusao` é só `date` (sem hora), mas `quadras_conclusoes.
  marcado_em` (timestamptz, migration 019) já existe pra isso; falta só
  construir a análise em cima dele (proxy razoável, não perfeito — bulk
  no admin/backfill grava `marcado_em=now()` na hora do registro, não
  necessariamente a hora do trabalho de campo).
- `src/lib/mapa-offline.ts` — fundo de mapa OFFLINE via PMTiles (E4/W11):
  extract do município no bucket público `mapa-offline` (migration 079,
  gerado pelo admin — `scripts/gerar-mapa-offline.md`), baixado uma vez
  pra IndexedDB em /perfil. `estiloDoMapa(urlOnline)` é o decisor usado
  pelos 4 componentes de mapa na construção: ONLINE busca o style JSON
  com timeout + cópia em IndexedDB (`estiloOnlineComCache` — rede
  travada na abertura cai pra cópia em vez de deixar o mapa cinza pra
  sempre; MapLibre não tem retry de style), offline+arquivo devolve
  estilo protomaps local, offline sem arquivo usa a cópia do style se
  houver (overlays desenham sobre fundo vazio). O CSS do maplibre é
  BUNDLADO (`import 'maplibre-gl/dist/maplibre-gl.css'` nos 4
  componentes + CartaoTerritorio) — nunca voltar pro `<link>` do unpkg
  em runtime (rede instável deixava o mapa quebrado/em branco e a
  versão pinada 4.7.1 nem batia com o maplibre 5.x instalado). É o DONO ÚNICO do `addProtocol('pmtiles')` (global, o último
  registro ganha — nenhum componente deve registrar outro) e serve
  glifos do IndexedDB via protocolo `thassets://`. Deps: `pmtiles` +
  `@protomaps/basemaps`.
- `src/lib/offline/` — fila de escrita offline (IndexedDB), "fila 2.0"
  (W10). `postComFila(url, formData, descricao)` tenta o POST normal; se
  a rede falhar de verdade (não um erro do servidor), enfileira com a
  `descricao` (texto legível pro publicador) e devolve `{offline:true}`
  em vez de derrubar a UI. **Dois invariantes da fila (revisão final)**:
  (1) a URL é ABSOLUTIZADA no enqueue (`fila-logica.ts::resolverUrlDaAcao`)
  — call sites passam `'?/acao'` relativa, mas o flush roda no root
  layout de QUALQUER tela, e uma URL relativa replayada de outra rota
  postaria na action errada e perderia o dado; (2) cada item leva o `uid`
  de quem enfileirou (root layout grava em localStorage via
  `offline/status.ts`) e `flushFila`/`FilaOfflineSheet` só tocam itens do
  usuário logado — aparelho compartilhado não replaya ação de A com a
  sessão de B. Item recusado pelo SERVIDOR (RLS/validação)
  NÃO some da fila — fica `status:'erro'` + a mensagem, pro publicador
  decidir (tentar de novo/descartar) em `FilaOfflineSheet.svelte`, aberta
  pelo banner do root layout (âmbar = aguardando sinal; vermelho = tem
  item recusado). `flushFila()` reenvia os PENDENTES quando a
  conexão volta (root layout, on mount + evento `online`) — a lógica de
  "erro de servidor não bloqueia os seguintes, erro de rede para o lote"
  mora em `fila-logica.ts::processarLote` (puro, sem IndexedDB/fetch,
  testado em `tests/fila-logica.test.ts` — é o único jeito de testar essa
  regra sem simular IndexedDB, que Node não tem). Usado nos fluxos de
  campo de maior frequência/sinal ruim: `/predio/[id]`, `/publicador/
  quadra/[id]`, `/publicador/tce/[id]` (desfecho/carta/concluir),
  `EditarLocalSheet.svelte` (overlay/não-existe), reordenar lista da
  quadra, criar prédio pendente, relatório de TP, pedido de publicação.
  Online-only por decisão (não enfileiram): link público, Overpass
  ("Estacionar perto"), PNG/WhatsApp, inscrição/reserva de TP (precisa
  checar conflito de horário na hora), foto (upload de arquivo — a fila
  só serializa campos de texto). Estenda pra outros fluxos com o mesmo
  `postComFila` quando precisar.
- `src/lib/server/posse.ts` — helper único e puro de "esse publicador pode
  trabalhar essa quadra?", espelhando as mesmas cláusulas de
  `pode_editar_local` (RLS). `guards.ts::exigirQuadraDesignada` só busca
  os booleans (via query) e delega a decisão pra cá.
- `src/hooks.server.ts` — client Supabase + sessão em `locals`
- `supabase/migrations/` — SQL numerado. Aplicar via `/admin/dev/sql` (RPC
  `exec_sql`) ou painel Supabase.
- `scripts/migrate-from-csv.ts` — importa CSVs do IBGE/GAS → Postgres
- `scripts/fill-complementos.ts` — patch idempotente pra preencher
  `unidades.complemento` do CSV sem destruir dados
- `scripts/reset-rodada-testes.sql` — utilitário PERMANENTE (U7), rodado
  manualmente via `/admin/dev/sql` sempre que precisar zerar uma rodada
  de testes: apaga histórico de trabalho + designações/arranjos/TP/
  campanha, mantendo território/quadras/endereços e todos os catálogos
  intactos (reseta `carta_entregue`/status de TCE em vez de apagar a
  linha). O **registro de quadras feitas fica**: `quadras_conclusoes` e
  `quadras.data_conclusao` NÃO são tocados (decisão W1). **Manutenção**:
  toda tabela nova entra nesse arquivo (lado DELETE se for trabalho/
  instância, fora se for estrutura/catálogo) — não deixar ele
  desatualizado.
- `tests/` — `node tests/run.js`
- `docs/specs-ajustes-finais.md` + `docs/tasks-ajustes-finais.md` —
  rodada de ajustes A1–A24/T1–T34 (concluída)
- `docs/specs-usabilidade-2.md` + `docs/tasks-usabilidade-2.md` —
  rodada de usabilidade U1–U13 (concluída)
- `docs/specs-workers-offline.md` + `docs/tasks-workers-offline.md` —
  rodada Workers/Offline W1–W7 (spec + progresso): fim do 1102 no plano
  free (leituras saem do Worker pro browser via `+page.ts` universal +
  `ssr=false`), cache local stale-while-revalidate, e redesenho do
  snapshot/restore de backup. **LER o diagnóstico de CPU no topo do
  spec antes de mexer em qualquer load** — o modelo mental correto é
  CPU CUMULATIVA por invocação (~10ms no free), não "por rajada entre
  awaits"

## Modelo de dados (Supabase / Postgres)

| Tabela | O que guarda |
|---|---|
| `profiles` | usuário + `role` (publicador/dirigente/admin). Coluna `servo_publicacoes` existe mas não tem mais uso (T7/A12a fundiu essa capacidade em "ser admin" — `is_servo_pub()` virou sinônimo de `is_admin()`, migration 060) |
| `convites` | Link público `/convite/<token>` só pra DEFINIR senha — o publicador (`auth.users`+`profiles`) já é criado na hora do convite (senha descartável, `email_confirm=false`), via `convites.publicador_id`. Isso permite designar território pra alguém antes de ele abrir o link. Revogar convite não-usado apaga o usuário provisório junto. `/admin/usuarios` gera 1 ou em lote (cola `nome,email,role` por linha); botão **Histórico** por linha (A27) carrega sob demanda um resumo read-only (`registros`/`quadras_conclusoes`/`tp_agendamento_participantes`/`unidades.carta_escrita_por`, contagem por mês, últimos 6 meses) |
| `territorios` | id text, nome, cor, status |
| `quadras` | id text, `poly geometry(Polygon,4326)`, color, `territorio_id`, **`ativa` boolean**, `data_conclusao`, `reservada_campanha_id` (quarentena — some do pool geral enquanto reservada pra campanha) |
| `quadras_conclusoes` | histórico append-only de conclusões (data, autor, `marcado_em` timestamptz). TODA escrita de conclusão precisa passar por `$lib/server/conclusao.ts` (`registrarConclusaoQuadra`/`desfazerConclusaoQuadra`) — nunca fazer `update quadras set data_conclusao=...` direto fora dali; já rolou bug real de 2 actions (concluir em campo) atualizando só `quadras.data_conclusao` e pulando o histórico, invisível pro S-13/dashboard/campanha (migration 084 fez o backfill) |
| `locais` | endereço físico: `geo Point`, tipo (casa/predio/comercio/coletivo/terreno), `quadra_id`, setor/quadra_ibge/face_ibge, portaria, `nao_eh_predio`, **`pendente`** (criado pelo publicador; admin valida) |
| `unidades` | apto/unidade dentro de um local. `carta_entregue` (date) = carta ESCRITA (+ `carta_escrita_por`, migration 055) — a ENTREGA é registro tipo='carta' no casa a casa |
| `registros` | trilha append-only de eventos por unidade (conversou/carta/desfeito…) |
| `designacoes` | **território pessoal** (tipo pessoal/cartas), sempre `publicador_id` — dirigente NÃO existe aqui (é atributo do arranjo) |
| `designacao_quadras` / `designacao_publicadores` / `designacao_locais` / `designacao_tces` | N:N (locais só p/ tipo='cartas'; tces = A21-f2, TCE como território pessoal repartível) |
| `arranjos` / `arranjo_modalidades` | saída agendada c/ dirigente + território **misto livre**: `quadras_ids[]` + `cartas_locais_ids[]` + `tces_ids[]` (A21-f1: virou array — vários TCEs por arranjo; `tce_id` singular fica no schema como legado, não é mais lido/escrito) + local/ponto + `interessados uuid[]` (inscrição antecipada, sinal pro dirigente repartir). Modalidade é só categoria (cor/defaults). **Recorrência não é um flag perpétuo**: `criarArranjo` expande "recorrente" em N linhas PONTUAIS independentes na hora da criação (`recorrente=false`, uma `data` cada) — cada ocorrência tem seu próprio `dirigente_id`/território, editável sem afetar as outras. Passado o dia (ou hoje após 20h) e `ativo` ainda `true`, a home só AVISA (link pra Casa a casa); é lá que mora a ação **"Finalize a designação"** — botão que marca `ativo=false` e apaga as `arranjo_partes` daquela ocorrência (encerra o acesso; liberar quadra pra outro arranjo já acontece sozinho pela data, via `quadrasEmArranjoFuturo`). Tanto a home ("Você dirige") quanto Casa a casa ("Seu grupo") mostram só o PRÓXIMO arranjo futuro que o dirigente dirige — os demais entram num indicativo "+N outras" com modal de detalhe |
| `arranjo_partes` | repartição do dirigente: subconjunto do território (`quadras_ids[]`/`locais_ids[]`/`tces_ids[]`, A21-f2) → `publicadores uuid[]` (dupla/trio = MESMA parte). Validade deriva da `data` do arranjo |
| `tces` | Território Comercial Especial — designável via `arranjos.tces_ids[]` (grupo, A21-f1) ou `designacao_tces` (pessoal, A21-f2); publicador enxerga/conclui o próprio TCE via `tces.publicador_id` direto OU via designação, RLS cobre os dois caminhos |
| `territorio_tokens` | link público `/t/<token>` de arranjo OU designação (RPC `territorio_publico` monta o JSON; compartilha no WhatsApp com PNG do mapa) |
| `campanha` / `campanhas` | objetivos + período (data_inicio/alvo/meta_semanal) |
| `campanha_suprimentos` | checklist de `publicacoes` pra uma campanha (qtd_necessaria/pedido_feito/notas; "em mãos" A17: não é mais campo próprio, lê `publicacoes.qtd_estoque` do catálogo) — gerido em `/admin/campanha` |
| `publicacoes` | catálogo de publicações (nome/código/ativo) usado pelo suprimento e como "publicação principal" de um período |
| `cartas_tokens` | link público de cartas |
| `curadoria_edicoes` | fila de curadoria (migration 057): edição de overlay por não-admin vale na hora mas fica `pendente` com snapshots `antes`/`depois`; admin confirma ou reverte (aplica `antes`). Tipos: edicao/criacao/nao_existe |
| `cartas_ciclos` | ciclos do trabalho de cartas (append-only, o atual = maior id; iniciado manualmente pelo admin em `/admin/predios` — "Iniciar novo ciclo"). Marca de carta escrita só "vale" se >= `iniciado_em` do ciclo atual. Casa em casa não precisa de tabela: o ciclo é a última `data_conclusao` da quadra. Helpers puros em `$lib/ciclos.ts` (`desfechoNoCicloAtual`/`cartaEscritaNoCiclo`), usados em queries/telas — marcas de ciclo passado aparecem esmaecidas ("ciclo anterior"), histórico intacto |
| `tp_carrinho_tipos` / `tp_pecas_catalogo` / `tp_carrinhos` | Equipamentos de TP (carrinho/display/quiosque/mesa) e catálogo de peças (física/literatura), com `cor` por equipamento pra "visão geral" |
| `tp_pontos` | Pontos fixos de testemunho público (nome/endereço/GPS); ponto AVULSO (texto livre) não tem linha própria, mora em `tp_agendamentos.ponto_avulso`; publicador pode sugerir (`pendente=true, ativo=false`, TP-E) via `/publicador/arranjo`, admin aprova/recusa em `/admin/tp/pontos` |
| `tp_agendamentos` / `tp_agendamento_excecoes` / `tp_agendamento_participantes` | Agendamento = equipamento + ponto (fixo ou avulso) + data/hora + recorrência (nenhuma/diária/semanal/quinzenal/mensal); exceções tratam "só esta ocorrência"; participantes SEM capacidade fixa (`origem` inscrição/designação), com `(agendamento_id, data, publicador_id)` único — a MESMA série recorrente pode ter gente diferente em ocorrências diferentes — TP-F, `/admin/tp/*` + inscrição em `/publicador/arranjo`. `tp_agendamentos.origem` (admin/reserva, A22-f3): publicador **aprovado** (`profiles.tp_aprovado`) pode criar sua própria reserva pontual numa célula vazia da grade do mês publicado (`/publicador/tp`, RLS dedicada — **notifica o admin também**, ver U-turno abaixo), convidando outros aprovados; só quem criou (ou admin) cancela. **Montagem por match de disponibilidade** (pivô de arquitetura sobre a A22-f4 original — o fluxo antigo exigia criar o turno ANTES de preencher gente; o de agora inverte): `$lib/tp-matching.ts::encontrarMatches` — heurística PURA (sem I/O, testada em `tests/tp-matching.test.ts`) que olha só `tp_disponibilidade_mes` do mês (sem depender de nenhum `tp_agendamentos` existir ainda), corta o dia em blocos de duração fixa (padrão 2h) dentro de uma janela de serviço (padrão 08h–20h), e pra cada bloco particiona quem tem disponibilidade sobreposta em grupos de 2 (par) — ou 1 trio no sobra ímpar — cada grupo virando um turno À PARTE (local separado, nunca uma junta grande); mesmo (dia da semana + horário) repetindo em 2+ semanas do mês vira UMA proposta recorrente (a composição de cada semana pode variar — 3ª pessoa aparece/some). Painel em `/admin/tp` (dentro do ciclo de montagem) roda isso no CLIENTE sobre dados já carregados; pra cada proposta o admin só escolhe carrinho+ponto e confirma (action `confirmarMatch` cria o `tp_agendamentos` — `recorrencia='semanal'` com `recorrencia_fim` limitado à última ocorrência casada, nunca sem fim, já que a disponibilidade só foi analisada dentro deste mês — + os `tp_agendamento_participantes` de cada ocorrência; sem notificar aqui, mesmo motivo de antes — quem notifica é a transição de fase pra "publicado"). A criação manual direto na grade (`TpGradeSemana.svelte`, drag-to-create) continua existindo em paralelo, sempre disponível independente de match. |
| `tp_preferencias` / `tp_disponibilidade` | Transporte do equipamento + janelas de disponibilidade (dia_semana/hora) do publicador — TP-B, cadastro em `/publicador/tp` (migrou de `/perfil`), consulta read-only (roster) em `/admin/tp/publicadores` e badge "disponível" no Designar do Planner |
| `tp_disponibilidade_confirmacoes` | Planner é mensal — a disponibilidade fixa precisa ser CONFIRMADA a cada mês novo (1 linha por publicador+mês, `mes_referencia` 'YYYY-MM'); banner em `/publicador/tp` cobra a confirmação |
| `publicacoes` | Catálogo real (transcrito do S-14-T/S-28-T oficial, migration 052) — `categoria` (biblia/livro/brochura/folheto/cartao_visita/revista/formulario/outro), `qtd_estoque` (snapshot MANUAL, o admin atualiza batendo com o relatório do JW Hub — não é movimento entrada/saída), `imagem_url` (capa, bucket `fotos-publicacoes`). Gerenciado em `/publicacoes` |
| `pedidos_publicacao` | Fila de pedidos avulsos de publicação (catálogo ou descrição livre) — P-A; publicador pede em `/publicador` (card "Publicações", mostra estoque atual antes de pedir), admin atende em `/publicacoes` (T7/A12a: rota virou 100% admin-only — a capacidade "servo de publicações" não-admin foi removida, `is_servo_pub()` agora só passa pra admin) |
| `publicador_necessidade_regular` | "Normalmente preciso de N" — só revistas (Despertai/Sentinela, que chegam pela via normal, não por pedido especial); preferência informativa sem status, publicador ajusta em `/publicador` |
| `publicacao_controle` | Lista de controle por publicação — servo escolhe uma publicação em `/publicacoes` e confirma, publicador a publicador, `qtd_pedida`/`qtd_entregue` (contador +/-). Diferente de `pedidos_publicacao` (fila de pedido especial avulso com status): aqui é registro manual sem fluxo, 1 linha por (publicação, publicador). Gate por `is_servo_pub()`, mesma capacidade de sempre |
| `tp_relatorios` / `tp_relatorio_itens` | Relatório de fim de agendamento — TP-D, botão "Relatório do turno" em `/publicador/arranjo` (1 por ocorrência, checklist do tipo do carrinho + publicação da campanha ativa como item extra); fila de Reposição (itens != ok não resolvidos) + tendência de colocações em `/publicacoes` |
| `notificacoes` / `push_subscriptions` | PUSH-A — sino no header (`NotificacoesBell.svelte`, fallback universal, funciona sem push) + Web Push real (JWT VAPID assinado via WebCrypto, tickle sem payload — SW busca o conteúdo em `/api/notificacoes`). Disparado por `$lib/server/push.ts::criarNotificacao()` em: designação criada, cartas designadas, `designarParticipante` (TP-F), status de `pedidos_publicacao` mudou (P-A), saída de agendamento em <48h. Ativar em `/perfil` (botão, exige gesto do usuário) |
| views `*_geo` | expõem geometria como GeoJSON (`poly_geojson` / `geo_geojson`) |

**Status de quadra = só `ativa` (boolean).** "Concluída/pendente" são
DERIVADOS de `data_conclusao` + `quadras_conclusoes`. Não existe mais
status='pendente'/'concluido'.

### TP completo — concluído (migrations 041–049)

TP-A + TP-B + TP-D + TP-E + TP-F + P-A + PUSH-A, todos com UI. Histórico
completo das decisões de cada incremento em **`docs/specs-tp-completo.md`**.

## Convenções

### CPU do Cloudflare Workers (free) — LER antes de mexer em load

O limite é **~10ms de CPU POR INVOCAÇÃO, CUMULATIVO** — awaits NÃO
zeram o contador (a premissa "por rajada entre awaits" usada em
U5/U6 estava errada e causou snapshot/restore quebrados). Regras:
- Leitura pesada NUNCA no Worker: rota que agrega muito dado usa
  **load universal (`+page.ts`) + `ssr = false`** rodando no BROWSER
  com `$lib/supabase-browser` (mesma sessão/RLS do `locals.supabase`).
  Já convertidas (rodada W): `/admin`, `/admin/poligonos`,
  `/publicador`, `/publicador/casa-a-casa`, `/publicador/quadra/[id]`,
  `/publicador/tce/[id]` (W3/W4/W5/W8), `/publicador/arranjo`,
  `/publicador/tp`, `/publicador/predios`, `/publicador/campanha`,
  `/predio/[id]` (W9 — fecha 100% das telas de campo),
  `/admin/auditoria` (pós-v2.0 — `audit_log` guarda `antes`/`depois`
  inteiros, incluindo `poly` de quadras: 100 linhas disso no Worker
  estouravam a CPU). `ssr=false`
  SOZINHO não resolve — um `+page.server.ts` load continua rodando no
  Worker via `__data.json`.
- Loads universais usam helpers de **`$lib/queries.ts`**
  (`$lib/server/queries.ts` é só um shim de re-export) e identidade via
  `await parent()` (root layout devolve session+profile). NUNCA
  importar `$lib/server/*` de um `+page.ts`.
- Actions ficam no server (pequenas: guards + inserts) — defesa em
  profundidade não se move pro browser.
- Cache offline: loads convertidos embrulham o fetch em
  `comCache` (`$lib/offline/cache-leitura.ts`, network-first com
  fallback IndexedDB; HttpError 403/404 nunca cai pro cache). Fetchers
  compartilhados entre o load da própria tela e o prefetch da carteira
  em `$lib/campo-fetchers.ts` (modo rua): `prefetchCarteira` aquece
  quadra/TCE (W8); `prefetchTelasDeCampo` aquece agenda de grupo, TP,
  prédios, campanha e os prédios de cartas designadas (W9) — cada
  `+page.ts` EXPORTA sua função de carregamento + chave de cache
  (`carregarArranjoCampo`/`chaveArranjoCampo` etc.) especificamente pra
  isso, e o prefetch importa de volta do módulo da rota (`$lib` → rota,
  direção invertida do normal, mas evita duplicar ~500 linhas de query
  — único jeito de garantir MESMA chave/MESMO shape sem reescrever a
  lógica em dois lugares); `baixarTudoParaOffline` (W12, reusa
  `carregarHomeCampo`) é a versão sob-demanda, chamada pelo botão
  "Baixar tudo agora" em `/perfil`. Timestamp do último prefetch
  completo fica em `$lib/offline/status.ts` (localStorage, 1 valor
  global). **`CacheInfoBadge.svelte`** (W12) é o componente padrão
  "dados de HH:MM" — todo `+page.ts` convertido devolve `cacheInfo`
  no load; o badge só torna isso visível (aviso âmbar quando
  `deCache=true`), usado em toda tela convertida (campo E admin) e na
  seção **Offline** de `/perfil` (última sincronização completa,
  estimativa de espaço via `navigator.storage.estimate`, "baixar tudo
  agora"/"limpar dados offline" — só mexe no cache de LEITURA,
  NUNCA na fila de escrita).

### Backend (`+page.server.ts`)
- `locals.supabase` = client com sessão; **RLS** faz o controle de acesso.
  Guards em `$lib/server/guards.ts` — usar **`exigirQuadraDesignada`** em
  qualquer rota server que trabalhe conteúdo de quadra pelo publicador
  (a rota da quadra em si virou load universal — a versão portável é
  `verificarPosseQuadra` em `$lib/campo-fetchers.ts`, mesmas cláusulas).
- **Defesa em profundidade**: além de RLS, checar `locals.profile?.role`
  no início das actions que precisam ser role-restritas (concluir quadra,
  repartir/assumir arranjo, designar cartas).
- **RLS de `locais`/`unidades`**: desde a migration 057, UPDATE de
  OVERLAY (nome/notas/portaria/foto/tipo/complemento…) é LIVRE pra
  qualquer autenticado — um trigger de guarda barra colunas ESTRUTURAIS
  (geo/quadra_id/logradouro/numero/IBGE/pendente) pra não-admin e exige
  `pode_editar_local(bigint)` pra colunas de CARTA. Desfechos
  (`registros`), cartas e EXCLUSÕES continuam exigindo posse. Toda
  edição de overlay por não-admin gera linha em `curadoria_edicoes`
  (helper `$lib/server/curadoria.ts::registrarCuradoria`) — admin
  confirma ou reverte.
- Geometria escrita via **GeoJSON** (`{type,coordinates}`) — PostgREST coage
  pra `geometry`. Operações geométricas via **RPC PostGIS** (`ST_Union`,
  `ST_ConvexHull`, `ST_Split`, `ST_GeomFromGeoJSON`) — sem Turf no front.
- Toda query em tabela grande (locais/unidades/registros) usa `selectAll`.
- **Sort por proximidade**: haversine local no server (não RPC).
  Carrega `id, geo_geojson` da view `locais_geo`, calcula distância na
  mão. Padrão bugou historicamente com RPC + raio limitado.
- Datas: `data_conclusao` é `date` (yyyy-mm-dd). Nunca `new Date("yyyy-mm-dd")`
  no front (vira UTC midnight = dia errado em -3); some `T12:00:00`.

### Frontend
- **Svelte 5 runes**: `$state`/`$derived`/`$effect`/`$props`/`$bindable`.
  ⚠️ Em `$effect`, **leia as deps reativas ANTES de qualquer early-return** —
  senão o tracking não registra a dep (bug que já mordeu várias vezes).
  Para `Set`/`Map`, derive uma key primitiva (`[...set].sort().join('|')`).
- **MapLibre**: expressões `interpolate(zoom)` só no top-level — nunca dentro
  de `match`/`case` (usa camada separada filtrada por id). Comparar com `null`
  é frágil — prefira booleano calculado no JS passado como property.
- `window.toast(msg, tipo)` em vez de `alert()`. `BottomSheet` pra modais.
- `use:enhance` + `deserialize` (de `$app/forms`) pra ler retorno de actions
  via `fetch` manual.
- Render com input do usuário: escapar. `rel="noopener"` em links externos.

## Telas principais (admin)

- **Geral** (`/admin`) — mapa multi-seleção de quadras; **designar** (território
  pessoal) + **anexar a arranjo** (saída em grupo). Cor por
  status (recência) / território / densidade / campanha (só quando tem
  campanha EM ANDAMENTO — `statusCampanha()==='em_andamento'` — calculado
  no cliente a partir de `quadras.data_conclusao >= data_inicio`, sem
  query nova; reusa o modo `colorirPor='campanha'` que já existia no
  `MapaAdmin.svelte` mas não estava exposto na tela) / idade da conclusão.
  Densidade (endereços/residências) usa degraus de cor DINÂMICOS
  (`stopsDensidade` em `MapaAdmin.svelte`, frações do maior valor real
  entre as quadras carregadas) — os limiares fixos antigos (0/5/15/30/60)
  foram calibrados num bairro de casas; numa área de prédios (dezenas de
  unidades por quadra) tudo passava de 60 e o mapa inteiro virava uma cor
  só, parecendo "quebrado". Toolbar + resumo de números compactados pro
  mapa (a tela principal) não disputar espaço com eles no mobile: os 2
  toggles (TCEs/Rótulos) viraram botões ícone numa linha só com o select,
  e os 6 números (quadras/território) colapsam num resumo de 1 linha por
  padrão, expansível.
  **Concluir quadra** fundido aqui (long-press abre histórico +
  reverter + limpar conclusão + conflito de data anterior — era a tela
  `/admin/registro`, removida). **Filtro "TCEs"** (A21-f1): esconde o
  resto e mostra as quadras-contêiner de cada TCE (sem convex hull
  cortando quadra) + painel lateral (status/prazo/publicador), clicar num
  TCE restringe o mapa só a ele. `quadras_ids` vem da view
  `tces_com_quadras` (migration 070, `array_agg` em SQL de
  `tce_unidades → unidades → locais.quadra_id`) — antes era um embed
  PostgREST triplo reduzido a `Set` em JS no load de `/admin`, um bloco
  síncrono grande o bastante pra contribuir com estouros do limite de CPU
  do Worker nessa rota. **TCE vira unidade selecionável igual quadra**:
  cada card tem checkbox (multi-seleção independente das quadras do
  mapa) + barra de ações em massa própria (**Designar** território
  pessoal ou **Anexar a arranjo** — soma em `arranjos.tces_ids[]`,
  mesma trava de conflito das quadras: bloqueia TCE com designação
  aberta ou já em outro arranjo ativo); o dirigente reparte os TCEs do
  arranjo entre publicadores depois em Casa a casa (T25, já existia).
- **Polígonos** (`/admin/poligonos`) — editor único, modos:
  - **Vincular**: pontos de endereço + filtros + cluster "por face" (IBGE);
    click vincula a quadra
  - **Quadras**: renomear, território, ativa, **desenhar/editar forma**
    (terra-draw), **juntar** (ST_Union), **dividir** (ST_Split), **excluir**
  - **Territórios**: CRUD, agrupar quadras, deletar (orfaniza)
  - **TCE**: seleciona comércios/faces → convex hull → cria
  - **Auditar** (A20, acionável): endereços sem face IBGE (ação: pula
    pro Vincular já selecionado), quadras sem endereço (ação: Juntar —
    pula pro Quadras já selecionada — ou Excluir direto), múltiplos
    clusters IBGE na mesma quadra (ação: Unificar — normaliza
    setor/quadra_ibge pro cluster majoritário — + aponta quadras que já
    têm esse mesmo cluster minoritário, candidatas a "dono de verdade"),
    quadras órfãs sem território
- **Prédios** (`/admin/predios`) — lista + filtros + modal inline + WhatsApp +
  **📍 Proximidade GPS** + ▶ trabalhar (→ `/predio/[id]`) +
  ⏳ **Validar pendente** + 🎯 **Designar cartas** + 📅 Anexar arranjo
- **Campanha** (`/admin/campanha`) — período + mapa do período + termômetro de
  ritmo + gráfico semanal + suprimento (publicações/quantidades)
- **Arranjos** (`/admin/arranjos`) — modalidades + agenda semana/mês/3m/ano +
  recorrência gera N pontuais editáveis + anexar prédios/quadras/TCE +
  **Transferir dirigência** (A→B num período, default tudo futuro; confirm
  com contagem antes de executar; notifica B; só admin, nunca o próprio
  dirigente)
- **Designações** (`/admin/designacoes`) — hub central: lista todas as
  designações pessoais/cartas + arranjos + TCEs num só lugar (filtros por
  tipo/status, concluir/reabrir/cancelar/excluir, link público, realocar
  quadras não terminadas pra outro arranjo). **Arranjo não tem coluna de
  status** (só `ativo boolean`) — o filtro Concluídas/Canceladas deriva o
  status no `load` combinando `ativo` com `arranjoAindaVale()`: inativo
  cujo calendário já tinha vencido = concluída (fluxo normal,
  `finalizarArranjo`), inativo que ainda "venceria" = cancelada
  (desativado antes da hora em `/admin/arranjos`). Designação pessoal
  de TCE (via `designacao_tces`) mostra o chip do TCE no card "Pessoal"
  e o card solto da seção TCEs resolve o nome do publicador pela
  designação aberta quando `tces.publicador_id` está vazio (esse fluxo
  nunca seta essa coluna — só a designação direta via arranjo seta).
- **TP** (`/admin/tp/*`, navegação em 5 seções — sidebar no desktop, sheet
  no mobile): **Planner** (`/admin/tp`, grade semanal tipo Google Calendar —
  `TpGradeSemana.svelte` — clicar/arrastar num horário vazio cria
  agendamento, arrastar a borda de um card ajusta início/fim; chips de
  equipamento são filtro multi-seleção, sobrepondo cores no mesmo grid;
  criar/editar/cancelar com recorrência, designar publicador; mês continua
  em lista), **Visão geral** (`/admin/tp/geral`, todos os
  equipamentos sobrepostos, coloridos por `cor`), **Pontos**
  (`/admin/tp/pontos`, CRUD nome/endereço/GPS), **Equipamentos**
  (`/admin/tp/equipamentos`, CRUD tipos/peças/carrinhos, catálogo real
  S-80-T), **Publicadores** (`/admin/tp/publicadores`, roster read-only de
  disponibilidade)
- **Publicações** (`/publicacoes`, P-A + TP-D) — 4 seções com chips no
  topo (Pedidos/Reposição/Catálogo/Controle): fila de `pedidos_publicacao`
  (filtro pendentes/entregue/cancelado/todos), avançar status + notas do
  admin; **Reposição** (itens de relatório de TP != ok ainda não
  resolvidos, agrupados por carrinho/ponto, botão Resolvido) + card
  simples de tendência (soma de qtd colocada por publicação/mês); **Lista
  de controle** (escolhe publicação → checklist de todo publicador ativo
  com contador +/- de pedido e de entrega, busca por nome e totais,
  `publicacao_controle`);
  suprimento de campanha é só um link pra `/admin/campanha`. Fica FORA de
  `/admin/*` só por convenção de path — a rota é `exigirRole(['admin'])`,
  100% admin-only (T7/A12a removeu a capacidade "servo de publicações"
  não-admin que existia antes). Entrada no drawer admin (ícone `inbox`).

## Telas principais (modo campo — publicador + dirigente)

- **Home/carteira** (`/publicador`) — card destacado se campanha ativa +
  card "🎪 Você dirige" (arranjos que dirijo, com link "Repartir →") +
  card amarelo "🚶 Pregação em grupo — sua parte" (via `arranjo_partes`)
  + card de turnos de TP nos próximos 7 dias + card "Publicações" (pedir
  publicação do catálogo ou avulsa + status dos meus pedidos — P-A).
  Carteira dividida em Território pessoal / ✉ Cartas designadas + lista
  TCEs abertos.
- **Mapa** (`/publicador/mapa`) — só dirigente/admin. Mapa map-driven pra
  concluir quadra, POIs (Estacionar perto → marcadores no mapa + rota
  Google Maps), 📸 PNG export, ✂ Criar parte (seleciona um arranjo que eu
  dirijo + subset de quadras pra repartir com um publicador).
- **Arranjo** (`/publicador/arranjo`) — agenda da semana com arranjos +
  turnos de TP (inscrever/sair + botão "Relatório do turno" quando a
  data já passou e o publicador participou — checklist de peças do tipo
  do carrinho, TP-D). Todo publicador pode sinalizar "Quero
  participar" (inscrição antecipada); dirigente ganha **✂ Repartir
  território** (nos arranjos dele, cria/apaga `arranjo_partes`) +
  **👋 Assumir dirigência** (nos arranjos dos outros) + link público.
- **Prédios** (`/publicador/predios`) — busca + 📍 GPS + tabs/filtros +
  criar prédio pendente. Se dirigente: checkbox multi-seleção + 🎯
  Designar cartas.
- **Campanha** (`/publicador/campanha`) — objetivos + gráfico.
- **/predio/[id]** — tela ÚNICA de trabalhar um prédio. Toggle
  **🚪 Casa em casa** (registros: conversou/semConversa/naoAtendeu/carta)
  vs **✉ Cartas** (unidades: carta escrita/desocupado/nao_escrever).
  Cartas tem DOIS momentos: aba Cartas = ESCRITA (marca "Carta escrita"
  + data + quem escreveu); ENTREGA = desfecho "Deixou carta" do casa em
  casa, que brilha (ring roxo pulsante) quando a unidade tem carta
  escrita sem entrega. Correio é o fallback, mesmo botão. Botões NÃO
  ficam pressionados pra sempre: casa em casa reseta na conclusão da
  quadra, cartas resetam quando o admin inicia novo ciclo (ver
  `cartas_ciclos`).
  Header tem ✏ Editar + 📤 WhatsApp share. Progresso duplo.

## Deploy

- Branch `main` → Cloudflare Workers auto-deploy.
- `pwa-rewrite` era a branch de desenvolvimento (já mergeada).
- Migrations novas: rodar SQL no `/admin/dev/sql` (cola o conteúdo do arquivo
  `supabase/migrations/0XX_*.sql`).
- `.env`: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (só pro script de migração),
  `PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (Web Push, PUSH-A — gerar
  com `node scripts/gerar-vapid.mjs`; em produção via `wrangler secret put
  VAPID_PRIVATE_KEY` + a pública no `wrangler.toml`/dashboard, não é segredo).
  **Opcionais**: lidas via `$env/dynamic/*` em `$lib/server/push.ts`/`/perfil`
  de propósito — faltando, só desativa o Web Push (sino in-app continua),
  NUNCA quebra o build. Nunca trocar essas duas por `$env/static/*` (já
  quebrou o deploy inteiro uma vez por isso — static exige a var em tempo
  de build, dynamic não).

## Anti-padrões (não cair)

- `$effect` com early-return antes de ler deps → não rastreia.
- `interpolate(zoom)` aninhado em `match` no MapLibre → erro.
- `delete().neq('id','x')` em coluna bigint → falha silenciosa; use TRUNCATE/`.gte`.
- Paginação por offset sem `.order()` estável → duplica/pula linhas.
- `alert()` / `new Date("yyyy-mm-dd")` direto.
- Calcular "há N dias" com `Date.now() - new Date(iso + 'T12:00:00').getTime()`
  dá **-1** sempre que o relógio local ainda não passou do meio-dia (ex:
  quadra concluída HOJE de manhã aparecia "há -1 dias"). Use
  `diasDesde()` de `$lib/utils/data.ts` (compara meia-noite local dos
  dois lados, não meio-dia).
- `CREATE OR REPLACE VIEW` só aceita adicionar coluna nova no **FINAL**
  da lista do SELECT. Inserir no meio (ex: antes de `poly_geojson`/
  `geo_geojson`) muda a posição das colunas seguintes e o Postgres
  rejeita com `cannot change name of view column "X" to "Y"`. Sempre
  que alterar `quadras_geo`/`locais_geo`/`tces_geo`/etc. numa migration,
  coloque a coluna nova DEPOIS da(s) coluna(s) de geometria existente(s).
- Achar que "espalhar awaits" salva do 1102: o CPU do Workers free é
  CUMULATIVO por invocação (~10ms) — não existe "quebrar em rajadas".
  Trabalho pesado sai do Worker (browser via load universal, ou
  Postgres via view/RPC) — ver a seção "CPU do Cloudflare Workers" em
  Convenções. Idem `JSON.parse`/`JSON.stringify` de payload grande numa
  action: parse no BROWSER e mande lotes pequenos (padrão do restore de
  backup, W6).
- Query CRUA do supabase-js (`supabase.from(...).select()`) dentro de um
  fetcher usado com `comCache` SEM checar `.error` e lançar: em falha de
  rede supabase-js NÃO lança (resolve `{data:null, error}`) — o load
  "resolve" com listas vazias e o comCache grava a tela VAZIA por cima do
  snapshot offline bom. Todo fetcher de load convertido lança em erro
  (helpers de `$lib/queries.ts` já lançam; query crua precisa do
  `if (res.error) throw res.error` explícito).
- Enfileirar URL relativa (`'?/acao'`) na fila de escrita offline: o
  flush roda no root layout de QUALQUER tela — replay de outra rota
  postaria na action errada. `postComFila` já absolutiza no enqueue
  (`resolverUrlDaAcao`); não criar outro caminho pra fila que pule isso.
- Resposta com `redirected: true` servida pelo service worker pra uma
  NAVEGAÇÃO: o Safari/WebKit rejeita ("Response served by service worker
  has redirections"). O SW já sintetiza redirect próprio (online) e
  re-embrulha replay de cache em Response limpa — manter essas defesas
  ao mexer no `service-worker.ts` (o start_url `/` SEMPRE redireciona).

## Rodando testes

```bash
npm test
```

Testes em Node puro via `tsx` (resolve `$lib`), sem framework — cobrem
lógica pura de `$lib` (posse de quadra, status de campanha, expansão de
ocorrências de arranjo/TP, `diasDesde`). Não há integração contra Supabase
real (precisaria de projeto de teste com seed). Ver `tests/README.md`.
