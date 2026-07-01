# CLAUDE.md — Guia para agentes IA neste repo

App PWA de gestão de territórios JW. **SvelteKit 2 + Svelte 5 (runes)**,
**Tailwind 3**, **Supabase** (Postgres + Auth + RLS + Storage + Realtime),
**MapLibre GL + OpenFreeMap** (tiles vetoriais grátis), deploy em
**Cloudflare Workers**. O app antigo em Google Apps Script foi 100% portado
e arquivado (tag/branch `v1-google-apps-script` no git).

## Layout de arquivos

- `src/routes/` — páginas SvelteKit (`+page.svelte` UI, `+page.server.ts`
  load + actions). Só 2 modos (specs.md revisado): **admin** e **campo**.
  - `admin/` — Geral (`/admin`), `poligonos`, `registro`, `predios`
    (com Trabalhar + GPS + Designar cartas), `campanha`, `arranjos`,
    `usuarios`, `auditoria`, `dev/sql`
  - `publicador/` — modo campo (**tanto publicador quanto dirigente**):
    designações (com pessoal/pregação/cartas), `quadra/[id]` (com
    "Marcar concluída" se dirigente), `mapa` (mapa estratégico com POIs
    + delegar temp — só dirigente/admin), `predios` (busca+GPS+criar
    pendente+designar), `arranjo` (com Distribuir/Assumir se dirigente),
    `campanha`, `tce/[id]`
  - `dirigente/` — só um `+layout.server.ts` que redireciona pra
    `/publicador/*` (URLs antigas)
  - `predio/[id]` — **tela ÚNICA de trabalhar prédio**, toggle
    🚪 casa-em-casa vs ✉ cartas + edit + WhatsApp share
  - públicas (sem auth): `cartas/[token]`, `convite/[token]`, `c`, `login`
- `src/lib/components/` — `MapaAdmin.svelte` (mapa de quadras reutilizável),
  `MapaPoligonos.svelte` (editor de polígonos + terra-draw), `AdminMapa.svelte`,
  `EditarLocalSheet.svelte`, `InstallPrompt.svelte`
- `src/lib/server/queries.ts` — helpers de query. **`selectAll<T>()`** pagina
  além do limite 1000 do PostgREST + dedup por id.
- `src/lib/ui/` — primitives: `Button`, `Card`, `BottomSheet`, `toast.svelte.ts`
- `src/hooks.server.ts` — client Supabase + sessão em `locals`
- `supabase/migrations/` — SQL numerado. Aplicar via `/admin/dev/sql` (RPC
  `exec_sql`) ou painel Supabase.
- `scripts/migrate-from-csv.ts` — importa CSVs do IBGE/GAS → Postgres
- `scripts/fill-complementos.ts` — patch idempotente pra preencher
  `unidades.complemento` do CSV sem destruir dados
- `tests/` — `node tests/run.js`

## Modelo de dados (Supabase / Postgres)

| Tabela | O que guarda |
|---|---|
| `profiles` | usuário + `role` (publicador/dirigente/admin) |
| `territorios` | id text, nome, cor, status |
| `quadras` | id text, `poly geometry(Polygon,4326)`, color, `territorio_id`, **`ativa` boolean**, `data_conclusao` |
| `quadras_conclusoes` | histórico append-only de conclusões (data, autor) |
| `locais` | endereço físico: `geo Point`, tipo (casa/predio/comercio/coletivo/terreno), `quadra_id`, setor/quadra_ibge/face_ibge, portaria, `nao_eh_predio`, **`pendente`** (criado pelo publicador; admin valida) |
| `unidades` | apto/unidade dentro de um local (carta, desocupado…) |
| `registros` | trilha append-only de eventos por unidade (conversou/carta/desfeito…) |
| `designacoes` | tipo **pessoal/arranjo/cartas**, publicador_id, dirigente_id, prazo, ponto de encontro |
| `designacao_quadras` / `designacao_publicadores` / `designacao_locais` | N:N (locais só p/ tipo='cartas') |
| `arranjos` / `arranjo_modalidades` | saídas coordenadas de campo (cartas, pregação, TP) |
| `delegacoes_temp` | delegação efemera de quadras (dirigente → publicador, expira sozinha em `data_fim` — default fim do dia) |
| `campanha` / `campanhas` | objetivos + período (data_inicio/alvo/meta_semanal) |
| `tces` / `tce_unidades` | Território Comercial Especial (convex hull) |
| `cartas_tokens` | link público de cartas |
| views `*_geo` | expõem geometria como GeoJSON (`poly_geojson` / `geo_geojson`) |

**Status de quadra = só `ativa` (boolean).** "Concluída/pendente" são
DERIVADOS de `data_conclusao` + `quadras_conclusoes`. Não existe mais
status='pendente'/'concluido'.

## Convenções

### Backend (`+page.server.ts`)
- `locals.supabase` = client com sessão; **RLS** faz o controle de acesso.
  Guards em `$lib/server/guards.ts` — usar **`exigirQuadraDesignada`** em
  qualquer rota que trabalhe conteúdo de quadra pelo publicador.
- **Defesa em profundidade**: além de RLS, checar `locals.profile?.role`
  no início das actions que precisam ser role-restritas (concluir quadra,
  distribuir, assumir arranjo, designar cartas, delegar temp).
- **RLS de `locais`/`unidades`** (migration 026/029) usa
  `pode_editar_local(bigint)` — publicador só edita local que está em
  designação/arranjo/delegação temp ativa dele.
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

- **Geral** (`/admin`) — mapa multi-seleção de quadras; designar (pessoal/
  arranjo) + **designar TCE** (designações ficam todas aqui). Cor por
  status (recência) / território / densidade.
- **Polígonos** (`/admin/poligonos`) — editor único, modos:
  - **Vincular**: pontos de endereço + filtros + cluster "por face" (IBGE);
    click vincula a quadra
  - **Quadras**: renomear, território, ativa, **desenhar/editar forma**
    (terra-draw), **juntar** (ST_Union), **dividir** (ST_Split), **excluir**
  - **Territórios**: CRUD, agrupar quadras, deletar (orfaniza)
  - **TCE**: seleciona comércios/faces → convex hull → cria
  - **Auditar**: multi-cluster IBGE, vazias, órfãs sem território
- **Registro** (`/admin/registro`) — mapa colorido por idade da conclusão;
  marcar concluída (com histórico + conflito de data anterior)
- **Prédios** (`/admin/predios`) — lista + filtros + modal inline + WhatsApp +
  **📍 Proximidade GPS** + ▶ trabalhar (→ `/predio/[id]`) +
  ⏳ **Validar pendente** + 🎯 **Designar cartas** + 📅 Anexar arranjo
- **Campanha** (`/admin/campanha`) — período + mapa do período + gráfico semanal
- **Arranjos** (`/admin/arranjos`) — modalidades + agenda semana/mês/3m/ano +
  recorrência gera N pontuais editáveis + anexar prédios/quadras

## Telas principais (modo campo — publicador + dirigente)

- **Designações** (`/publicador`) — home. Card destacado se campanha ativa +
  card amarelo "🚶 Pregando com dirigente agora" (delegação temp).
  Carteira dividida em Território pessoal / Pregação em grupo /
  ✉ Cartas designadas + lista TCEs abertos.
- **Mapa** (`/publicador/mapa`) — só dirigente/admin. Mapa map-driven pra
  concluir quadra, POIs (Estacionar perto → marcadores no mapa + rota
  Google Maps), 📸 PNG export, 👤 Delegar temp (subset de quadras pra
  publicador com prazo curto).
- **Arranjo** (`/publicador/arranjo`) — read-only pra publicador; dirigente
  ganha **Distribuir quadras** (nos arranjos dele) + **👋 Assumir dirigência**
  (nos arranjos dos outros).
- **Prédios** (`/publicador/predios`) — busca + 📍 GPS + tabs/filtros +
  criar prédio pendente. Se dirigente: checkbox multi-seleção + 🎯
  Designar cartas.
- **Campanha** (`/publicador/campanha`) — objetivos + gráfico.
- **/predio/[id]** — tela ÚNICA de trabalhar um prédio. Toggle
  **🚪 Casa em casa** (registros: conversou/semConversa/naoAtendeu/carta)
  vs **✉ Cartas** (unidades: carta_entregue/desocupado/nao_escrever).
  Header tem ✏ Editar + 📤 WhatsApp share. Progresso duplo.

## Deploy

- Branch `main` → Cloudflare Workers auto-deploy.
- `pwa-rewrite` era a branch de desenvolvimento (já mergeada).
- Migrations novas: rodar SQL no `/admin/dev/sql` (cola o conteúdo do arquivo
  `supabase/migrations/0XX_*.sql`).
- `.env`: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (só pro script de migração).

## Anti-padrões (não cair)

- `$effect` com early-return antes de ler deps → não rastreia.
- `interpolate(zoom)` aninhado em `match` no MapLibre → erro.
- `delete().neq('id','x')` em coluna bigint → falha silenciosa; use TRUNCATE/`.gte`.
- Paginação por offset sem `.order()` estável → duplica/pula linhas.
- `alert()` / `new Date("yyyy-mm-dd")` direto.

## Rodando testes

```bash
node tests/run.js
```
