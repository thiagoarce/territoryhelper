# Changelog

Mudanças relevantes do app. Datas relativas ao mês de release.

## 2026-06 (atual)

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
