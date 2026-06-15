# Territory Helper

App de gestão de territórios para congregações. Roda em **Google Apps Script** com **Google Sheets** como banco. Frontend em **Leaflet + Bootstrap**.

> Quer ver como usar? → [`docs/MANUAL.md`](docs/MANUAL.md)
> É um agente IA ou novo dev? → [`CLAUDE.md`](CLAUDE.md)

---

## O que faz

Três perfis de usuário, cada um com sua tela:

- **Servo de Território** (admin): mapa geral, editor de quadras/territórios, registro de conclusões, dashboard da campanha, trabalho de cartas em prédios. Recebe link `/exec` direto.
- **Dirigente**: recebe link `?v=dirigente&ids=Q-1,Q-2...` com as quadras designadas. Marca como feita, exporta cartão impresso, reenvia pro publicador.
- **Publicador**: recebe link `?v=publico&ids=...`. Vê os endereços por quadra, marca cada um como **conversou / atendeu sem palestra / não atendeu / carta entregue**, com rota sugerida em volta da quadra.

Outras telas públicas:
- `?v=campanha` — painel motivacional da campanha em curso
- `?v=cartas` — trabalho de cartas (lista de prédios)
- `?v=cartas&p=CHAVE` — apartamentos de UM prédio específico

---

## Arquitetura rápida

```
Google Sheet (várias abas)
       ↑
     Code.gs (Apps Script — Sheets API)
       ↑
   doGet roteia por ?v=
       ↓
   Index.html | Dirigente.html | Publico.html | CampanhaPublica.html | Cartas.html
```

Abas no Sheets (autocriadas conforme necessário):
- `Quadras`, `Territorios`, `Dados Brutos` (endereços IBGE)
- `Registros` — trilha de conclusões e eventos por endereço
- `Campanha` — objetivos estruturados por modalidade
- `Designacoes` — território pessoal travado
- `Predios` + `PrediosAptos` — overlay manual sobre Dados Brutos pro trabalho de cartas

Detalhes em [`CLAUDE.md`](CLAUDE.md).

---

## Stack

- **Backend**: Google Apps Script (JavaScript V8) com Google Sheets como persistência via SpreadsheetApp. `LockService` pra concorrência, `CacheService` pra performance, `PropertiesService` pra config.
- **Frontend**: HTML templates servidos por `HtmlService.createTemplateFromFile`. Leaflet 1.9 (mapas), Bootstrap 5 (UI), html2canvas / dom-to-image-more (exportar cartões PNG), Nominatim (reverse geocode de localidade).
- **Deploy**: `clasp` automatizado via GitHub Actions.

---

## Desenvolvimento

### Setup local

Clone, e roda os testes:

```bash
git clone <repo>
cd territoryhelper
node tests/run.js
```

Os testes não têm deps externas — verificam sintaxe de todos os `.gs` e blocos `<script>` em `.html`, mais checagens estruturais em `Constants.gs` (consistência de COL.X / COL.X_1IDX).

### Deploy automático

Push em `main` dispara o workflow [`deploy-apps-script.yml`](.github/workflows/deploy-apps-script.yml) que faz `clasp push` para o Apps Script real. Setup do token em [`docs/clasp-setup.md`](docs/clasp-setup.md).

**Importante**: `clasp push` envia código pra HEAD, **mas não atualiza o deployment `/exec`**. Pra URL pública pegar a versão nova, edite o deployment existente em "Manage deployments" (mantém URL). Pra dev/teste, use a URL `/dev` que sempre serve HEAD.

### Branches

- `main` — dev. Contém testes, CI, docs.
- `apps-script` — espelho automático com SÓ os arquivos do Apps Script. Existe pra extensão gas-github não engasgar.

---

## Limitações conhecidas

- Apps Script roda em iframe sandboxed → sem Service Worker real → PWA install completo não funciona.
- `MailApp.sendEmail` ~100 emails/dia em conta gratuita.
- `LockService` timeout de 20s.
- Nominatim (reverse geocode): rate limit 1 req/seg.

---

## Hardenings

O código tem cuidados pra evitar problemas comuns:
- **XSS** via campos `link`/`anexoUrl`: filtrado no backend (`_sanitizarUrl_`) + frontend (`safeUrl`) → bloqueia `javascript:` / `data:`. Tudo que vem do user é escapado com `escapeHtml` no render.
- **Cache do publicador** com TTL de 24h, formato `{t, d}` → não fica eternamente preso em dados velhos se backend cair.
- **Race em criação de pasta no Drive**: lock + cache do folderId em ScriptProperty.
- **Designações zumbis**: trata quadras removidas como concluídas pra fechar designações órfãs.
- **Cascata de IDs**: renomear quadra (manual ou em massa) atualiza Dados Brutos, Territorios, Designacoes, Registros — sem deixar referências órfãs.

---

## Licença

Privado para uso da congregação. Sem garantias.
