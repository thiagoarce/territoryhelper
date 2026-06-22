# CLAUDE.md — Guia para agentes IA neste repo

Este projeto é um app de Google Apps Script para gestão de territórios JW.
Frontend em Leaflet + Bootstrap, backend em Apps Script com Google Sheets
como banco. Quando trabalhar aqui, leia esta nota primeiro.

## Layout de arquivos

- `Code.gs` — entrada (`doGet`), funções de save/load, lógica de negócio
- `Constants.gs` — mapa de colunas, enums (STATUS, SHEET, MODALIDADES_CAMPANHA,
  STATUS_DESIGNACAO, STATUS_TCE, DESFECHO). **Mude aqui se reordenar a planilha.**
- `Utils.gs` — `withLock_`, validações (`validarPolyString_`, `validarId_`,
  `validarData_`, `validarCor_`), `sanitizar_` (anti-formula-injection),
  `getSheetByName_`, `acharLinhaQuadra_`, `logErro_`
- `Index.html` — UI da Gestão (web app do servo de território)
- `Publico.html` — UI do publicador (recebe link com lista de quadras)
- `Dirigente.html` — UI do dirigente (map-driven, bottom sheet)
- `CampanhaPublica.html` — tela motivacional pública da campanha
- `Cartas.html` — trabalho de cartas (lista prédios ou aptos de UM prédio)
- `JS_Core.html` — utilities compartilhadas (toast, confirmar, runApp,
  tema escuro, atalhos). Incluído ANTES de JS_App. **Só no admin.**
- `JS_ToastPublico.html` — toast standalone (sem deps). Incluído em
  Publico/Dirigente/Cartas/CampanhaPublica via `<?!= include('JS_ToastPublico') ?>`
- `JS_App.html` — JS principal da Gestão (Visão Geral, Polígonos, Registro,
  Campanha, Prédios)
- `CSS.html` — estilos compartilhados (incluído só pelo Index)
- `tests/` — testes Node sem deps; `node tests/run.js` (74 testes)
- `docs/` — documentação (manual, setup clasp, CHANGELOG)
- `.github/workflows/` — CI (tests, deploy-apps-script, sync-apps-script)

## Modelo de dados (abas no Sheets)

Todas as abas são **autocriadas** via `ensureSheet*_()` na primeira escrita
ou leitura. Schemas em `Constants.gs`. Migração idempotente — `ensureSheet*_`
checa `getLastColumn()` e completa cabeçalho com colunas novas sem perda.

| Aba | O que guarda |
|---|---|
| `Quadras` | id, polyString, color, territorio, status, dataConclusao |
| `Territorios` | nome, cor, ids_quadras (CSV), polyString, label_pos, label_type, status, dataConclusao |
| `Dados Brutos` | endereços IBGE (logradouro, número, lat/lng, tipo, **face IBGE col D**, etc) |
| `Registros` | trilha de eventos: auto/manual/desfeito/carta/carta_undo/conversou/semConversa/naoAtendeu/interfone |
| `Campanha` | objetivos estruturados {id, tipo (geral/semana), modalidade, titulo, descricao, link, anexo, publico} |
| `Designacoes` | território pessoal {id, ids_quadras, publicador, criada, prazo, status, notas} |
| `Predios` | overlay manual {chave="logradouro\|numero", nome, irmaoMora, nomeIrmao, acessoInterfone (legado), naoEhPredio, notas, ultimaCarta, **tipoEntrada, acessoCaixas, acessoInterfones**} |
| `PrediosAptos` | overlay per-apto {row→DadosBrutos, cartaEscrita, **cartaEntregue**, desocupado, naoEscrever} |
| `TerritoriosEspeciais` | TCE que atravessam quadras: {id, nome, tipo, rows (CSV), polyString (convex hull), publicador, prazo, status} |

## Convenções

### Backend (`.gs`)

- **Todo write usa `withLock_(function() { ... })`** (LockService 20s)
- **Todo write chama `_invalidar()` no fim** — limpa cache do `CacheService`
- **Cache em `CacheService` com TTL 5min** pra reads pesados. Hoje cacheamos:
  - `DADOS_MAPA_CACHE`
  - `PREDIOS_LISTA_V1`
  - `DENSIDADE_PREDIOS_V1`
  - `ULT_DESFECHO_V1`
  - `CARTAS_ENTREGUES_V1`
  - `DADOS_CTX_VER` + `DADOS_CTX_*` (cache versionado de `getDadosComContexto`)
- **Invalidação versionada** quando chave é dinâmica (ex: cache por idsString):
  guarda `*_VER` com timestamp; `_invalidar` só atualiza a versão.
- Acessos a colunas usam `COL.QUADRAS.X` (0-indexed) ou `COL.QUADRAS.X_1IDX`
- Status canônicos: `STATUS.PENDENTE` / `STATUS.CONCLUIDO` / `STATUS.INATIVA`
- `sanitizar_(valor)` antes de gravar strings vindas do usuário
- `_sanitizarUrl_(url)` antes de gravar URLs (só http(s)/mailto)
- `_propagarRenomeacaoIds_(mapa)` cascateia renomeação de quadra em 5 abas
- **Datas em Sheets**: nunca gravar `"yyyy-MM-dd"` direto (string vira UTC
  midnight = dia anterior em -3). Use `_dataLocalMeioDia_(yyyymmdd)` que
  retorna Date ao MEIO-DIA local. Leitura tolerante: aceita Date OU string.

### Frontend

- **`window.toast(msg, tipo)`** em vez de `alert()` (tipos: success/error/warn/info)
- **Confirmação destrutiva**: `window.confirmar({titulo,mensagem,perigo:true})`
  (só no admin; públicos usam `confirm()` ou ações reversíveis)
- `google.script.run` envolvido com `withSuccessHandler`/`withFailureHandler`
- Polígonos: formato string `lat,lng | lat,lng | ...`
- **Render com input do usuário: SEMPRE escapar** com `escapeHtml`/`escapeHtmlPub`.
  `href` dinâmico: `safeUrl`/`safeUrlPub`
- `rel="noopener"` em `<a target="_blank">`
- **`aria-label`** em botões só-ícone
- **Min 44×44 px** em touch targets (HIG mobile)
- **Defer CDNs**: Bootstrap/Leaflet com `<script defer>`. Sortable/dom-to-image
  lazy-load via `carregarSortableSeNecessario()` / `carregarDomToImage()`
- **IDs via template server-side**: `var IDS = "<?= ids ?>";` — NÃO use
  `google.script.url.getLocation` (postMessage falha silenciosamente no iOS Safari)
- **Acumular HTML em array e ONE `innerHTML`** no fim — não use `innerHTML +=`
  dentro de forEach (reparse quadrático)

## Features principais (state atual)

### Visão Geral (admin)
- Mapa com quadras + territórios
- Botão "Designações" → modal lista designações abertas/vencidas
- Seleção de quadras → barra "Compartilhar" → modal com Território Pessoal
- Cadeado 🔒 nas designadas; cache `_quadrasDesignadasCache` evita roundtrip
- Alerta antes de redesignar quadra já designada

### Polígonos (admin)
- Vincular faces (endereços) a quadras: selecionar pontos + clicar na quadra
- Filtros: Tipo (Dom/Com) × Vínculo (Vinculados/Sem quadra)
- Botão "Renomear" → modo interativo com cascata em 5 abas
- Botão "TCE" amarelo cria Território Comercial Especial
- Botão "Auto-vincular" — algoritmo point-in-polygon por cluster IBGE
- Botão "Auditar" — múltiplos clusters IBGE + quadras vazias + "Ver ignorados"

### Registro (admin)
- Mapa com quadras coloridas por gradiente temporal
- Seleção + data → marcar como Concluído. Veja `salvarConclusaoQuadras`
- Botão "Desfazer" → `desfazerConclusaoQuadra` (restaura penúltima ou volta pra Pendente)
- Bug timezone CONSERTADO: `_dataLocalMeioDia_` evita dia errado

### Campanha (admin)
- Switch "Campanha ativa" (`CAMPANHA_ATIVA` em ScriptProperty)
- Objetivos por modalidade (casa/comercial/rural/cartas/telefone/público)
- Cada objetivo: tipo (geral/semana), título, descrição, link, anexo Drive, visibilidade
- Compartilhar PNG via html2canvas + texto WhatsApp

### Prédios — Cartas (admin)
- Lista auto-detectada (Dados Brutos agrupado por logradouro+numero ≥2)
- Modal editar com 3 campos NOVOS: **tipoEntrada** (porteiro/eletronica/sem),
  **acessoCaixas**, **acessoInterfones**. Campo legado `acessoInterfone`
  preservado pra compat mas UI nova não usa.
- Botão WhatsApp individual em cada card → link `?v=cartas&p=CHAVE`

### Painel publicador (Publico.html) — MODO SIMPLES é padrão na 1ª visita

**Modo Simples (hub → quadras → faces → paradas)**:
- Mapa pequeno no topo com GPS do publicador (ponto azul via `watchPosition`)
- Cards das quadras designadas, cada um com progresso
- Click em quadra → cards de **faces** (F1/F2/F3/F4 horário IBGE, coloridos)
- Click em face → lista de paradas (prédios agrupados + endereços soltos)
- Botão "Atualizar" + auto-refresh 2min pra ver marcações de outros publicadores
- Trabalha UMA quadra de cada vez, UMA face de cada vez

**Modo Avançado (lista por quadra)**:
- Quadras fechadas por default, click no header abre + pinta arestas
  coloridas por face no mapa topo
- Endereços agrupados por face dentro de cada quadra
- Botão "Editar prédio" no header do grupo (via `data-chave-pr`, não regex)
- Busca + filtros Todos/Pendentes/Feitos (Feito = qualquer desfecho OU carta)

**Comum (ambos modos)**:
- 3 botões mutex por endereço: 🚪 não atendeu / 📞 sem palestra / ✓ conversou
- ✉ carta (independente) — entrega marca em Registros E PrediosAptos
- Indicador de cobertura focado em PRÉDIOS COMPLETOS (não % de endereços)
- Aviso amarelo "X prédios com aptos pulados" — incentiva cobrir prédio inteiro
- Badge "antes" com memória do território (último desfecho de outro publicador)
- Toggle "Texto grande" (canto sup. direito) +25% fontes/botões pra idosos
- Indicador global de fila + offline (pill canto sup. esquerdo)
- "Editar prédio" no card (modo simples) — modal com tipoEntrada/caixas/interfones
- Link "Street View" no card de prédio
- Offline-first com `syncQueue` em localStorage + retry no `online` event
- Cache `publico_dados_v3_*` com TTL 24h, envelope `{t, d}`. Em `QuotaExceededError`,
  limpa caches v3 antigos de outras designações e tenta de novo

### Link de cartas (Cartas.html)
- Sem `?p=`: lista todos os prédios
- Com `?p=CHAVE`: foca num prédio, mostra aptos com 4 ações:
  - 🔵 Escrita / 🟢 Entregue / ⚪ Desocupado / 🔴 Não escrever
- Hero do prédio mostra badges: Porteiro/Eletrônica/Sem + Acesso caixas + Acesso interfones
- Links "Como chegar" + "Street View" no hero
- **Sync unificado**: marcar entregue aqui também escreve em Registros (publicador vê)

### Dirigente (Dirigente.html) — MAP-DRIVEN
- Mapa ocupa tela; sem lista
- Click numa quadra → bottom sheet com detalhes + alerta ⚠ se tem "não visitar"
- **Concluir inline** (data + botão), sem segundo modal
- Quadras concluídas viram vermelhas no mapa
- Modo Compartilhar: toolbar amarela, click adiciona/remove quadras à seleção
- **Estacionar perto**: Overpass API (OSM) busca estacionamentos/praças/farmácias/etc.
  Cada POI no mapa com tooltip "Mais perto de Q-X (~Y m)"
- GPS do dirigente (botão crosshair)
- Legenda overlay dinâmica (muda com densidade on/off)
- Contexto bbox sempre (vizinhança de outros territórios também)
- Exportar mapa esconde contexto/POIs, zoom apertado nas designadas

## Funções backend chave (Code.gs)

- `getDadosPublicos(idsString)` — payload do publicador. Enriquece com:
  `ultimoTipo`/`ultimoDataStr` (Registros), `emTCE`, `cartaEntregue` (PrediosAptos),
  `face` (Col C QUADRA_IBGE — legado) e `faceIBGE` (Col D — face de verdade)
- `getDadosComContexto(idsString)` — designadas + contexto (territorial + bbox).
  **Cacheado** por idsString (5min). Invalidação versionada via `DADOS_CTX_VER`.
- `_ultimoDesfechoPorRow_()` — cacheado 5min em `ULT_DESFECHO_V1`
- `_mapaCartasEntregues_()` — lê PrediosAptos pra sincronizar carta no publicador
- `salvarConclusaoQuadras(payload)` — write com lock; usa `_dataLocalMeioDia_`
  pra Date ao meio-dia local (anti-timezone). Depois `_fecharDesignacoesCompletas_`
- `desfazerConclusaoQuadra(id)` — restaura penúltima conclusão do Registros
- `salvarEdicaoQuadra({...})` — atualiza Quadras E propaga via `_propagarRenomeacaoIds_`
- `criarDesignacao({ids, publicador, prazo, notas})` — valida prazo
- `registrarCartaEndereco(row, undo)` — escreve em DUAS abas: Registros (trilha)
  + PrediosAptos.cartaEntregue. `undo=true` reverte ambos.
- `atualizarAptoStatus(row, patch)` — quando muda `cartaEntregue`, espelha em
  Registros (`carta`/`carta_undo`) pra publicador ver
- `registrarDesfechoEndereco(row, tipo)` — aceita `tipo=''` (undo, grava 'desfeito')
- `getOverlayPredioPublico(chave)` + `atualizarPredioPublico(chave, patch)` —
  endpoints públicos com whitelist (publicador edita só tipoEntrada/caixas/interfones)
- `listarPredios()` — cache `PREDIOS_LISTA_V1` (5min)
- `listarAptosDoPredio(chave)` — retorna `predio.lat/lng` (primeiro apto com coord)
- `getDensidadePredios()` — cache `DENSIDADE_PREDIOS_V1` (5min)
- `renomearQuadrasDoTerritorio(nome, prefixo, ordemIds?)` — cascata em 5 abas
- `_dataLocalMeioDia_(yyyymmdd)` — Date ao meio-dia local, anti-timezone

## Rodando os testes

```bash
node tests/run.js
```

74 testes em arquivos `tests/*.test.js`. Sintaxe de TODOS os `.gs` e
`<script>` em `.html` validada. Refatorações que quebram sintaxe falham
aqui ANTES de chegar no Apps Script.

## Branch / Deploy

- `main` — branch principal. Push em main = `clasp push` automático via
  `.github/workflows/deploy-apps-script.yml`
- Token em `secrets.CLASP_CREDENTIALS` (refresh_token), deployment id em
  `secrets.CLASP_DEPLOYMENT_ID`. Setup em `docs/clasp-setup.md`
- **`clasp push` envia HEAD ao Apps Script; `/exec` atualizado se o secret
  CLASP_DEPLOYMENT_ID estiver setado** (workflow faz `clasp deploy --deploymentId $ID`)
- URL `/dev` (Test deployments) sempre serve HEAD — boa pra dev
- `apps-script` branch é espelho automático da `main` só com arquivos do
  Apps Script (mantida por `sync-apps-script.yml`)

Desenvolva em feature branches e merge pra `main` quando os testes passarem.

## Limitações conhecidas

- Apps Script em iframe sandboxed — **sem Service Worker real** (PWA install limitado)
- `google.script.url.getLocation` (postMessage) **falha silenciosamente em iOS Safari**.
  Use `<?= var ?>` no template em vez de URL params
- `MailApp.sendEmail` cota ~100/dia em conta gratuita
- `LockService` timeout 20s no `withLock_`
- `CacheService.put` max 100KB por chave
- `dom-to-image-more` corta elementos fora do viewport (use `html2canvas` com
  `windowWidth` explícito pra capturar templates >viewport mobile)

## Hardenings importantes (não regredir)

- **XSS no publicador**: `item.nome`/`complemento`/`nota`/`emTCE.publicador`/
  `g.titulo` escapados com `escapeHtmlPub`. Não voltar a interpolar raw.
- **XSS via URL**: `link`/`anexoUrl` filtrados no backend (`_sanitizarUrl_`)
  E no frontend (`safeUrl`/`safeUrlPub`)
- **FileReader.onerror** definido em uploads
- **Cache TTL 24h** no publicador (envelope `{t, d}`)
- **Quadra órfã em designação**: `_fecharDesignacoesCompletas_` trata `undefined`
  como concluída
- **Race `_pastaAnexosCampanha_`**: cache ScriptProperty + `withLock_`
- **Anti-double-click**: `_togglesEmVoo` em `alternarPublicoObjetivo`
- **Sync de undo**: `marcarDesfecho` envia `tipo=''` pro Registros gravar 'desfeito'.
  `toggleCarta` envia `undo=true` quando desmarca.

## Anti-padrões observados (NÃO cair)

- **Regex literal dentro de template literal** (`` `... ${x.replace(/'/g, ...)}` ``)
  quebra o parser do HtmlService. Use `data-attribute` + `dataset` no onclick.
- **`innerHTML += html` dentro de forEach** — reparse quadrático. Sempre
  array.push + `innerHTML = arr.join('')` no fim.
- **`alert()`** — bloqueante em mobile. Sempre `window.toast()`.
- **`new Date("yyyy-MM-dd")` direto** — UTC midnight = dia errado em -3.
  Sempre `_dataLocalMeioDia_`.
- **`google.script.url.getLocation`** — usar template `<?= ids ?>` server-side.

## Auto-vinculação de endereços a quadras

Aba Polígonos → "Auto-vincular". Backend: `autoVincularEnderecos()`
- Agrupa por (setor + quadraIBGE) — unidade INDIVISÍVEL do IBGE
- Vínculo único existente → propaga
- Sem vínculo → point-in-polygon (`_pontoNoPoligono_`, ray-casting + bbox)
- ≥60% dos pontos dentro de uma quadra → vincula todos
- Vínculos divergentes → INCONSISTÊNCIA (card vermelho, "Unificar a Q-X (maioria)")
- "Ver no mapa" destaca pontos em roxo no `mapPoligonos`

## Faces IBGE em todo o app

- Backend: `getDadosPublicos` retorna `face` (Col C QUADRA_IBGE — legado) e
  `faceIBGE` (Col D — face de verdade). Frontend usa `faceIBGE` via `_faceKey(it)`.
- Modo simples: hub mostra mapa com arestas coloridas por face (cada aresta
  pintada com cor da face cujo centroide é mais próximo do meio da aresta).
- Modo avançado: endereços agrupados por face dentro de cada quadra; click
  no header da quadra pinta arestas no mapa topo.
- Paleta única `FACE_COLORS` em `Publico.html`.

## Auditoria de quadras

Aba Polígonos → "Auditar":
- Quadras com múltiplos clusters IBGE (erro humano potencial)
- Quadras vazias (sem endereço vinculado)
- "Ver no mapa" destaca no `mapPoligonos`
- "Tá certo, ignorar" persiste em ScriptProperty (`AUDIT_OK_MULTI`/`AUDIT_OK_VAZIA`)
- "Ver ignorados" mostra os que foram marcados como OK + botão "Reativar"

## Densidade de prédios

- `getDensidadePredios()` retorna `{quadraId → qtdPredios}`. Conta agrupamentos
  por (logradouro+numero) com ≥2 endereços. **Não conta endereços diretos** —
  aptos mascaram a contagem real
- Admin: select "Coloração" tem opção "Densidade de prédios"
- Dirigente: toggle "Densidade" + header mostra "X prédio(s)"

## TCE (Territórios Comerciais Especiais)

Aba `TerritoriosEspeciais`. Funções:
- `criarTerritorioComercial(payload)` — convex hull via Turf.js no front
- `listarTerritoriosComerciais(somenteAbertos?)`
- `getEnderecosEmTCE()` → `{row → {tceId, nome, publicador}}` (esmaece endereços no publicador)
- `getDadosTCE(id)` — payload do link `?v=publico&te=ID`
- `concluirTerritorioComercial` / `cancelarTerritorioComercial` / `reabrirTerritorioComercial`

## O que NÃO está aqui

- **Testemunho Público (TP)** com carrinhos — virou app separado
  ([thiagoarce/tp-carrinhos](https://github.com/thiagoarce/tp-carrinhos)).
  Schema MVP foi removido em `ab9eb3f`; histórico preservado em git.

## Próximos passos sugeridos (não obrigatórios)

- `data-obj=JSON.stringify(item)` no avançado infla DOM — fazer lookup-on-demand
- Aria-labels nos botões dinâmicos que sobraram (sortable handle, etc.)
- Service Worker pra tiles offline (bloqueado pela iframe do Apps Script —
  considerar PWA standalone se prioridade)
- Extrair `JS_App.html` em módulos (~4k linhas)
- Cleanup automático de aba `Registros` antiga (>12 meses)
- Relatório/dashboard de cobertura por quadra usando Pacote F (conversa/contato/não atendeu)
- Sincronizar `modo_pub` entre dispositivos do mesmo publicador (hoje localStorage per-device)
