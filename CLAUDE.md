# CLAUDE.md — Guia para agentes IA neste repo

Este projeto é um app de Google Apps Script para gestão de territórios JW.
Frontend em Leaflet + Bootstrap, backend em Apps Script com Google Sheets
como banco. Quando trabalhar aqui, leia esta nota primeiro.

## Layout de arquivos

- `Code.gs` — entrada (`doGet`), funções de save/load, lógica de negócio
- `Constants.gs` — mapa de colunas, enums (STATUS, SHEET, MODALIDADES_CAMPANHA,
  STATUS_DESIGNACAO, DESFECHO). **Mude aqui se reordenar a planilha.**
- `Utils.gs` — `withLock_`, validações (`validarPolyString_`, `validarId_`,
  `validarData_`, `validarCor_`), `sanitizar_` (anti-formula-injection),
  `getSheetByName_`, `acharLinhaQuadra_`, `logErro_`
- `Index.html` — UI da Gestão (web app do servo de território)
- `Publico.html` — UI do publicador (recebe link com lista de quadras)
- `Dirigente.html` — UI do dirigente (marca como feita, exporta mapa)
- `CampanhaPublica.html` — tela motivacional pública da campanha
- `Cartas.html` — trabalho de cartas (lista prédios ou aptos de UM prédio)
- `JS_Core.html` — utilities compartilhadas (toast, confirmar, runApp,
  tema escuro, atalhos). Incluído ANTES de JS_App.
- `JS_App.html` — JS principal da Gestão (Visão Geral, Polígonos, Registro,
  Campanha, Prédios)
- `CSS.html` — estilos compartilhados (incluído só pelo Index)
- `tests/` — testes Node sem deps; `node tests/run.js`
- `docs/` — documentação (manual do usuário, setup clasp)
- `.github/workflows/` — CI (tests, deploy-apps-script, sync-apps-script)

## Modelo de dados (abas no Sheets)

Todas as abas são **autocriadas** via `ensureSheet*_()` na primeira escrita
ou leitura. Schemas em `Constants.gs`.

| Aba | O que guarda | Auto-criada por |
|---|---|---|
| `Quadras` | id, polyString, color, territorio, status (Pendente/Concluído), dataConclusao | manual |
| `Territorios` | nome, cor, ids_quadras (CSV), polyString, label_pos, label_type, status, dataConclusao | manual |
| `Dados Brutos` | endereços IBGE (logradouro, número, lat/lng, tipo, etc) | manual |
| `Registros` | trilha de eventos (auto/manual/desfeito/carta/conversou/semConversa/naoAtendeu) | salvarConclusaoQuadras |
| `Campanha` | objetivos estruturados {id, tipo (geral/semana), modalidade, titulo, descricao, link, anexo, publico} | ensureSheetCampanha_ |
| `Designacoes` | território pessoal — quadras travadas em nome de publicador {id, ids_quadras, publicador, criada, prazo, status, notas} | ensureSheetDesignacoes_ |
| `Predios` | overlay manual sobre Dados Brutos {chave="logradouro|numero", nome, irmaoMora, nomeIrmao, acessoInterfone, naoEhPredio, notas, ultimaCarta} | ensureSheetPredios_ |
| `PrediosAptos` | overlay per-apto {row→DadosBrutos, cartaEscrita, cartaEntregue, desocupado, naoEscrever} | ensureSheetPrediosAptos_ |

**Migração de schema**: as `ensureSheet*_` checam `getLastColumn()` e completam
cabeçalho com colunas novas (idempotente, sem perda de dados).

## Convenções

### Backend
- Toda função de write usa `withLock_(function() { ... })` (LockService 20s)
- Toda função de write chama `_invalidar()` no fim — limpa cache do `CacheService`
- Acessos a colunas usam `COL.QUADRAS.X` (0-indexed) ou `COL.QUADRAS.X_1IDX`
  (1-indexed para `getRange()`)
- Status canônicos: `STATUS.PENDENTE` / `STATUS.CONCLUIDO`
- `sanitizar_(valor)` antes de gravar strings vindas do usuário
- `_sanitizarUrl_(url)` antes de gravar URLs (só http(s)/mailto)
- `_propagarRenomeacaoIds_(mapa)` cascateia renomeação de quadra em
  Dados Brutos + Territorios + Designacoes + Registros (chamado dentro
  do lock)

### Frontend
- Prefira `window.toast(msg, tipo)` a `alert()`
- Confirmação destrutiva: `window.confirmar({titulo,mensagem,perigo:true})`
- `google.script.run` envolvido com `withSuccessHandler`/`withFailureHandler`
- Polígonos: formato string `lat,lng | lat,lng | ...`
- Render de HTML com input do usuário: SEMPRE escapar com `escapeHtml`/`_escHtml`/`escapeHtmlPub`.
  Pra `href`, usar `safeUrl` (bloqueia `javascript:` etc).
- Sempre `rel="noopener"` em `<a target="_blank">`

## Features principais (state atual)

### Visão Geral (admin)
- Mapa com quadras + territórios
- Botão "Designações" → modal lista designações abertas/vencidas
- Seleção de quadras → barra "Compartilhar" → modal com:
  - Card "Território Pessoal" (opcional — nome + prazo)
  - Link gerado (publico ou dirigente)
  - Email, WhatsApp, copiar
  - Cria `Designacao` no backend ao compartilhar se nome preenchido
- Cadeado 🔒 azul/vermelho no centro de quadras designadas (overlay
  `lgGeralDesignacoes`); cache `window._quadrasDesignadasCache` evita
  roundtrip em cliques
- Alerta antes de selecionar quadra já designada (impede redesignar)

### Polígonos (admin)
- Vincular faces (endereços) a quadras: selecionar pontos + clicar na quadra
- Filtros: **Tipo** (Dom/Com) × **Vínculo** (Vinculados/Sem quadra)
- Botão "Renomear" → modo interativo: clica nas quadras na ordem que
  devem receber A, B, C (com prefixo do território). Veja
  `renomearQuadrasDoTerritorio(nome, prefixo, ordemIds?)`

### Registro (admin)
- Mapa com quadras coloridas por gradiente temporal
- Seleção pra marcar como Concluído (com data)
- Botão "Desfazer" em quadras concluídas — restaura data anterior
  (não força Pendente). Veja `desfazerConclusaoQuadra`
- Mesmo overlay 🔒 do mapa Geral + mesmo alerta antes de selecionar

### Campanha (admin)
- Switch principal **"Campanha ativa"** (`CAMPANHA_ATIVA` em ScriptProperty)
- Quando OFF, painel público mostra "Sem campanha ativa"
- Seção **Objetivos** estruturados por modalidade (casa, comercial,
  rural, cartas, telefone, testemunho público). Cada objetivo tem
  tipo (geral/semana), título, descrição, link, anexo (upload Drive),
  switch público. Toggle visível inline na lista admin
- Botão "Compartilhar" → gera PNG com html2canvas (template oculto
  `#cardCampanhaTemplate`) + texto pra WhatsApp

### Prédios — Cartas (admin, 5ª aba)
- Lista auto-detectada: agrupa Dados Brutos por (logradouro+numero),
  ≥2 endereços = prédio. Cache 5min em `CacheService`
- Modal editar: nome, switch "irmão mora" + nome do irmão, radio
  acesso (individual/portaria/—), switch "não é prédio", notas
- Filtros: busca + "Só com irmão" + "Mostrar não-prédios"
- **Botão WhatsApp individual em CADA card** — gera link `?v=cartas&p=CHAVE`
- Detecção e overlays separados pra não bloquear (Drive público
  com `ANYONE_WITH_LINK` em uploads)

### Painel publicador (Publico.html)
- Lista por quadra com endereços ordenados (rota dentro da quadra)
- Botão "inverter sentido" (sentido horário/anti-horário via atan2 em
  volta do centroide do polígono); persiste em localStorage `rota_h_QID`
- 3 botões de desfecho **mutex** por endereço:
  - 🚪 cinza — não atendeu
  - 📞 amarelo — atendeu, sem palestra
  - ✓ verde — conversou
- ✉ laranja — carta (independente, combina com qualquer desfecho)
- Indicador de cobertura no topo: "X de Y endereços alcançados"
  + breakdown (conversas/contatos/não atenderam/cartas). Cores:
  verde ≥70%, amarelo 30-69%, cinza <30%. **Sem vermelho** — não
  culpabiliza
- Badge "antes" pequeno em endereço com registro prévio de outro publicador
  — memória do território. Some quando essa sessão marca algo
- Mapa Leaflet em cima, legenda das cores
- Cache `publico_dados_v3_` com TTL de 24h

### Link de cartas (Cartas.html)
- Sem `?p=`: lista todos os prédios (visão geral)
- Com `?p=CHAVE`: foca num prédio, mostra aptos com 4 ações:
  - 🔵 Escrita (azul)
  - 🟢 Entregue (verde)
  - ⚪ Desocupado (cinza)
  - 🔴 Não escrever (vermelho — borda esquerda no card)
- Aviso amarelo no topo se prédio é "portaria eletrônica"
- Badge "antes" também aparece nos aptos

### Dirigente (Dirigente.html)
- Recebe link `?v=dirigente&ids=...`
- Lista de quadras designadas + mapa com contexto (vizinhança)
- Modal "Enviar pro publicador" tem card "Território Pessoal"
- Exportar cartão de território como PNG (dom-to-image-more — Leaflet
  com translate3d) com legenda de cores + localidade (Nominatim
  reverse geocode + fallback "Congregação Aeroclube")
- Botão "Desfazer" em concluídas

## Funções backend chave (Code.gs)

- `getDadosPublicos(idsString)` — enriquecido com `ultimoTipo`/`ultimoDataStr`
  por endereço (memória do território, lê aba Registros 1x)
- `getDadosComContexto(idsString)` — designadas + contexto (outras quadras
  do mesmo território, ou bbox geográfico se sem território explícito)
- `salvarConclusaoQuadras(payload)` — write com lock; depois
  `_fecharDesignacoesCompletas_` que **remove** quadras concluídas das
  designações abertas (não fecha designação inteira a menos que ela
  fique vazia)
- `desfazerConclusaoQuadra(id)` — restaura penúltima conclusão do
  Registros ou volta pra Pendente. Fallback de sort por linha quando
  ts é inválido (linhas legadas)
- `salvarEdicaoQuadra({idOriginal, idNovo, ...})` — atualiza Quadras E
  propaga em cascata via `_propagarRenomeacaoIds_`. Detecta conflito de ID
- `criarDesignacao({ids, publicador, prazo, notas})` — valida prazo
  com `validarData_`, retorna `{ok, id, conflitos[]}`
- `criarObjetivoCampanha/atualizarObjetivoCampanha/removerObjetivoCampanha`
  — campanha CRUD. URLs filtradas com `_sanitizarUrl_`
- `uploadAnexoCampanha({base64, nome, mime})` — Drive com
  `withLock_` + cache de folderId em ScriptProperty
- `listarPredios()` — detecção + overlay manual, cache 5min em
  `CacheService` (chave `PREDIOS_LISTA_V1`)
- `listarAptosDoPredio(chave)` — enriquecido com status individual +
  último desfecho. Usado pelo link `?v=cartas&p=`
- `renomearQuadrasDoTerritorio(nome, prefixo, ordemIds?)` — cascata
  em 5 abas. Detecta conflitos antes de aplicar

## Rodando os testes

```bash
node tests/run.js
```

Sintaxe de TODOS os arquivos `.gs` e `<script>` em `.html` é verificada.
Refatorações que quebram sintaxe falham aqui ANTES de chegar no Apps Script.

## Branch / Deploy

- `main` — branch principal de dev. Contém TUDO (testes, CI, docs, clasp).
- `apps-script` — espelho automático da `main` SÓ com arquivos do Apps
  Script. Existe para a extensão gas-github poder pullar sem engasgar.
  Atualizada por `sync-apps-script.yml`.
- Deploy automático: workflow `deploy-apps-script.yml` faz `clasp push`
  toda vez que `.gs`/`.html`/`appsscript.json` mudam em `main`.
  Token em `secrets.CLASP_CREDENTIALS`. Setup em `docs/clasp-setup.md`.
- **`clasp push` envia código pra HEAD, NÃO atualiza deployment `/exec`**.
  Pra URL pública estável: edite o deployment existente em
  "Deploy → Manage deployments" (mantém URL) em vez de criar "New deployment".
- URL `/dev` (Test deployments) sempre serve HEAD — boa pra dev.

Desenvolva em feature branches e merge para `main` quando os testes passarem.

## Limitações

- Apps Script roda em iframe sandboxed: **sem Service Worker real** —
  PWA install completo não funciona. Meta tags "Add to home screen"
  funcionam parcialmente no iOS.
- `MailApp.sendEmail` tem cota diária (~100 emails/dia em conta gratuita).
- LockService tem timeout de 20s no `withLock_`.
- `dom-to-image-more` corta elementos fora do viewport (use `html2canvas`
  com `windowWidth` explícito pra capturar templates >viewport mobile).
- Cache TTL em `CacheService`: `DADOS_MAPA_CACHE`, `PREDIOS_LISTA_V1`.
  `_invalidar()` limpa ambos.

## Hardenings importantes (não regredir)

- **XSS**: campos `link`/`anexoUrl` filtrados no backend
  (`_sanitizarUrl_`) E no frontend (`safeUrl`/`safeUrlPub`). Render
  com `escapeHtml` em tudo que vem do usuário (publicador, nomes,
  título de objetivo, etc).
- **FileReader.onerror** definido em uploads (modal de objetivos)
- **Cache do publicador**: TTL de 24h em `publico_dados_v3_` (envelope
  `{t, d}` em localStorage)
- **Quadra órfã em designação**: `_fecharDesignacoesCompletas_` trata
  `statusPorId === undefined` como concluída (não trava designações zumbis)
- **Race em `_pastaAnexosCampanha_`**: cache do folderId em
  ScriptProperty + `withLock_` em `uploadAnexoCampanha`
- **Anti-double-click**: `_togglesEmVoo` em `alternarPublicoObjetivo`
- **HTML tags**: cuidado com `<small>` fechado com `</div>` (já houve
  regressão dessa). Validar HTML manualmente nos modais novos.

## Decisões de produto / escopo

- **Comercial é minimal**: o filtro "Com" em Polígonos só sinaliza
  pontos comerciais no editor. Não há fluxo dedicado de trabalho
  comercial (sem horário próprio, sem objetivo específico, sem
  separação no indicador de cobertura do publicador).
  - **Próxima feature pedida**: criar "Território Comercial Especial"
    que pega endereços comerciais de QUALQUER quadra e gera um
    território separado, atravessando fronteiras de quadras. Modelo
    de dados ainda não definido — talvez aba `TerritoriosEspeciais`
    com {nome, ids_enderecos_csv (rows de Dados Brutos), publicador}.

## Próximos passos sugeridos (não obrigatórios)

- **Offline-fila no publicador**: hoje `marcarDesfecho` é fire-and-
  forget. Sem rede, toques se perdem sem aviso. Implementar fila em
  localStorage com retry quando voltar online + indicador visual de
  "pending sync" no card do endereço
- **Territórios Comerciais Especiais** (ver Decisões de produto)
- Extrair JS_App.html em módulos (~2700 linhas)
- Notificação automática por email quando designar
- Cleanup automático de aba `Registros` antiga (>12 meses)
- Relatório/dashboard mostrando qualidade de cobertura por quadra
  (conversa/contato/não atendeu) usando dados do Pacote F
