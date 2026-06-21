# Changelog

Mudanças relevantes do app. Datas relativas ao mês de release.

## 2026-06 (atual)

### Cleanup: Testemunho Público (TP) movido pra app separado

TP foi removido daqui (Code.gs, Constants.gs, Index.html, JS_App.html,
TP.html, tests). Schema preservado no histórico git (commit `b86aed8`)
caso útil pra referência.

Por quê? TP é domínio próprio: agenda, recorrência, check-in/out, swap,
calendário. Crescimento natural ia poluir o app de território e a planilha.
App novo vai começar com schema melhor já incorporando as lições do MVP.

### Rodada de polimento + features (depois do release)

#### Performance do primeiro load
- **Cache `_ultimoDesfechoPorRow_`** em ScriptCache (5min). Era chamado
  3x por carregamento (getDadosPublicos + listarAptosDoPredio + getDadosTCE)
  e relia Registros inteiro toda vez.
- **Cache `getDadosComContexto`** completo por idsString (5min).
  Invalidação versionada via chave `DADOS_CTX_VER` (não precisa percorrer
  chaves no CacheService). Pulla se payload >90KB.
- **Cache `_mapaCartasEntregues_`** + `getDensidadePredios` (já tinha)
  agora todos invalidados em `limparCacheServidor`.
- **Defer CDNs** (Publico + Dirigente): Bootstrap/Leaflet com `defer` =
  não bloqueiam parse do HTML.
- **Lazy-load Sortable.js**: só carrega quando publicador entra em
  modo reordenar.
- **Lazy-load dom-to-image-more**: só carrega quando dirigente clica
  Exportar mapa.
- **renderizarLista sem reparse quadrático** — acumula em array e faz
  UM `innerHTML` único no fim (em vez de `innerHTML +=` dentro do forEach).

#### Sync unificado de cartas (publicador ↔ link de cartas)
- **registrarCartaEndereco** escreve em DUAS abas: Registros (trilha) e
  PrediosAptos.cartaEntregue (estado atual). Aceita parâmetro `undo` pra
  reverter ambos.
- **atualizarAptoStatus** quando muda `cartaEntregue` espelha em Registros
  (`'carta'` ou `'carta_undo'`) pra publicador ver entregas vindas do
  arranjo de cartas.
- **getDadosPublicos** enriquece `item.cartaEntregue` lendo PrediosAptos.
- **Frontend Publico**: ao carregar, sincroniza `localStorage.carta_<row>`
  com server. `toggleCarta` + `simplesCarta` sempre disparam sync.
- `_atualizarAptoStatusInterno_` extraído pra evitar lock-em-lock.

#### Acessibilidade
- **Toggle "Texto grande"** no canto superior direito do Publico (ícone
  ↕). Aumenta fontes/botões críticos +25%. Botões mutex viram 52px.
  Persiste em localStorage `pub_texto_grande`.

#### Street View no card de prédio
- Link "📷 Street View" no card de prédio do publicador (simples e
  avançado) e no header de Cartas.html, gerando URL
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=lat,lng`.
- `listarAptosDoPredio` retorna `predio.lat/lng` (do primeiro apto com
  coord) pra Cartas.html usar.

#### Offline awareness
- **Indicador global de fila** (pill no canto superior esquerdo) sempre
  visível quando offline OU quando há marcações na fila de sync.
  Vermelho = offline. Amarelo = sincronizando.
- Banner detalhado dentro do modo avançado mantido.

#### Schema Testemunho Público (TP) — base
- 4 abas autocriadas: `TpPontos`, `TpHorarios`, `TpCarrinhos`,
  `TpAgendamentos`. Schemas em `Constants.gs`.
- CRUDs backend: `listarPontosTP`, `criarPontoTP`, `listarHorariosTP`,
  `criarHorarioTP`, `listarCarrinhosTP`, `criarCarrinhoTP`,
  `listarAgendamentosTP`, `agendarTP`, `checkInTP`, `checkOutTP`,
  `cancelarAgendamentoTP`, `getDadosTPPublico`.
- `STATUS_TP` (agendado/presente/concluido/ausente/cancelado).
- UI completa (admin + link público pra publicador agendar) fica pra
  próxima rodada.

#### Testes
- `tests/cartas-tp.test.js` (+11 testes): sync de cartas bidirecional,
  schema TP, agendamento, check-in/out, cancelamento.
- Total: 74 testes passando (era 63).

### Final do mês (depois do release)

#### Faces IBGE em todo o app
- **Faces (F1, F2, F3, F4)** lidas da coluna D (FACE_IBGE) de Dados Brutos.
- **Modo simples**: cards de face coloridos + barra do header colorida; mapa
  desenha cada aresta da quadra com a cor da face cujo centroide está mais
  próximo. Ordem horária ascendente (convenção IBGE).
- **Modo avançado**: dentro de cada quadra, endereços agrupados por face com
  divisão colorida; click no header da quadra pinta as arestas no mapa topo.
- Paleta única `FACE_COLORS` (azul, vermelho, verde, laranja, roxo, ciano).

#### Editar prédio no publicador
- Aba publicador (modo simples e avançado) ganhou link/botão "Editar prédio"
  no header dos grupos de prédio.
- Modal com 3 dimensões independentes: **Entrada** (porteiro / eletrônica /
  sem), **Acesso às caixas de correio**, **Acesso aos interfones dos aptos**.
- Schema `Predios` ganha colunas K/L/M (tipoEntrada, acessoCaixas,
  acessoInterfones). Migração idempotente em `ensureSheetPredios_`.
- Endpoints públicos `getOverlayPredioPublico` + `atualizarPredioPublico`
  com whitelist de campos (publicador não pode editar notas/irmãoMora).
- Campo legado `acessoInterfone` (individual/portaria) mantido só pra
  compat — UI nova não usa mais.

#### Dirigente redesenhado map-driven
- Mapa ocupa a tela; lista removida. Click numa quadra abre bottom sheet
  com detalhes (status, qtd endereços/prédios, última conclusão).
- **Alerta amarelo** quando quadra tem endereço marcado "não visitar" +
  símbolo ⚠ no tooltip da quadra.
- **Concluir inline** (data + botão) sem segundo modal.
- **Modo Compartilhar**: toolbar amarela onde click adiciona/remove
  quadras à seleção pra mandar pro publicador. Pré-marca todas designadas.
- **Estacionar perto**: busca via Overpass API (OSM) por
  estacionamentos / praças / farmácias / padarias / postos / mercados.
  Cada POI marker mostra tooltip "Mais perto de Q-X (~Y m)".
- **GPS do dirigente**: botão crosshair + ponto azul no mapa.
- **Legenda overlay** dinâmica no canto do mapa (muda quando densidade
  liga/desliga; só mostra cores presentes).
- **Contexto bbox sempre**: vizinhança geográfica (de outros territórios)
  agora sempre aparece junto com contexto territorial.
- **Exportar mapa** esconde contexto/POIs e dá zoom apertado nas
  designadas (padding 10, maxZoom 19).
- **Densidade off** voltou a funcionar (era bug que sobrescrevia o
  estilo original).
- **Tooltip da quadra**: só ID por default; contagem de prédios só com
  densidade ligada.

#### Publicador menos assustador
- **Modo simples padrão** na 1ª visita (hub com mapa pequeno + GPS +
  cards das quadras). Quem já usou continua no que escolheu.
- Sem mais legenda "Designada/Concluída/Disponível" (era jargão de
  dirigente — não fazia sentido pro publicador).
- Header de cobertura focado em **prédios completos** (não no % de
  endereços que se anima com 1 toque no portão). Aviso amarelo quando
  há prédios com aptos pulados.
- **Auto-sync silencioso** a cada 2min em modo simples (vê marcações
  de outros publicadores). Botão "Atualizar" pra refresh manual.
- **Trabalho por quadra → face → paradas** no modo simples
  (publicadores não misturam quadras na prática — UI passa a respeitar).
- **Carta = feito** nos filtros e contador (entregar carta é trabalho
  válido).
- **Filtros Pendentes/Feitos** voltaram a funcionar (estavam quebrados
  pelo redesign dos botões mutex).
- **Modo avançado**: faces na lista + pintar arestas ao clicar.
- **Quadras fechadas por default** no avançado, com animação max-height.
- **Toggle Simples/Avançado** movido pro canto superior direito.
- **Editar prédio** acessível tanto no simples quanto no avançado.
- **IDs via template server-side** (`<?= ids ?>`) — antes usava
  `google.script.url.getLocation` que dependia de postMessage e travava
  silenciosamente no iOS Safari.

#### Hardenings
- **XSS via item.nome/complemento/nota**: escapados com `escapeHtmlPub`
  nos templates de criarItemHtml (era hole real — qualquer notinha do
  servidor podia injetar HTML/script).
- **XSS via emTCE.publicador**: escapado no badge TCE.
- **XSS via g.titulo**: escapado no group-title.
- **Sync de undo**: `marcarDesfecho` agora envia evento `desfeito`
  pro Registros quando publicador desmarca um desfecho. Antes só fazia
  mudança local — backend ficava sempre na última marca.
- **Botão Editar Prédio no avançado**: chave do prédio via
  `data-chave-pr` em vez de regex em template literal (regex literal
  dentro de template literal quebrava o parser do Apps Script).
- **Cache `getDensidadePredios`** (5min) — era chamado em todo
  `getDadosComContexto` lendo Dados Brutos inteiro.

#### Fixes
- Loader infinito quando designação vazia OU postMessage drop.
- Listagem de prédios no link de cartas usa Col M (nome do
  estabelecimento) quando overlay manual não tem nome.
- "Como chegar" do prédio usa lat/lng do primeiro apto em vez de
  pesquisa por endereço.
- Filtros Pendentes/Feitos checam `desf_<row>` (em vez de classe
  `.check-visita.checked` que sumiu no redesign mutex).
- Toggle Densidade do dirigente preserva `_estiloOriginal` corretamente.



### Features grandes
- **Designações** — Território Pessoal. Trava quadras em nome do publicador com prazo. Auto-fecha ao concluir, mostra vencidas.
- **Trabalho de Cartas / Prédios** — nova 5ª aba admin. Detecção automática de prédios (≥2 endereços no mesmo número). Link público focado num prédio mostra apartamentos com 4 ações (escrita, entregue, desocupado, não escrever).
- **Pacote F — Desfecho por endereço** — 3 botões mutex no publicador: não atendeu / contato sem palestra / conversou. Indicador de cobertura no topo. Badge "antes" com memória do território.
- **Objetivos da Campanha estruturados** — substituiu textão livre. Por modalidade (casa em casa, comercial, rural, cartas, telefone, público), com upload de anexo no Drive e switch de visibilidade pública.
- **Modo Campanha on/off** — switch explícito no editor. Quando OFF, painel público mostra "sem campanha".
- **Inativa (área verde)** — novo status pra quadras-parque. Fora da contabilização, da campanha, e do painel do publicador.
- **Território Comercial Especial (TCE)** — agrupa endereços comerciais atravessando fronteiras de quadras. Polígono auto via convex hull. Link público próprio. Endereços ficam esmaecidos no residencial com aviso "pregue se tiver boa oportunidade". Suporte a reabrir e reutilizar TCE antigo.
- **Renomeação interativa de quadras** — clique nas quadras na ordem desejada pra atribuir 1A, 1B, 1C. Cascata em 5 abas.
- **Auto-deploy via clasp** — push em main vira clasp push automático no Apps Script.

### UX
- Botões de desfecho/carta no publicador 44×44 (HIG mobile).
- Card de cobertura "X de Y alcançados" sem cores agressivas.
- Header da Geral com badges proativos: contagem de designações abertas + alerta de vencidas + qtd de TCEs.
- Modal Designações enriquecido: concluir todas, +30 dias, ver no mapa.
- Filtro de endereços por vínculo com quadra no editor.
- Tema escuro estendido pra telas standalone (Publico, Dirigente, Cartas).

### Final do mês de junho
- **Versão visível** no app — sufixo `v: abc1234` no rodapé das telas.
  Workflow injeta SHA curto via `sed` antes do `clasp push`.
- **Auto-vinculação geométrica** — point-in-polygon (ray-casting +
  bbox short-circuit). Threshold 60%. Funciona sem vínculo manual prévio.
- **Inconsistências** detectadas e reportadas com card vermelho +
  botão "Unificar" pra resolver.
- **Ver cluster no mapa** — destaca pontos em roxo + link Google Maps.
- **Auto-deploy `/exec`** via clasp deploy + secret `CLASP_DEPLOYMENT_ID`.
- **Densidade de prédios** — modo "Densidade" no mapa Geral + toggle no
  Dirigente + indicador "X prédio(s)" no header (não mente como contagem
  de endereços).
- **Modo Simples** — agrupa aptos em "parada de prédio", botão inverter
  sentido, link "Como chegar" no Google Maps.
- **Offline-fila** no publicador — marcações sobrevivem queda de rede.
- **Quadras Inativas** (área verde / parque) — fora da contabilização.
- **Tela início** com 3 cartões orientadores na primeira visita.
- **Renomeação interativa** clicando nas quadras na ordem desejada.
- **Tema escuro** nos standalones (Publico/Dirigente/Cartas/CampanhaPublica).

### Hardening
- XSS via URLs (link, anexoUrl) — bloqueio backend + frontend (`_sanitizarUrl_`, `safeUrl`).
- Cache do publicador com TTL de 24h (envelope `{t, d}`).
- `_propagarRenomeacaoIds_` cascateia mudança de ID de quadra em todas as abas dependentes.
- `withLock_` em todos os writes (incluindo `salvarJuncaoQuadras` que estava sem).
- `excluirQuadra` limpa designações e CSV de territórios + avisa o usuário do impacto.
- FileReader.onerror no upload de objetivos.
- Anti-double-click em `alternarPublicoObjetivo`.
- Cache de folderId em ScriptProperty pra evitar race em `_pastaAnexosCampanha_`.

### Correções críticas
- `salvarJuncaoQuadras` agora cascateia IDs (era órfão).
- `salvarEdicaoQuadra` cascateia em 5 abas (era só Quadras).
- Mapa Geral popup com Rota removido (atrapalhava seleção). Botão X "limpar seleção" adicionado.
- Renomear modal `pointer-events: none` no .modal pra cliques caírem no mapa atrás.
- `mudarStatusQuadra` no Publico não mais com alert mentindo antes do save.
- Inativa zero-interativa no Registro (sem tooltip, sem ícone, sem click).

## Pré-junho 2026

Antes desse mês, o app tinha:
- Visão Geral, Editor (Polígonos), Registro, Campanha (4 abas)
- Status binário Pendente/Concluído
- Link `?v=publico&ids=` com lista de endereços por quadra (sem desfecho mutex)
- Link `?v=dirigente&ids=` pra dirigente marcar como feita
- Painel da campanha com objetivo/estratégia em texto livre
- Sem designações, sem prédios, sem TCE, sem inativa

Migração: as abas novas (`Designacoes`, `Predios`, `PrediosAptos`, `Campanha`, `TerritoriosEspeciais`) são autocriadas na primeira escrita via `ensureSheet*_`.
