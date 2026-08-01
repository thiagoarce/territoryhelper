# Quickstart — piloto guiado

Este guia instala uma **nova congregação** num projeto Supabase vazio. Não use este procedimento para atualizar a instância original.

## Antes de começar

Você precisa de:

- Node.js 20 ou mais recente;
- projeto Supabase vazio;
- KML oficial do território;
- um ou mais CSVs CNEFE dos municípios abrangidos;
- conta Cloudflare para o deploy final.

O piloto ainda é acompanhado: mantenha um responsável técnico disponível e use primeiro um projeto Supabase descartável.

## 1. Preparar o projeto

```bash
git clone https://github.com/thiagoarce/territoryhelper.git
cd territoryhelper
git switch feat/territory-installer
npm install
npm run installer -- check
```

Copie `.env.example` para `.env` e preencha suas próprias credenciais. Nunca envie `.env`, service role ou senha do banco ao GitHub.

## 2. Aplicar a baseline

Obtenha a connection string do banco no Supabase e execute:

```bash
npm run installer -- baseline --db-url "postgresql://..." --confirm
```

Esse comando aplica somente `supabase/baseline/000–080`. Ele pode ser repetido com segurança. **Não execute `supabase/migrations/001–090`.**

## 3. Criar o primeiro administrador

Crie a primeira conta em Authentication → Users no painel Supabase. Depois, no SQL Editor, promova apenas essa conta:

```sql
update public.profiles
set role = 'admin'
where id = 'UUID-DO-USUARIO';
```

## 4. Configurar a importação

Copie `installer.config.example.json` para `installer.config.json` e ajuste nome, fuso, modo, identificador e edição do CNEFE.

```bash
npm run installer -- prepare \
  --config installer.config.json \
  --kml territorio.kml \
  --cnefe municipio.csv \
  --areas quadras-revisadas.geojson \
  --output installer-output
```

`--areas` é opcional. Quando omitido, os locais são publicados como pendentes de associação e as quadras podem ser criadas/revisadas depois nas ferramentas do aplicativo.

No PowerShell, coloque o comando em uma linha ou use a crase no lugar da barra de continuação.

## 5. Revisar e aprovar

Abra `installer-output/manifest.json`, `territorio.geojson`, `locais.json` e `pendencias.json`. Confira contagens, geometrias, códigos desconhecidos e amostras dos locais.

Somente depois da revisão:

```bash
npm run installer -- approve --package installer-output --confirm
```

## 6. Publicar

Mantenha a service role apenas no computador usado na instalação:

```bash
npm run installer -- publish \
  --package installer-output \
  --supabase-url "https://SEU-PROJETO.supabase.co" \
  --service-key "SUA-SERVICE-ROLE" \
  --confirm
```

O mesmo pacote não é publicado duas vezes. Falhas ficam registradas em `import_runs` e o comando pode ser retomado.
Ao concluir, o instalador grava `relatorio-instalacao.json` no pacote, sem incluir credenciais.

## 7. Executar e publicar o aplicativo

```bash
npm run dev
npm run check
npm run build
```

Configure no Cloudflare as mesmas variáveis públicas e os segredos server-only. O deploy automático ainda não faz parte do piloto; siga a documentação do adaptador Cloudflare e valide primeiro a URL de preview.

## Limitações conhecidas

- A equivalência final do CNEFE ainda depende das fixtures do Power Query original.
- Quadras automáticas via OpenStreetMap ainda não bloqueiam o piloto.
- Recursos opcionais podem exigir configuração adicional.
- Campanhas, testemunho público e publicações ficam ocultos no piloto até seus módulos de banco serem instalados.
- Faça backup antes de atualizar uma instância em uso.
