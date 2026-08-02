# Quickstart — piloto guiado

Este guia instala uma **nova congregação** num projeto Supabase vazio. Não use este procedimento para atualizar a instância original.

## Antes de começar

Você precisa de:

- Node.js 20 ou mais recente;
- projeto Supabase vazio;
- KML oficial do território;
- acesso à internet para o instalador localizar os CSVs CNEFE oficiais, ou arquivos já baixados manualmente;
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

Copie `.env.example` para `.env` e preencha suas próprias credenciais. Use a Publishable key e uma Secret key atuais do Supabase quando disponíveis; as chaves legadas `anon` e `service_role` também são aceitas. Nunca envie `.env`, chave administrativa, senha do banco ou token Cloudflare ao GitHub.

## 2. Conectar a infraestrutura própria

O usuário cria um projeto Supabase vazio e um API Token restrito na própria conta Cloudflare. Preencha no `.env`:

- `PUBLIC_SUPABASE_URL`;
- `PUBLIC_SUPABASE_ANON_KEY` com Publishable key ou `anon`;
- `SUPABASE_SERVICE_ROLE_KEY` com Secret key ou `service_role`;
- `SUPABASE_DB_URL` com a connection string do banco;
- `CLOUDFLARE_ACCOUNT_ID`;
- `CLOUDFLARE_API_TOKEN` com permissão para editar Workers Scripts;
- `TERRITORY_WORKER_NAME`, usando letras minúsculas, números e hífens.

Depois execute:

```bash
npm run installer -- configure
```

O pré-voo testa a API pública, o acesso administrativo do Supabase, PostgreSQL/PostGIS e o token Cloudflare. Somente a configuração pública necessária ao deploy fica em `.territory-installer/`, que é ignorado pelo Git. A chave administrativa, a connection string e o token Cloudflare não são gravados nesse estado. Durante o deploy, o arquivo de secrets é temporário e apagado mesmo em caso de falha. Exclua `.territory-installer/` para remover o estado retomável.

## 3. Aplicar a baseline

Obtenha a connection string do banco no Supabase e execute:

```bash
npm run installer -- baseline --confirm
```

Esse comando aplica somente `supabase/baseline/000–080`. Ele pode ser repetido com segurança. **Não execute `supabase/migrations/001–090`.**

## 4. Criar o primeiro administrador

Crie a primeira conta em Authentication → Users no painel Supabase. Depois, no SQL Editor, promova apenas essa conta:

```sql
update public.profiles
set role = 'admin'
where id = 'UUID-DO-USUARIO';
```

## 5. Configurar a importação

Copie `installer.config.example.json` para `installer.config.json` e ajuste nome, fuso, modo, identificador e edição do CNEFE. Primeiro, confira quais municípios o KML intercepta:

```bash
npm run installer -- discover --kml territorio.kml
```

Para localizar, baixar, validar e reutilizar automaticamente os CSVs oficiais:

```bash
npm run installer -- prepare \
  --config installer.config.json \
  --kml territorio.kml \
  --auto-cnefe \
  --cnefe-dir cnefe-cache \
  --confirm-download \
  --areas quadras-revisadas.geojson \
  --output installer-output
```

Sem `--confirm-download`, o instalador mostra os municípios e interrompe antes de baixar. ZIPs e CSVs válidos em `cnefe-cache` são reutilizados; o CSV extraído é conferido pelo código municipal e recebe hash SHA-256.

Também é possível usar CSVs já obtidos manualmente:

```bash
npm run installer -- prepare \
  --config installer.config.json \
  --kml territorio.kml \
  --cnefe municipio.csv \
  --areas quadras-revisadas.geojson \
  --output installer-output
```

Para gerar áreas clicáveis a partir das ruas do OpenStreetMap antes do `prepare`:

```bash
npm run installer -- generate-areas \
  --config installer.config.json \
  --kml territorio.kml \
  --output areas-sugeridas.geojson \
  --confirm-download
```

O comando identifica separadamente território urbano, rural e área de idioma no KML, mostra quantos blocos serão consultados e mantém cache local em `osm-cache`. As áreas nascem como `suggested`: laranja para revisão, roxo para censo de idioma e verde para divisão rural. Depois de publicadas, o administrador pode clicar em cada uma no mapa e aprová-la. Somente áreas aprovadas de `regular-preaching` recebem endereços e participam da operação normal.

`--areas` é opcional. O GeoJSON pode conter limites de território (`properties.kind: "territory"`) e quadras (`properties.kind: "work-area"`, com `territoryId`). Quando omitido, o KML forma um território único e os locais ficam pendentes de associação a quadras.

Se as geometrias revisadas tiverem pequenas diferenças de precisão em relação ao KML, configure `territory.areaBoundaryToleranceMeters`. Use zero para validação estrita ou o menor valor auditado que comporte essas diferenças; o exemplo usa 15 metros.

No PowerShell, coloque o comando em uma linha ou use a crase no lugar da barra de continuação.

## 6. Revisar e aprovar

Abra `installer-output/manifest.json`, `territorio.geojson`, `territorios.json`, `areas-trabalho.json`, `locais.json` e `pendencias.json`. Confira contagens, geometrias, códigos desconhecidos, classificações sugeridas e os locais sem quadra. Um local só recebe quadra quando pertence a exatamente um polígono; sobreposições ficam pendentes em vez de serem resolvidas arbitrariamente.

Somente depois da revisão:

```bash
npm run installer -- approve --package installer-output --confirm
```

A aprovação sela o manifesto e os artefatos revisados com hashes SHA-256. Se qualquer arquivo do pacote for editado depois, a publicação será recusada; execute `prepare`, revise e aprove novamente.

## 7. Publicar

Mantenha a service role apenas no computador usado na instalação:

```bash
npm run installer -- publish \
  --package installer-output \
  --confirm
```

O mesmo pacote não é publicado duas vezes. Falhas ficam registradas em `import_runs` e o comando pode ser retomado.
Ao concluir, o instalador grava `relatorio-instalacao.json` no pacote, sem incluir credenciais.

## 8. Executar e publicar o aplicativo

```bash
npm run check
npm run installer -- deploy --confirm
```

O comando gera o build com as variáveis públicas, envia a chave administrativa como secret do Worker junto com o código, publica na conta configurada e testa a URL `workers.dev` retornada. O token Cloudflare continua apenas no `.env`/ambiente local e não é incluído no Worker.

Para desenvolvimento local, use `npm run dev`. Para trocar projeto, conta ou nome do Worker, atualize o `.env` e execute `configure` novamente antes do próximo deploy.

## Limitações conhecidas

- O CNEFE 2022, o filtro por KML e a geografia histórica do Aeroclube foram validados. As 22 linhas excedentes foram confirmadas como cadastros legítimos posteriores no sistema antigo; as classificações sugeridas e os locais sem quadra ainda exigem revisão humana.
- Quadras automáticas via OpenStreetMap são propostas revisáveis; qualidade baixa, vias incompletas e áreas rurais ainda exigem correção humana.
- Recursos opcionais podem exigir configuração adicional.
- Campanhas, testemunho público e publicações ficam ocultos no piloto até seus módulos de banco serem instalados.
- Faça backup antes de atualizar uma instância em uso.
