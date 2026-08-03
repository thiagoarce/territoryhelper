# Handoff — Territory Installer

Atualizado em 2026-08-02 (Claude Code). O registro anterior é de 2026-08-01
(Codex).

## Comece aqui

1. Trabalhe no branch `feat/territory-installer`, atualmente baseado em `e093284`.
2. Leia `README.md`, `QUICKSTART.md`, `docs/agents/AGENT_GUIDE.md` e os documentos canônicos indicados pelo guia.
3. Preserve o worktree: há muitas alterações não commitadas do piloto.
4. Não altere nem inclua em commit `README.md`/`readme.md`. No Windows os dois nomes colidem por diferença apenas de maiúsculas; o usuário informou que essa mudança já apareceu ao clonar/trocar de branch e não foi feita por ele.
5. Não imprima, copie ou versione o `.env`. Ele contém as credenciais da conta Supabase e Cloudflare criada pelo usuário.

## Objetivo do produto

O usuário final cria o próprio projeto Supabase e a própria conta Cloudflare, informa ao Installer as credenciais necessárias e entrega um KML do Territory Helper/JW. O Installer deve:

- descobrir e baixar sozinho os CSVs CNEFE/IBGE necessários para os componentes de território regular e rural interceptados pelo KML;
- transformar e filtrar os endereços;
- gerar áreas/quadras clicáveis;
- permitir revisão humana antes de torná-las operacionais;
- aplicar a baseline no Supabase do usuário;
- publicar o app no Cloudflare Worker do usuário.

Casos de domínio que precisam coexistir:

- congregação apenas urbana;
- congregação urbana e rural;
- congregação de idioma, com uma malha extensa apenas para contexto de censo;
- congregação com grupo de idioma, mantendo duas malhas sobrepostas e operacionalmente separadas: pregação regular/rural e contexto de censo do idioma;
- rural pode receber divisões sugeridas, mas não deve ser forçado ao conceito de quadra urbana.

### Regra de isolamento do território de idioma

O território de idioma é um trabalho separado, usado somente pelo grupo ou congregação daquele idioma. Sua malha de quadras existe para dar contexto visual e permitir registrar/acompanhar o censo; ela não representa quadras operacionais da pregação regular.

- O CNEFE/IBGE alimenta somente o território regular e o território rural.
- Endereços do CNEFE não devem ser vinculados, copiados ou atribuídos automaticamente a áreas `language-census`.
- A malha de idioma pode se sobrepor livremente às áreas regulares/rurais.
- Dentro do território de idioma só entram endereços criados pelos próprios publicadores e identificados explicitamente como pertencentes ao idioma estrangeiro.
- Esses endereços criados para o idioma devem permanecer separados dos endereços operacionais vindos do IBGE; não inferir idioma pela localização do imóvel.
- Aprovar uma área de censo não deve ativar vínculo CNEFE nem fazê-la aparecer nos fluxos normais de pregação.

`locais.quadra_id` continua sendo vínculo operacional apenas com área de finalidade `regular-preaching`, aprovada e ativa. A finalidade `language-census` é exclusivamente contextual e nunca participa da atribuição automática de endereços.

## O que está implementado localmente

### Installer e infraestrutura

- pré-voo e validação de Supabase/Cloudflare;
- aplicação idempotente da baseline;
- promoção do primeiro administrador;
- geração de VAPID e deploy Windows para Cloudflare;
- descoberta municipal e download automático do CNEFE 2022;
- transformação do dicionário oficial CNEFE;
- preparação, aprovação, verificação de integridade e publicação do pacote;
- CLI `generate-areas` para gerar polígonos sugeridos a partir das ruas do OpenStreetMap/Overpass.

Arquivos centrais novos ou alterados:

- `scripts/installer.ts`
- `src/lib/installer/cloudflare-deploy.ts`
- `src/lib/installer/cnefe-download.ts`
- `src/lib/installer/cnefe-2022-dictionary.ts`
- `src/lib/installer/infrastructure.ts`
- `src/lib/installer/integrity.ts`
- `src/lib/installer/osm-work-areas.ts`
- `src/lib/installer/kml.ts`
- `src/lib/installer/areas.ts`
- `src/lib/installer/package.ts`
- `src/lib/installer/publish.ts`
- `src/lib/installer/types.ts`

### Geração de áreas

O gerador preserva os componentes do KML e classifica urbano, rural, idioma e especial. Ele usa `out geom` e `polygonize`, como o Apps Script definitivo do usuário; divide a extensão em tiles; usa cache local e fallback entre instâncias públicas Overpass; subdivide tiles pesados; recorta ao KML; descarta áreas abaixo de 300 m²; classifica confiança; e publica tudo inicialmente como `suggested` e inativo.

O último Apps Script fornecido pelo usuário é semanticamente igual à segunda versão enviada antes; só muda a formatação. O algoritmo antigo fazia uma única bbox, consultava highways com `out geom`, executava Turf `polygonize` e aceitava o polígono quando o centro caía dentro do KML. O novo gerador mantém o núcleo útil e acrescenta robustez, recorte e revisão.

### Modelo e tela de revisão

A baseline ganhou `supabase/baseline/035_work_area_metadata.sql` e os metadados `tipo_area`, `finalidade`, `origem_geografica`, `revisao_status` e `confianca` em `quadras`.

A tela `/admin/poligonos` mostra sugestões em laranja e rural em verde; permite aprovar/reabrir uma área; e permite aprovar em lote apenas alta confiança. Média/baixa confiança fica para revisão manual. A malha de idioma (roxo) migrou para `/admin/censo` — ver "Separação de finalidades" abaixo.

As consultas operacionais escondem censo e sugestões. Nenhuma tela pede "todas as finalidades": cada uma declara a malha que consome. A implementação futura do cadastro de endereços do idioma deve exigir criação explícita pelo publicador e jamais reutilizar automaticamente o CNEFE.

## Piloto Monte Castelo já publicado

App: `https://territorios-congregacao.othiagoarce.workers.dev`

Dados locais fora do repositório, em `C:\Users\Thiag\Downloads\IBGE`:

- `Monte Castelo - Campo Grande MS (69476).kml`
- `5002704_CAMPO_GRANDE.csv`
- `5004908_JARAGUARI.csv`
- `installer.config.monte-castelo.json`
- `monte-castelo-areas-sugeridas.geojson`
- `installer-output-monte-castelo-areas`
- cache `osm-cache-monte-castelo`

Resultado publicado no Supabase do usuário:

- 4.911 locais e 9.853 unidades;
- 7.124 áreas sugeridas e inativas;
- 361 regulares, das quais 358 têm confiança alta;
- 6.763 de censo de idioma, das quais 6.726 têm confiança alta;
- 40 áreas exigem revisão manual.

Não aprove automaticamente nenhuma dessas áreas sem decisão visual do usuário.

## Estado publicado e correção local pendente

Foi encontrado e corrigido um corte silencioso de 1.000 linhas do PostgREST em `src/lib/queries.ts`. A correção pagina `quadras_geo`, `quadras_contagens` e a lista operacional. Ela já foi publicada e validada: a tela mostra 358 regulares confiáveis, 6.726 de censo confiáveis e 40 para revisão manual.

O carregamento completo observado levou aproximadamente 37 segundos, inadequado para celular. Há uma otimização local mais recente em `src/routes/admin/poligonos/+page.ts`: locais, quadras, territórios, TCEs, publicadores e curadoria passam a carregar em paralelo.

### Decisão para resolver o carregamento

Não é necessário nem desejável carregar a malha de idioma na tela territorial comum. A separação de domínio também é a solução principal de desempenho:

- `/admin/poligonos` e todos os fluxos territoriais comuns devem consultar somente áreas `regular-preaching`, incluindo as de `tipo_area = rural-area`;
- áreas `language-census` não devem ser baixadas, renderizadas, contadas nem aprovadas nessa tela por padrão;
- uma futura tela/módulo de censo deve carregar somente a malha `language-census` quando um usuário autorizado do grupo ou congregação de idioma a abrir;
- essa futura tela deve trabalhar apenas com dados de censo e com endereços de idioma criados explicitamente pelos publicadores, sem carregar ou vincular o CNEFE operacional;
- se a malha de censo ainda for grande demais nessa tela dedicada, aplicar carregamento por viewport/tiles como uma otimização própria do módulo de censo.

Portanto, não tentar resolver a lentidão mantendo as 7.124 geometrias na abertura de `/admin/poligonos`. Primeiro separar as finalidades nas consultas e na navegação. O paralelismo local continua útil para os dados regulares, mas não substitui essa separação.

Essa última otimização passou em `npm run check` (0 erros, 20 avisos preexistentes), mas ainda não teve `npm test` repetido, ainda não foi publicada e ainda não teve o tempo real medido.

## Separação de finalidades — implementada (2026-08-02, ainda não publicada)

Os passos 5 e 6 do plano acima estão feitos no worktree. O passo 2/3/4
(deploy e medição do tempo real) continua pendente e agora deve ser medido
já com a separação, não com o paralelismo sozinho.

O que mudou:

- `listarQuadrasComGeo(supabase, opcoes)` trocou o booleano
  `incluirTodasFinalidades` por `{ finalidade, incluirSugeridas,
  comContagens }`. O default continua `regular-preaching` + só aprovadas, e
  **deixou de existir** a opção "todas as finalidades" — cada tela declara
  a malha que consome.
- `/admin/poligonos` carrega `regular-preaching` com sugestões. A malha de
  idioma não é mais baixada, contada, renderizada nem aprovada ali; o lote
  "Aprovar censo confiável" saiu da tela. A chave do cache offline virou
  `admin:poligonos:v2:` para não reidratar o snapshot antigo com censo.
- `/admin/censo` (novo) é o consumidor exclusivo de `language-census`:
  mapa (`MapaPoligonos` com `locais={[]}`), filtro pendentes/revisão
  manual/todas, aprovar área a área ou o lote de alta confiança. Sem
  endereço, sem contagem de CNEFE, sem vínculo.
- `$lib/server/revisao-areas.ts` concentra a revisão das duas telas; cada
  action fixa a sua finalidade e o UPDATE filtra por ela com
  `count:'exact'` — id de censo enviado à action do editor territorial
  falha em vez de aprovar em silêncio.
- Módulo `languageCensus` em `installation_config.modules`: o Installer
  liga quando o KML traz malha de idioma (`publish.ts`); o drawer e o
  guard de rota respeitam. Instalação publicada antes da chave existir —
  **o caso do piloto Monte Castelo** — cai num `limit(1)` em `quadras`
  feito só para admin, então a tela aparece no piloto sem republicar o
  pacote.
- Baseline `065`: `dividir_quadra` passou a herdar
  `tipo_area`/`finalidade`/`origem_geografica`/`revisao_status`/
  `confianca` da área original (antes a metade nova nascia
  urbana + regular pelos defaults da coluna: dividir área de censo criava
  área de pregação que o auto-vínculo encheria de endereços do CNEFE), e
  `quadras_join` recusa unir finalidades diferentes. **Reaplicar a
  baseline no deploy** para essas duas funções chegarem ao piloto.
- Testes novos: `tests/areas-finalidade.test.ts` (dublê do client Supabase
  garante os filtros de cada tela) e três asserções no
  `tests/baseline-contract.test.ts` para as regras SQL acima.

Verificado localmente: `npm test` 176 passaram / 0 falharam;
`npm run check` 0 erros e 20 avisos preexistentes; `npm run build` OK.

### Publicado em 2026-08-02

`baseline` e `deploy` são comandos SEPARADOS do Installer — `deploy` só
faz build + Worker, não toca no banco. Foram executados os dois, nesta
ordem:

1. `npm run installer -- baseline --confirm` — reaplicada inteira, sem
   erro (os avisos de privilégio em `spatial_ref_sys`/`geometry_columns`
   são do PostGIS e já apareciam antes);
2. `npm run installer -- deploy --confirm` — publicado em
   `https://territorios-congregacao.othiagoarce.workers.dev`.

Verificado direto no banco depois: `dividir_quadra` já contém
`v_original.finalidade` e `quadras_join` já recusa finalidades
diferentes. Contagem por finalidade hoje:

| finalidade | revisão | confiança | qtd |
|---|---|---|---|
| language-census | suggested | high | 6.726 |
| language-census | suggested | medium/low | 37 |
| regular-preaching | **approved** | high | 358 |
| regular-preaching | suggested | medium/low | 3 |

As 358 áreas regulares de alta confiança já estão **aprovadas** no banco —
no handoff anterior as 7.124 estavam todas sugeridas. Foi o próprio
usuário quem rodou o lote "Aprovar regulares confiáveis" em 02/08,
decisão dele e esperada. As 3 regulares de média/baixa confiança
continuam sugeridas, para revisão visual no mapa.

O módulo `languageCensus` ainda NÃO está em `installation_config.modules`
(a instalação é anterior à chave), então o piloto está usando o caminho
de descoberta por `limit(1)` do root layout. Republicar o pacote grava a
chave e dispensa essa query.

### Próximo passo imediato

Falta a medição com sessão real (exige login do usuário):

1. abrir `/admin/poligonos`, medir o tempo até o mapa ficar utilizável e
   conferir na aba de rede que **nenhuma** geometria `language-census`
   trafega;
2. conferir os números do editor territorial: 361 áreas regulares e o
   aviso de revisão manual contando só as 3 regulares (não mais 40);
3. abrir `/admin/censo` (entrada nova no drawer) e conferir 6.763 áreas,
   6.726 confiáveis. Se a abertura dessa tela for lenta demais no
   celular, a otimização é dela — carregamento por viewport/tiles. Não
   voltar a limitar silenciosamente a 1.000 linhas;
4. não aprovar nada em lote sem decisão visual do usuário.

As duas malhas seguem revisáveis, mas em módulos independentes: território
regular/rural no editor territorial e idioma em `/admin/censo`.

## Verificações já realizadas

Antes da última otimização de paralelismo:

- `npm test`: 171 passaram, 0 falharam;
- `npm run check`: 0 erros e 20 avisos preexistentes;
- `git diff --check`: sem erros;
- build e deploy Cloudflare concluídos;
- baseline reaplicada com sucesso na instância real;
- pacote Monte Castelo publicado;
- mapa real carregou as 7.124 áreas e mostrou as contagens exatas.

No sandbox Codex, `npm run check`/`npm test` pode falhar com `Cannot read directory ../..` ao resolver `vite.config.ts`; isso é permissão do sandbox, não falha do projeto. Fora dele, execute normalmente.

## Cuidados ao continuar

- Não criar migrations `091+`; a instalação nova usa `supabase/baseline`.
- `CREATE OR REPLACE VIEW` só pode acrescentar colunas ao final. A ordem em `quadras_geo` já foi ajustada para reaplicação.
- `supabase/baseline/070_rls.sql` remove apenas os nomes exatos das policies conhecidas antes de recriá-las; preserve policies personalizadas.
- Sugestões nascem inativas; aprovação é o momento que torna a área ativa.
- O vínculo automático considera somente regular + aprovada + ativa; nunca `language-census`.
- CNEFE/IBGE é fonte apenas para território regular e rural. Endereço de idioma nasce de cadastro explícito do publicador e precisa manter essa origem/finalidade identificável.
- Não versionar CSVs/KML reais, caches, pacotes gerados ou credenciais.
- Não fazer commit amplo sem separar a colisão `README.md`/`readme.md` e revisar o diff; nenhum commit novo foi criado neste handoff.
