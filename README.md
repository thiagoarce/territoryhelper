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
# Vá em supabase.com → seu projeto → SQL Editor → cole o conteúdo de
# supabase/migrations/001_*.sql e rode. Depois 002_*.sql.

# 4. Criar o primeiro admin (no SQL Editor do Supabase):
# Crie o usuário via dashboard de Auth (insira email+senha manualmente).
# Depois rode:
# UPDATE profiles SET role='admin', nome='Seu Nome' WHERE id=(SELECT id FROM auth.users WHERE email='seuemail@ex.com');

# 5. Dev server
npm run dev
```

## Estrutura

- `src/routes/login/` — tela de login (email + senha)
- `src/routes/admin/` — painel do servo de território (CRUD usuários etc)
- `src/routes/dirigente/` — painel do dirigente (mapa + designações)
- `src/routes/publicador/` — painel do publicador (suas quadras)
- `src/lib/server/` — código server-only (clients privilegiados, guards)
- `supabase/migrations/` — schema SQL versionado

## Deploy

Cloudflare Pages: conecta o repo + branch `pwa-rewrite` (depois `main`).
Build command: `npm run build` · output dir: `.svelte-kit/cloudflare`.

Variáveis de ambiente no painel Cloudflare (mesmas do `.env`).
