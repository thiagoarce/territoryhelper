# CLAUDE.md — Guia para agentes IA neste repo

Este projeto é um app de Google Apps Script para gestão de territórios.
Frontend em Leaflet + Bootstrap, backend em Apps Script com Google Sheets
como banco. Quando trabalhar aqui, leia esta nota primeiro.

## Layout de arquivos

- `Code.gs` — entrada (`doGet`), funções de save/load, lógica de negócio
- `Constants.gs` — mapa de colunas, enums STATUS/SHEET. **Mude aqui se
  reordenar a planilha.** Todo o resto referencia.
- `Utils.gs` — `withLock_`, validações (`validarPolyString_`,
  `validarId_`, `validarData_`, `validarCor_`), `sanitizar_` (anti
  fórmula-injection), `getSheetByName_`, `acharLinhaQuadra_`, `logErro_`
- `Index.html` — UI da Gestão (web app para o servo de território)
- `Publico.html` — UI do publicador (recebe link com lista de quadras)
- `Dirigente.html` — UI do dirigente (marca como feita, exporta mapa)
- `CampanhaPublica.html` — tela motivacional pública da campanha
- `JS_Core.html` — utilities compartilhadas (toast, confirmar, runApp,
  tema escuro, atalhos de teclado). Incluído ANTES de JS_App.
- `JS_App.html` — JS principal da Gestão (Visão Geral, Editor,
  Registro, Campanha)
- `CSS.html` — estilos compartilhados
- `tests/` — testes Node sem deps; rodar com `node tests/run.js`
- `.github/workflows/tests.yml` — CI que roda os testes em push/PR

## Convenções

### Backend
- Toda função de write usa `withLock_(function() { ... })` para evitar
  escrita concorrente
- Toda função de write chama `_invalidar()` no fim para limpar o cache
- Acessos a colunas usam constantes de `COL.QUADRAS.X` (0-indexed) ou
  `COL.QUADRAS.X_1IDX` (1-indexed para `getRange()`)
- Status canônicos: `STATUS.PENDENTE` e `STATUS.CONCLUIDO`. Não use
  "Iniciado" — esse fluxo foi removido
- Use `sanitizar_(valor)` antes de gravar strings que vêm do usuário

### Frontend
- Prefira `window.toast(msg, tipo)` a `alert()`
- Para confirmação destrutiva use `window.confirmar({titulo,mensagem,perigo:true})`
- `window.runApp({loading, sucesso, onSuccess, onError})` envolve
  `google.script.run` com toast/loading padrão
- Coordenadas em polígonos: formato `lat,lng | lat,lng | ...`

## Rodando os testes

```bash
node tests/run.js
```

Sintaxe de TODOS os arquivos `.gs` e `<script>` em `.html` é verificada.
Refatorações que quebram sintaxe falham aqui ANTES de chegar no Apps Script.

## Branch

Branch principal: `main`. Desenvolva em branches e merge para `main`
quando estiver com testes passando.

## Limitações

- Apps Script roda em iframe sandboxed: **não dá pra ter Service Worker
  real** — então PWA install completo não funciona. As meta tags de
  "Add to home screen" funcionam parcialmente no iOS.
- `MailApp.sendEmail` tem cota diária (~100 emails/dia em conta
  gratuita).
- LockService tem timeout de 20s no nosso `withLock_`.

## Próximos passos sugeridos (não obrigatórios)

- Extrair JS_App.html em mais módulos (Editor, Registro, Campanha)
- Adicionar tela "minhas designações pendentes" para o dirigente
- Notificação automática via email quando designar
- Cleanup automático de aba `Registros` antiga (> 12 meses)
