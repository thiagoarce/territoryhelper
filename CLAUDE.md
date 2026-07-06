# CLAUDE.md — Guia para agentes IA neste repo

App PWA de gestão de territórios JW. **SvelteKit 2 + Svelte 5 (runes)**,
**Tailwind 3**, **Supabase** (Postgres + Auth + RLS + Storage + Realtime),
**MapLibre GL + OpenFreeMap** (tiles vetoriais grátis), deploy em
**Cloudflare Workers**. O app antigo em Google Apps Script foi 100% portado
e arquivado (tag/branch `v1-google-apps-script` no git).

## Layout de arquivos

- `src/routes/` — páginas SvelteKit (`+page.svelte` UI, `+page.server.ts`
  load + actions). Só 2 modos (specs.md revisado): **admin** e **campo**.
  - `admin/` — Geral (`/admin`, com concluir/reverter/histórico de
    conclusão — Registro foi fundido aqui), `poligonos`, `predios`
    (com Trabalhar + GPS + Designar cartas), `campanha`, `arranjos`,
    `tp`, `designacoes`, `usuarios`, `auditoria`, `dev/sql`
  - `publicador/` — modo campo (**tanto publicador quanto dirigente**):
    home/carteira (território pessoal + ✉ cartas + pregação em grupo via
    `arranjo_partes` + TCEs), `quadra/[id]` (com "Marcar concluída" se
    dirigente), `mapa` (visão geral READ-ONLY do território de toda a
    congregação — só dirigente/admin, sem concluir/repartir/POI/PNG,
    acessível por um ÍCONE no header, não é aba da bottom nav; concluir
    geral e repartir geral são papel do admin/servo de território, não do
    dirigente comum), `casa-a-casa` (mapa com GPS pra publicador E
    dirigente identificarem qual quadra é qual — 3 seções possíveis:
    "seu grupo" = mapa do arranjo INTEIRO que você dirige + botão
    **Repartir território** (migrou de `arranjo`, fica junto do mapa que
    edita) + lista de partes já criadas; "sua parte" = mapa só do
    subconjunto que te cabe; "território pessoal". Banner linkando pra
    Prédios; notificação de "parte criada" leva pra cá),
    `predios` (busca+GPS+criar pendente+designar),
    `arranjo` (agenda só de pregação em grupo — inscrição de interesse,
    dirigente ganha Assumir; TP e Repartir saíram daqui),
    `tp` (agenda mensal de testemunho público — turnos/inscrição/
    relatório/sugerir ponto + disponibilidade e confirmação mensal,
    migrou de `arranjo` + `/perfil`),
    `campanha` (sem ícone na bottom nav — acessível pelo banner na home),
    `tce/[id]`
  - `dirigente/` — só um `+layout.server.ts` que redireciona pra
    `/publicador/*` (URLs antigas)
  - `predio/[id]` — **tela ÚNICA de trabalhar prédio**, toggle
    🚪 casa-em-casa vs ✉ cartas + edit + WhatsApp share
  - públicas (sem auth): `cartas/[token]`, `t/[token]` (território/arranjo
    read-only + compartilhar c/ imagem), `convite/[token]`, `c`, `login`
- `src/lib/components/` — `MapaAdmin.svelte` (mapa de quadras reutilizável),
  `MapaPoligonos.svelte` (editor de polígonos + terra-draw), `AdminMapa.svelte`,
  `EditarLocalSheet.svelte`, `InstallPrompt.svelte`, `TpGradeSemana.svelte`
  (grade semanal do Planner de TP), `NotificacoesBell.svelte` (sino no
  header global — fallback in-app de PUSH-A, funciona sem push)
- `src/lib/server/push.ts` — `criarNotificacao(publicadorIds, {titulo,
  corpo, url})` grava em `notificacoes` (via `supabaseAdmin`, bypassa RLS
  pra notificar outros) e dispara `enviarTickle` (Web Push "tickle" sem
  payload — JWT VAPID assinado via WebCrypto, não a lib `web-push` do npm,
  que não roda em Cloudflare Workers). `/api/notificacoes` serve o sino
  E o service worker (que busca o conteúdo ao receber o push vazio).
- `src/lib/server/queries.ts` — helpers de query. **`selectAll<T>()`** pagina
  além do limite 1000 do PostgREST + dedup por id.
- `src/lib/ui/` — primitives: `Button`, `Card`, `BottomSheet`, `toast.svelte.ts`
- `src/lib/offline/` — fila de escrita offline (IndexedDB). `postComFila(url,
  formData)` tenta o POST normal; se a rede falhar de verdade (não um erro
  do servidor), enfileira e devolve `{offline:true}` em vez de derrubar a
  UI. `flushFila()` reenvia tudo quando a conexão volta (chamado no root
  layout, on mount + evento `online`). Usado em `/predio/[id]` (registrar
  desfecho + toggle cartas — os fluxos de maior frequência com sinal
  ruim); estenda pra outros fluxos com o mesmo `postComFila` quando
  precisar.
- `src/lib/server/posse.ts` — helper único e puro de "esse publicador pode
  trabalhar essa quadra?", espelhando as mesmas cláusulas de
  `pode_editar_local` (RLS). `guards.ts::exigirQuadraDesignada` só busca
  os booleans (via query) e delega a decisão pra cá.
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
| `profiles` | usuário + `role` (publicador/dirigente/admin); capacidades independentes de role (`servo_publicacoes`, ver P-A) empilham por cima, não substituem role |
| `convites` | Link público `/convite/<token>` só pra DEFINIR senha — o publicador (`auth.users`+`profiles`) já é criado na hora do convite (senha descartável, `email_confirm=false`), via `convites.publicador_id`. Isso permite designar território pra alguém antes de ele abrir o link. Revogar convite não-usado apaga o usuário provisório junto. `/admin/usuarios` gera 1 ou em lote (cola `nome,email,role` por linha) |
| `territorios` | id text, nome, cor, status |
| `quadras` | id text, `poly geometry(Polygon,4326)`, color, `territorio_id`, **`ativa` boolean**, `data_conclusao`, `reservada_campanha_id` (quarentena — some do pool geral enquanto reservada pra campanha) |
| `quadras_conclusoes` | histórico append-only de conclusões (data, autor) |
| `locais` | endereço físico: `geo Point`, tipo (casa/predio/comercio/coletivo/terreno), `quadra_id`, setor/quadra_ibge/face_ibge, portaria, `nao_eh_predio`, **`pendente`** (criado pelo publicador; admin valida) |
| `unidades` | apto/unidade dentro de um local. `carta_entregue` (date) = carta ESCRITA (+ `carta_escrita_por`, migration 055) — a ENTREGA é registro tipo='carta' no casa a casa |
| `registros` | trilha append-only de eventos por unidade (conversou/carta/desfeito…) |
| `designacoes` | **território pessoal** (tipo pessoal/cartas), sempre `publicador_id` — dirigente NÃO existe aqui (é atributo do arranjo) |
| `designacao_quadras` / `designacao_publicadores` / `designacao_locais` | N:N (locais só p/ tipo='cartas') |
| `arranjos` / `arranjo_modalidades` | saída agendada c/ dirigente + território **misto livre**: `quadras_ids[]` + `cartas_locais_ids[]` + `tce_id` + local/ponto + `interessados uuid[]` (inscrição antecipada, sinal pro dirigente repartir). Modalidade é só categoria (cor/defaults). **Recorrência não é um flag perpétuo**: `criarArranjo` expande "recorrente" em N linhas PONTUAIS independentes na hora da criação (`recorrente=false`, uma `data` cada) — cada ocorrência tem seu próprio `dirigente_id`/território, editável sem afetar as outras. Passado o dia (ou hoje após 20h) e `ativo` ainda `true`, a home só AVISA (link pra Casa a casa); é lá que mora a ação **"Finalize a designação"** — botão que marca `ativo=false` e apaga as `arranjo_partes` daquela ocorrência (encerra o acesso; liberar quadra pra outro arranjo já acontece sozinho pela data, via `quadrasEmArranjoFuturo`). Tanto a home ("Você dirige") quanto Casa a casa ("Seu grupo") mostram só o PRÓXIMO arranjo futuro que o dirigente dirige — os demais entram num indicativo "+N outras" com modal de detalhe |
| `arranjo_partes` | repartição do dirigente: subconjunto do território → `publicadores uuid[]` (dupla/trio = MESMA parte). Validade deriva da `data` do arranjo |
| `territorio_tokens` | link público `/t/<token>` de arranjo OU designação (RPC `territorio_publico` monta o JSON; compartilha no WhatsApp com PNG do mapa) |
| `campanha` / `campanhas` | objetivos + período (data_inicio/alvo/meta_semanal) |
| `campanha_suprimentos` | checklist de `publicacoes` pra uma campanha (qtd_necessaria/qtd_em_maos/pedido_feito/notas) — gerido em `/admin/campanha` |
| `publicacoes` | catálogo de publicações (nome/código/ativo) usado pelo suprimento e como "publicação principal" de um período |
| `tces` / `tce_unidades` | Território Comercial Especial (convex hull) |
| `cartas_tokens` | link público de cartas |
| `cartas_ciclos` | ciclos do trabalho de cartas (append-only, o atual = maior id; iniciado manualmente pelo admin em `/admin/predios` — "Iniciar novo ciclo"). Marca de carta escrita só "vale" se >= `iniciado_em` do ciclo atual. Casa em casa não precisa de tabela: o ciclo é a última `data_conclusao` da quadra. Helpers puros em `$lib/ciclos.ts` (`desfechoNoCicloAtual`/`cartaEscritaNoCiclo`), usados em queries/telas — marcas de ciclo passado aparecem esmaecidas ("ciclo anterior"), histórico intacto |
| `tp_carrinho_tipos` / `tp_pecas_catalogo` / `tp_carrinhos` | Equipamentos de TP (carrinho/display/quiosque/mesa) e catálogo de peças (física/literatura), com `cor` por equipamento pra "visão geral" |
| `tp_pontos` | Pontos fixos de testemunho público (nome/endereço/GPS); ponto AVULSO (texto livre) não tem linha própria, mora em `tp_agendamentos.ponto_avulso`; publicador pode sugerir (`pendente=true, ativo=false`, TP-E) via `/publicador/arranjo`, admin aprova/recusa em `/admin/tp/pontos` |
| `tp_agendamentos` / `tp_agendamento_excecoes` / `tp_agendamento_participantes` | Agendamento = equipamento + ponto (fixo ou avulso) + data/hora + recorrência (nenhuma/diária/semanal/quinzenal/mensal); exceções tratam "só esta ocorrência"; participantes SEM capacidade fixa (`origem` inscrição/designação) — TP-F, `/admin/tp/*` + inscrição em `/publicador/arranjo` |
| `tp_preferencias` / `tp_disponibilidade` | Transporte do equipamento + janelas de disponibilidade (dia_semana/hora) do publicador — TP-B, cadastro em `/publicador/tp` (migrou de `/perfil`), consulta read-only (roster) em `/admin/tp/publicadores` e badge "disponível" no Designar do Planner |
| `tp_disponibilidade_confirmacoes` | Planner é mensal — a disponibilidade fixa precisa ser CONFIRMADA a cada mês novo (1 linha por publicador+mês, `mes_referencia` 'YYYY-MM'); banner em `/publicador/tp` cobra a confirmação |
| `publicacoes` | Catálogo real (transcrito do S-14-T/S-28-T oficial, migration 052) — `categoria` (biblia/livro/brochura/folheto/cartao_visita/revista/formulario/outro), `qtd_estoque` (snapshot MANUAL, o servo atualiza batendo com o relatório do JW Hub — não é movimento entrada/saída), `imagem_url` (capa, bucket `fotos-publicacoes`). Gerenciado em `/publicacoes` |
| `pedidos_publicacao` | Fila de pedidos avulsos de publicação (catálogo ou descrição livre) — P-A, `profiles.servo_publicacoes` + `is_servo_pub()` dão a capacidade (não é role); publicador pede em `/publicador` (card "Publicações", mostra estoque atual antes de pedir), servo atende em `/publicacoes` (fora do namespace `/admin/*`, que é 100% admin-only, pra um servo não-admin conseguir acessar) |
| `publicador_necessidade_regular` | "Normalmente preciso de N" — só revistas (Despertai/Sentinela, que chegam pela via normal, não por pedido especial); preferência informativa sem status, publicador ajusta em `/publicador` |
| `publicacao_controle` | Lista de controle por publicação — servo escolhe uma publicação em `/publicacoes` e confirma, publicador a publicador, `qtd_pedida`/`qtd_entregue` (contador +/-). Diferente de `pedidos_publicacao` (fila de pedido especial avulso com status): aqui é registro manual sem fluxo, 1 linha por (publicação, publicador). Gate por `is_servo_pub()`, mesma capacidade de sempre |
| `tp_relatorios` / `tp_relatorio_itens` | Relatório de fim de agendamento — TP-D, botão "Relatório do turno" em `/publicador/arranjo` (1 por ocorrência, checklist do tipo do carrinho + publicação da campanha ativa como item extra); fila de Reposição (itens != ok não resolvidos) + tendência de colocações em `/publicacoes` |
| `notificacoes` / `push_subscriptions` | PUSH-A — sino no header (`NotificacoesBell.svelte`, fallback universal, funciona sem push) + Web Push real (JWT VAPID assinado via WebCrypto, tickle sem payload — SW busca o conteúdo em `/api/notificacoes`). Disparado por `$lib/server/push.ts::criarNotificacao()` em: designação criada, cartas designadas, `designarParticipante` (TP-F), status de `pedidos_publicacao` mudou (P-A), saída de agendamento em <48h. Ativar em `/perfil` (botão, exige gesto do usuário) |
| views `*_geo` | expõem geometria como GeoJSON (`poly_geojson` / `geo_geojson`) |

**Status de quadra = só `ativa` (boolean).** "Concluída/pendente" são
DERIVADOS de `data_conclusao` + `quadras_conclusoes`. Não existe mais
status='pendente'/'concluido'.

### TP completo — concluído (migrations 041–049)

TP-A + TP-B + TP-D + TP-E + TP-F + P-A + PUSH-A, todos com UI. Histórico
completo das decisões de cada incremento em **`docs/specs-tp-completo.md`**.

## Convenções

### Backend (`+page.server.ts`)
- `locals.supabase` = client com sessão; **RLS** faz o controle de acesso.
  Guards em `$lib/server/guards.ts` — usar **`exigirQuadraDesignada`** em
  qualquer rota que trabalhe conteúdo de quadra pelo publicador.
- **Defesa em profundidade**: além de RLS, checar `locals.profile?.role`
  no início das actions que precisam ser role-restritas (concluir quadra,
  repartir/assumir arranjo, designar cartas).
- **RLS de `locais`/`unidades`** (migration 026/029/040) usa
  `pode_editar_local(bigint)` — publicador só edita local que está em
  designação pessoal, arranjo (dirigente) ou `arranjo_partes` ativa dele.
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

- **Geral** (`/admin`) — mapa multi-seleção de quadras; **designar** (território
  pessoal) + **anexar a arranjo** (saída em grupo) + **designar TCE**. Cor por
  status (recência) / território / densidade / idade da conclusão.
  **Concluir quadra** fundido aqui (long-press abre histórico +
  reverter + limpar conclusão + conflito de data anterior — era a tela
  `/admin/registro`, removida).
- **Polígonos** (`/admin/poligonos`) — editor único, modos:
  - **Vincular**: pontos de endereço + filtros + cluster "por face" (IBGE);
    click vincula a quadra
  - **Quadras**: renomear, território, ativa, **desenhar/editar forma**
    (terra-draw), **juntar** (ST_Union), **dividir** (ST_Split), **excluir**
  - **Territórios**: CRUD, agrupar quadras, deletar (orfaniza)
  - **TCE**: seleciona comércios/faces → convex hull → cria
  - **Auditar**: multi-cluster IBGE, vazias, órfãs sem território
- **Prédios** (`/admin/predios`) — lista + filtros + modal inline + WhatsApp +
  **📍 Proximidade GPS** + ▶ trabalhar (→ `/predio/[id]`) +
  ⏳ **Validar pendente** + 🎯 **Designar cartas** + 📅 Anexar arranjo
- **Campanha** (`/admin/campanha`) — período + mapa do período + termômetro de
  ritmo + gráfico semanal + suprimento (publicações/quantidades)
- **Arranjos** (`/admin/arranjos`) — modalidades + agenda semana/mês/3m/ano +
  recorrência gera N pontuais editáveis + anexar prédios/quadras/TCE
- **Designações** (`/admin/designacoes`) — hub central: lista todas as
  designações pessoais/cartas + arranjos + TCEs num só lugar (filtros por
  tipo/status, concluir/reabrir/cancelar/excluir, link público, realocar
  quadras não terminadas pra outro arranjo)
- **TP** (`/admin/tp/*`, navegação em 5 seções — sidebar no desktop, sheet
  no mobile): **Planner** (`/admin/tp`, grade semanal tipo Google Calendar —
  `TpGradeSemana.svelte` — clicar/arrastar num horário vazio cria
  agendamento, arrastar a borda de um card ajusta início/fim; chips de
  equipamento são filtro multi-seleção, sobrepondo cores no mesmo grid;
  criar/editar/cancelar com recorrência, designar publicador; mês continua
  em lista), **Visão geral** (`/admin/tp/geral`, todos os
  equipamentos sobrepostos, coloridos por `cor`), **Pontos**
  (`/admin/tp/pontos`, CRUD nome/endereço/GPS), **Equipamentos**
  (`/admin/tp/equipamentos`, CRUD tipos/peças/carrinhos, catálogo real
  S-80-T), **Publicadores** (`/admin/tp/publicadores`, roster read-only de
  disponibilidade)
- **Publicações** (`/publicacoes`, P-A + TP-D) — 4 seções com chips no
  topo (Pedidos/Reposição/Catálogo/Controle): fila de `pedidos_publicacao`
  (filtro pendentes/entregue/cancelado/todos), avançar status + notas do
  servo; **Reposição** (itens de relatório de TP != ok ainda não
  resolvidos, agrupados por carrinho/ponto, botão Resolvido) + card
  simples de tendência (soma de qtd colocada por publicação/mês); **Lista
  de controle** (escolhe publicação → checklist de todo publicador ativo
  com contador +/- de pedido e de entrega, busca por nome e totais,
  `publicacao_controle`);
  suprimento de campanha é só um link pra `/admin/campanha`. Fica FORA de
  `/admin/*` de propósito — a rota é guardada por `exigirServoPub` (admin
  OU `profiles.servo_publicacoes`), não por role, pra um servo publicador
  comum (não-admin) conseguir acessar. Entrada no drawer admin (ícone
  `inbox`); pro servo não-admin, card "Área do servo" em `/publicador`.

## Telas principais (modo campo — publicador + dirigente)

- **Home/carteira** (`/publicador`) — card destacado se campanha ativa +
  card "🎪 Você dirige" (arranjos que dirijo, com link "Repartir →") +
  card amarelo "🚶 Pregação em grupo — sua parte" (via `arranjo_partes`)
  + card de turnos de TP nos próximos 7 dias + card "Publicações" (pedir
  publicação do catálogo ou avulsa + status dos meus pedidos — P-A).
  Carteira dividida em Território pessoal / ✉ Cartas designadas + lista
  TCEs abertos.
- **Mapa** (`/publicador/mapa`) — só dirigente/admin. Mapa map-driven pra
  concluir quadra, POIs (Estacionar perto → marcadores no mapa + rota
  Google Maps), 📸 PNG export, ✂ Criar parte (seleciona um arranjo que eu
  dirijo + subset de quadras pra repartir com um publicador).
- **Arranjo** (`/publicador/arranjo`) — agenda da semana com arranjos +
  turnos de TP (inscrever/sair + botão "Relatório do turno" quando a
  data já passou e o publicador participou — checklist de peças do tipo
  do carrinho, TP-D). Todo publicador pode sinalizar "Quero
  participar" (inscrição antecipada); dirigente ganha **✂ Repartir
  território** (nos arranjos dele, cria/apaga `arranjo_partes`) +
  **👋 Assumir dirigência** (nos arranjos dos outros) + link público.
- **Prédios** (`/publicador/predios`) — busca + 📍 GPS + tabs/filtros +
  criar prédio pendente. Se dirigente: checkbox multi-seleção + 🎯
  Designar cartas.
- **Campanha** (`/publicador/campanha`) — objetivos + gráfico.
- **/predio/[id]** — tela ÚNICA de trabalhar um prédio. Toggle
  **🚪 Casa em casa** (registros: conversou/semConversa/naoAtendeu/carta)
  vs **✉ Cartas** (unidades: carta escrita/desocupado/nao_escrever).
  Cartas tem DOIS momentos: aba Cartas = ESCRITA (marca "Carta escrita"
  + data + quem escreveu); ENTREGA = desfecho "Deixou carta" do casa em
  casa, que brilha (ring roxo pulsante) quando a unidade tem carta
  escrita sem entrega. Correio é o fallback, mesmo botão. Botões NÃO
  ficam pressionados pra sempre: casa em casa reseta na conclusão da
  quadra, cartas resetam quando o admin inicia novo ciclo (ver
  `cartas_ciclos`).
  Header tem ✏ Editar + 📤 WhatsApp share. Progresso duplo.

## Deploy

- Branch `main` → Cloudflare Workers auto-deploy.
- `pwa-rewrite` era a branch de desenvolvimento (já mergeada).
- Migrations novas: rodar SQL no `/admin/dev/sql` (cola o conteúdo do arquivo
  `supabase/migrations/0XX_*.sql`).
- `.env`: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (só pro script de migração),
  `PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (Web Push, PUSH-A — gerar
  com `node scripts/gerar-vapid.mjs`; em produção via `wrangler secret put
  VAPID_PRIVATE_KEY` + a pública no `wrangler.toml`/dashboard, não é segredo).
  **Opcionais**: lidas via `$env/dynamic/*` em `$lib/server/push.ts`/`/perfil`
  de propósito — faltando, só desativa o Web Push (sino in-app continua),
  NUNCA quebra o build. Nunca trocar essas duas por `$env/static/*` (já
  quebrou o deploy inteiro uma vez por isso — static exige a var em tempo
  de build, dynamic não).

## Anti-padrões (não cair)

- `$effect` com early-return antes de ler deps → não rastreia.
- `interpolate(zoom)` aninhado em `match` no MapLibre → erro.
- `delete().neq('id','x')` em coluna bigint → falha silenciosa; use TRUNCATE/`.gte`.
- Paginação por offset sem `.order()` estável → duplica/pula linhas.
- `alert()` / `new Date("yyyy-mm-dd")` direto.
- Calcular "há N dias" com `Date.now() - new Date(iso + 'T12:00:00').getTime()`
  dá **-1** sempre que o relógio local ainda não passou do meio-dia (ex:
  quadra concluída HOJE de manhã aparecia "há -1 dias"). Use
  `diasDesde()` de `$lib/utils/data.ts` (compara meia-noite local dos
  dois lados, não meio-dia).
- `CREATE OR REPLACE VIEW` só aceita adicionar coluna nova no **FINAL**
  da lista do SELECT. Inserir no meio (ex: antes de `poly_geojson`/
  `geo_geojson`) muda a posição das colunas seguintes e o Postgres
  rejeita com `cannot change name of view column "X" to "Y"`. Sempre
  que alterar `quadras_geo`/`locais_geo`/`tces_geo`/etc. numa migration,
  coloque a coluna nova DEPOIS da(s) coluna(s) de geometria existente(s).

## Rodando testes

```bash
npm test
```

Testes em Node puro via `tsx` (resolve `$lib`), sem framework — cobrem
lógica pura de `$lib` (posse de quadra, status de campanha, expansão de
ocorrências de arranjo/TP, `diasDesde`). Não há integração contra Supabase
real (precisaria de projeto de teste com seed). Ver `tests/README.md`.
