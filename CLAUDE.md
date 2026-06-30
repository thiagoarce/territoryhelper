# CLAUDE.md — Guia para agentes IA neste repo

App PWA de gestão de territórios JW. **SvelteKit 2 + Svelte 5 (runes)**,
**Tailwind 3**, **Supabase** (Postgres + Auth + RLS + Storage + Realtime),
**MapLibre GL + OpenFreeMap** (tiles vetoriais grátis), deploy em
**Cloudflare Workers**. O app antigo em Google Apps Script foi 100% portado
e arquivado (tag/branch `v1-google-apps-script` no git).

## Layout de arquivos

- `src/routes/` — páginas SvelteKit (`+page.svelte` UI, `+page.server.ts`
  load + actions). Estrutura por role:
  - `admin/` — Geral (`/admin`), `poligonos`, `registro`, `predios`,
    `campanha`, `usuarios`, `auditoria`, `dev/sql`
  - `dirigente/` — mapa + arranjo + campanha
  - `publicador/` — designações, `quadra/[id]` (trabalhar), `tce/[id]`,
    arranjo, campanha
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
- `tests/` — `node tests/run.js`

## Modelo de dados (Supabase / Postgres)

| Tabela | O que guarda |
|---|---|
| `profiles` | usuário + `role` (publicador/dirigente/admin) |
| `territorios` | id text, nome, cor, status |
| `quadras` | id text, `poly geometry(Polygon,4326)`, color, `territorio_id`, **`ativa` boolean**, `data_conclusao` |
| `quadras_conclusoes` | histórico append-only de conclusões (data, autor) |
| `locais` | endereço físico: `geo Point`, tipo (casa/predio/comercio/coletivo/terreno), `quadra_id`, setor/quadra_ibge/face_ibge, portaria, `nao_eh_predio` |
| `unidades` | apto/unidade dentro de um local (carta, desocupado…) |
| `registros` | trilha append-only de eventos por unidade (conversou/carta/desfeito…) |
| `designacoes` | tipo pessoal/arranjo, publicador_id, dirigente_id, prazo, ponto de encontro |
| `designacao_quadras` / `designacao_publicadores` | N:N |
| `campanha` / `campanhas` | objetivos + período (data_inicio/alvo/meta_semanal) |
| `tces` / `tce_unidades` | Território Comercial Especial (convex hull) |
| `cartas_tokens` | link público de cartas |
| views `*_geo` | expõem geometria como GeoJSON (`poly_geojson` / `geo_geojson`) |

**Status de quadra = só `ativa` (boolean).** "Concluída/pendente" são
DERIVADOS de `data_conclusao` + `quadras_conclusoes`. Não existe mais
status='pendente'/'concluido'.

## Convenções

### Backend (`+page.server.ts`)
- `locals.supabase` = client com sessão; **RLS** faz o controle de acesso
  (admin write, publicador vê o próprio). Guards em `$lib/server/guards.ts`.
- Geometria escrita via **GeoJSON** (`{type,coordinates}`) — PostgREST coage
  pra `geometry`. Operações geométricas via **RPC PostGIS** (`ST_Union`,
  `ST_ConvexHull`, `ST_Split`, `ST_GeomFromGeoJSON`) — sem Turf no front.
- Toda query em tabela grande (locais/unidades/registros) usa `selectAll`.
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
- **Prédios** (`/admin/predios`) — lista + filtros + modal inline + WhatsApp
- **Campanha** (`/admin/campanha`) — período + mapa do período + gráfico semanal

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
