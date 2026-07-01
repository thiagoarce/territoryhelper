# Territory Helper — PWA v2

Reescrita PWA do Territory Helper. Stack:

- **Frontend**: SvelteKit + Tailwind
- **Hosting**: Cloudflare Pages
- **Backend/DB**: Supabase (Postgres + Auth + Realtime + Storage)
- **Email**: Resend (esqueci minha senha)

> A versão Google Apps Script está preservada na branch
> [`v1-google-apps-script`](https://github.com/thiagoarce/territoryhelper/tree/v1-google-apps-script).
> Pra rollback: `git checkout v1-google-apps-script` + reativar os workflows
> em `.github/workflows/deploy-apps-script.yml.disabled`.

## Setup local

```bash
# 1. Variáveis de ambiente
cp .env.example .env
# Preencha PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY com os valores do seu projeto Supabase

# 2. Dependências
npm install

# 3. Aplicar migrations no Supabase
# Vá em supabase.com → seu projeto → SQL Editor.
# IMPORTANTE: rode primeiro 'create extension if not exists postgis;'
# (Supabase free tier suporta).
# Depois cole e rode na ORDEM:
#   001_profiles_and_auth.sql      (auth + role + RLS profile)
#   002_geografia.sql              (territorios, quadras, locais, unidades + PostGIS)
#   003_pessoas.sql                (convites, arranjos legacy)
#   004_designacoes.sql            (designacoes + junção, tces + junção)
#   005_eventos.sql                (registros)
#   006_conteudo.sql               (campanha)
#   007_auditoria.sql              (audit_log + triggers automáticas)
#   008_rls.sql                    (todas as Row Level Security policies)
#   009_fix_profiles_rls.sql       (fix recursão infinita em RLS)
#   010_fix_search_path_e_service_role.sql (fix search_path + bypass)
#   011_exec_sql.sql               (função pra upload de SQL via app)
#   012_geojson_views.sql          (views PostGIS → GeoJSON pro mapa)
#   013_auto_vincular.sql          (auto-vincular endereços via ST_Contains)
#   014_link_publico_cartas.sql    (token público pra trabalho de cartas)
#   015_storage_fotos.sql          (bucket de fotos dos prédios)
#   016_campanhas.sql              (períodos de campanha — nome + datas)
#   017_arranjo_multi_publicador.sql (designacoes.tipo + junção pubs)
#   018_nao_eh_predio.sql          (flag locais.nao_eh_predio)
#   019_quadras_conclusoes.sql     (histórico append-only)
#   020_quadras_ativa.sql          (booleano ativa em vez de status)
#   022_criar_tce.sql              (RPC ST_ConvexHull pra criar TCE)
#   023_quadra_geometria.sql       (salvar polígono via GeoJSON)
#   024_dividir_quadra.sql         (RPC ST_Split)
#   025_arranjos.sql               (modalidades + arranjos + storage)
#   026_rls_hardening.sql          (RLS estrita locais/unidades)
#   027_delegacoes_temp.sql        (delegação temporária dirigente→publicador)
#   028_locais_pendente.sql        (publicador cria prédio pendente)
#   029_designacao_locais.sql      (designacao tipo='cartas' + junção)
#
# ALTERNATIVA: depois de 011, usa /admin/dev/sql no app pra upload em
# massa dos restantes (cola o conteúdo do .sql).

# 4. Criar o primeiro admin (no SQL Editor do Supabase):
# Crie o usuário via dashboard de Auth (insira email+senha manualmente).
# Depois rode:
# UPDATE profiles SET role='admin', nome='Seu Nome' WHERE id=(SELECT id FROM auth.users WHERE email='seuemail@ex.com');

# 5. Dev server
npm run dev
```

## Estrutura

App em **2 modos** apenas: admin (organizador) e campo (publicador+dirigente
na mesma tela; dirigente ganha ações extras por role).

- `src/routes/login/` — tela de login (email + senha)
- `src/routes/admin/` — painel do servo de território (Geral, Polígonos,
  Registro, Prédios, Campanha, Arranjos, Usuários…)
- `src/routes/publicador/` — modo campo:
  - `/` designações (pessoal + pregação + cartas + delegações)
  - `/quadra/[id]` trabalhar quadra (com botão concluir se dirigente)
  - `/mapa` mapa estratégico (só dirigente/admin) com POIs + delegar temp
  - `/predios` busca + GPS + criar pendente + designar
  - `/arranjo` lista de saídas com Distribuir/Assumir (dirigente)
  - `/campanha` metas + progresso
- `src/routes/dirigente/` — só redirect 301 pra `/publicador/*`
- `src/routes/predio/[id]` — trabalhar prédio unificado (toggle 🚪/✉)
- `src/routes/cartas/[token]` — link público de cartas (sem auth)
- `src/lib/server/` — código server-only (queries, guards, supabase admin)
- `supabase/migrations/` — schema SQL versionado
- `scripts/migrate-from-csv.ts` — import inicial dos CSVs IBGE
- `scripts/fill-complementos.ts` — patch idempotente pra complementos

## Deploy

Branch `main` → Cloudflare Workers auto-deploy.
Build command: `npm run build` · adapter: `@sveltejs/adapter-cloudflare`.

Variáveis de ambiente no painel Cloudflare (mesmas do `.env`, exceto
`SUPABASE_SERVICE_ROLE_KEY` que é só pros scripts locais).
