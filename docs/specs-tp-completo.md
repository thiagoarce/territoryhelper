# Specs: TP completo — equipamentos, disponibilidade, relatórios, servo de publicações, push

**Documento de construção pra IA executora ("o pedreiro").** As migrations
(041–046) já estão escritas, revisadas e commitadas — o schema é FIXO. Sua
tarefa é construir o código (actions + UI) contra esse schema, incremento
por incremento, na ordem abaixo. Não altere as migrations já commitadas;
se um ajuste de schema for mesmo necessário, abra uma migration NOVA
(047+) e justifique.

## ⏯ Status
- ✅ Migrations `041`–`046` escritas + commitadas (aplicar via `/admin/dev/sql`
  na ordem, uma por incremento — NÃO aplicar todas de uma vez; cada
  incremento aplica a sua e testa).
- ⏳ Código (actions/telas): a construir, incrementos TP-A … PUSH-A.
- ⏳ Seed do catálogo de peças (TP-A): depende do PDF do usuário.

## Regras inegociáveis (CLAUDE.md — o que morde)
- **Svelte 5 runes**: em `$effect` leia as deps ANTES de qualquer
  early-return. Pra `Set`/`Map`, derive key primitiva.
- **Defesa em profundidade**: TODA action restrita checa
  `locals.profile?.role` (ou o guard) no início, além da RLS. Sucesso falso
  é bug (uma escrita bloqueada por RLS retorna sucesso silencioso).
- **Datas** `date`: nunca `new Date("yyyy-mm-dd")` — some `T12:00:00`. Use
  `diasDesde()`/helpers de `$lib/utils/data.ts`.
- **Zero emoji na UI** — componente `Icon` (lucide, prop `spin` pra loading).
  Emoji só em marcador de mapa.
- **`Icon` com loading**: use `spin={condição}` — NUNCA
  `class={cond && 'animate-spin'}` (perde o `inline-block` base e quebra
  linha; foi um bug real).
- **`selectAll`** em query de tabela grande.
- **`window.toast`/`toast.*`** em vez de `alert()`. `BottomSheet` pra modais.
- **Loading state** em toda ação assíncrona (`Button loading=` ou `spin`).
- Cada incremento: aplica migration → `npm run build` verde → `npm test`
  verde → commit → push pra `main` → **usuário testa antes do próximo**.

## Superfície existente a reusar (não recriar)
- `src/lib/arranjos.ts`: `ocorrenciasTurnoEntre(turnos, isoIni, isoFim)`
  expande turnos recorrentes; `rangeDoPeriodo`, `DIAS_SEMANA`,
  `DIAS_ORDENADOS`. **Não** suporta exceções de data (ver Riscos).
- `src/lib/server/guards.ts`: `exigirRole(locals, roles[])`. Crie
  `exigirServoPub` no mesmo padrão (admin OU `profile.servo_publicacoes`).
- `src/lib/server/supabase-admin.ts`: `supabaseAdmin` (service role) — já
  existe. É o que o push usa pra ler subscriptions alheias.
- `src/lib/ui/`: `BottomSheet`, `Button`, `Card`, `Icon`, `toast`.
- Padrão GPS "Usar minha localização": `src/routes/admin/tp/+page.svelte`
  (`usarMinhaLocalizacao`) e `AdicionarLocalSheet.svelte`.
- `MapaAdmin.svelte`: tem `onClick` com `lngLat` → base pra "clicar no mapa
  pra posicionar pin" (se o usuário pedir; v1 usa GPS + lat/lng).
- Padrão prédio-pendente: `locais.pendente` criado pelo publicador →
  validado em `/admin/predios`. TP-E copia esse fluxo.
- `/admin/poligonos`: padrão de **abas/modos** numa tela — modelo pras abas
  do `/admin/tp`.

---

## TP-A — Equipamentos (carrinhos) · migration 041
**Tabelas**: `tp_carrinho_tipos`, `tp_pecas_catalogo` (categoria
fisica/literatura, `publicacao_id` opcional), `tp_carrinhos` (tipo_id,
guardado_em, custodia_id, status disponivel/manutencao/aposentado).

**UI** — `/admin/tp` vira **abas**: `Escala | Pontos | Equipamentos`.
Refatore o `+page.svelte` atual (que só tem a grade) pra um seletor de aba
(`let aba = $state<'escala'|'pontos'|'equip'>('escala')`) reusando o
conteúdo atual na aba Escala e a lista de pontos na aba Pontos.
Aba **Equipamentos**:
- Lista de carrinhos (Card por carrinho: nome, tipo, status badge,
  "guardado em", custódia com nome do publicador). Botão editar → sheet.
- Sheet carrinho: nome, select de tipo, guardado_em, select custódia
  (publicadores), select status, notas.
- Seção "Tipos & peças": lista de tipos; ao abrir um tipo, lista as peças
  (nome, categoria, publicação vinculada se literatura, ordem). Sheets pra
  criar/editar tipo e peça.

**Server** (`/admin/tp/+page.server.ts`): guard admin (já existe). Load
traz tipos, peças, carrinhos (join custódia→nome). Actions:
`criarTipo`/`atualizarTipo`/`apagarTipo`, `criarPeca`/`atualizarPeca`/
`apagarPeca`, `criarCarrinho`/`atualizarCarrinho`/`apagarCarrinho`.

**Seed**: quando o usuário mandar o PDF, gere um bloco SQL de INSERT dos
tipos/peças pra colar no `/admin/dev/sql`. Até lá, cadastro manual pela UI.

**Verificar**: cadastrar 1 tipo + 3 peças (2 físicas, 1 literatura) + 2
carrinhos; custódia mostra o nome; status badge correto.

## TP-B — Disponibilidade + transporte · migration 042
**Tabelas**: `tp_preferencias` (transporta_carrinho, notas),
`tp_disponibilidade` (janelas dia_semana/hora).

**UI** — nova seção "Testemunho público" em **`/perfil`**:
- Checkbox "Consigo levar o carrinho até o ponto" (→ `tp_preferencias`).
- Lista de janelas de disponibilidade (dia da semana + hora início/fim),
  com adicionar/remover inline.
- Atalho na Agenda (`/publicador/arranjo`), no card/topo de TP: "Informe
  sua disponibilidade →" apontando pra `/perfil`.

**Server** (`/perfil/+page.server.ts`): actions
`salvarPreferenciasTp` (upsert em `tp_preferencias`),
`adicionarDisponibilidade`, `removerDisponibilidade`. Guard: login (RLS já
restringe ao próprio).

**Verificar**: publicador marca transporta + 2 janelas; recarrega e
persiste; admin consegue ler (será usado no TP-C).

## TP-C — Escala designável + equipamento por ocorrência · migration 043
**Schema novo**: `tp_escala.origem` ('inscricao'|'designacao') +
`designado_por`; `tp_turnos.carrinho_id`; `tp_turno_ocorrencias`
(turno_id+data PK, carrinho_id, transportador_id, notas).

**Server** (`/admin/tp/+page.server.ts`):
- `designarNoTurno(turno_id, data, publicador_id)` — guard admin; valida
  vagas (mesma contagem do `inscreverTurno`); insere em `tp_escala` com
  `origem='designacao', designado_por=uid`; dispara push (PUSH-A) pro
  designado.
- `definirCarrinho(turno_id, data, carrinho_id)` — guard admin; upsert em
  `tp_turno_ocorrencias`; **valida conflito**: o mesmo `carrinho_id` não
  pode estar em duas ocorrências no MESMO `data` com turnos cujos
  [hora_inicio, hora_fim) se sobrepõem (query nos turnos do dia + suas
  ocorrências). Rejeita com msg citando o outro turno.
- `assumirTransporte(turno_id, data)` — publicador com
  `tp_preferencias.transporta_carrinho=true`; upsert setando
  `transportador_id=uid` (RLS já garante que só se põe a si mesmo).

**Server** (`/publicador/arranjo/+page.server.ts`): load passa a trazer
`tp_turno_ocorrencias` da janela + `tp_carrinhos` (nome) + quem transporta.

**UI admin (aba Escala = tela do servo)**: grade da semana (já existe) +
em cada célula com buraco, botão "Designar" → sheet listando publicadores
**com disponibilidade compatível** com o dia/hora do turno (cruze
`tp_disponibilidade`); quem transporta vem com badge e no topo. Mostrar o
carrinho da ocorrência + botão pra trocar. Badge vermelho "sem
transportador" quando a ocorrência tem carrinho mas ninguém que leve
(nem `transportador_id`, nem inscrito com `transporta_carrinho`).

**UI campo** (card do turno): mostrar carrinho + transportador; se o
publicador tem a flag e não há transportador, botão "Vou levar o carrinho";
escala com `origem='designacao'` ganha badge "designado".

**Teste puro novo** (`tests/`): função de matching
disponibilidade×turno e de detecção de conflito de carrinho (lógica pura,
extraída pra `$lib`).

**Verificar**: designar num buraco (só compatíveis aparecem); definir
carrinho; tentar pôr o mesmo carrinho em turno sobreposto → bloqueado;
"Vou levar" funciona; badge sem-transportador some.

## P-A — Área do Servo de Publicações · migration 044
**Schema**: `profiles.servo_publicacoes`, `is_servo_pub()`,
`pedidos_publicacao`; policies de `publicacoes`/`campanha_suprimentos`
agora aceitam `is_servo_pub()`.

**Guard**: `exigirServoPub(locals)` em `guards.ts`.

**UI** — rota nova **`/admin/publicacoes`** (guard: admin OU
`servo_publicacoes`):
- Seção **Pedidos**: fila de `pedidos_publicacao` (filtro por status),
  cada um com publicador, publicação/descrição, qtd; botões
  aberto→pedido→entregue + campo `notas_servo`.
- Seção **Suprimento de campanha**: reusar os componentes/ações do
  `/admin/campanha` (catálogo + checklist). Extraia pra componente
  compartilhado se ficar limpo; senão, link "Gerenciar em Campanha →".
- Seção **Reposição**: chega no TP-D.

Entrada no **drawer admin** (`src/routes/+layout.svelte`, grupo
Administrar, ícone `inbox`). Pro servo NÃO-admin: card "Área do servo →" na
home do campo (`/publicador`), e o drawer não aparece (ele é role
publicador) — então o acesso dele é por esse card + link direto.

**Usuários**: checkbox "Servo de publicações" no editar-usuário de
`/admin/usuarios` (grava `profiles.servo_publicacoes`; a trigger
`profiles_guard_sensitive` já exige admin pra mudar isso).

**Campo**: card/sheet "Pedir publicação" na home (`/publicador`) — select
do catálogo OU texto livre + qtd → insere `pedidos_publicacao`.

**Verificar**: publicador pede "Bíblia em russo"; servo (não-admin, com
flag) abre `/admin/publicacoes`, marca entregue; publicador vê o status
mudar.

## TP-D — Relatório de fim de turno · migration 045
**Schema**: `tp_relatorios` (turno+data unique), `tp_relatorio_itens`
(peca_id, estado ok/acabando/zerado/danificado, qtd_colocada, resolvido_*).

**UI campo** — no card do turno (Agenda e home), quando `data <= hoje` e o
publicador estava na escala (inscrito/designado): botão "Relatório do
turno" → sheet com o checklist das peças do **tipo do carrinho da
ocorrência** (`tp_turno_ocorrencias.carrinho_id` → `tp_carrinhos.tipo_id` →
`tp_pecas_catalogo`): físicas mostram ok/danificado; literatura mostra
ok/acabando/zerado + campo qtd colocada. Notas gerais. Em campanha ativa,
inclua a publicação principal (`campanhas.publicacao_id`) no checklist.

**Server**: action `salvarRelatorio(turno_id, data, itens[], notas)` —
valida que o publicador estava na escala da ocorrência; upsert do relatório
+ itens.

**UI servo** — seção "Reposição" em `/admin/publicacoes`: itens com
`resolvido_em is null` e estado ≠ ok, agrupados por carrinho/ponto; botão
"Resolvido" (grava resolvido_em/por). Card simples de tendência: soma de
`qtd_colocada` por publicação por mês.

**Verificar**: publicador relata "Sentinela zerada" + 5 colocações; item
aparece na Reposição; servo marca resolvido e some da fila.

## TP-E — Solicitar ponto na minha área · sem migration (colunas na 041)
**Server** (`/publicador/arranjo/+page.server.ts`): action `sugerirPonto`
(nome, endereco, lat, lng) → insere `tp_pontos` com `pendente=true,
ativo=false, criado_por=uid` (RLS `tp_pontos_sugerir` já permite).

**UI campo**: sheet "Sugerir ponto de TP" na Agenda (nome/endereço + GPS
"Usar minha localização", padrão do `/admin/tp`).

**UI admin** (aba Pontos do `/admin/tp`): badge "⏳ N pendentes"; cada
pendente com Aprovar (set `pendente=false, ativo=true`) / Recusar (apaga) —
padrão do validar-prédio de `/admin/predios`.

**Verificar**: publicador sugere ponto com GPS; admin aprova; ponto vira
ativo e aparece na lista normal.

## PUSH-A — Notificações (in-app + Web Push) · migration 046
**Schema**: `notificacoes` (fonte da verdade, alimenta o sino),
`push_subscriptions`.

**Arquitetura (siga à risca — é a parte não-óbvia):**
1. **`src/lib/server/push.ts`** — `criarNotificacao(publicadorIds[],
   {titulo, corpo, url})`: grava linhas em `notificacoes` via
   `supabaseAdmin` (bypassa RLS, permite notificar outros) e chama
   `enviarTickle(publicadorIds)`.
2. **`enviarTickle`**: lê `push_subscriptions` dos alvos (via
   `supabaseAdmin`), e pra cada endpoint faz `POST` **sem corpo** com header
   `Authorization: vapid t=<jwt>, k=<vapidPublicKeyBase64Url>` + `TTL`.
   O JWT é ES256 assinado com `VAPID_PRIVATE_KEY` via **WebCrypto**
   (`crypto.subtle.importKey`/`sign`) — a lib `web-push` do npm NÃO roda em
   Cloudflare Workers. Sem payload = sem criptografia aes128gcm (a parte
   difícil). Em falha do POST, `falhas++`; poda subscription com muitas
   falhas.
3. **`src/service-worker.ts`** — adicione listener `push`: ao receber (push
   vazio), `event.waitUntil(fetch('/api/notificacoes?nao_lidas=1',
   {credentials:'include'}))` → pega a mais recente → `showNotification`.
   Listener `notificationclick` → abre `notification.data.url`.
4. **`/api/notificacoes/+server.ts`** — GET (sessão) devolve notificações do
   usuário (`notificacoes` via `locals.supabase`, RLS filtra); POST marca
   lida. Rota autenticada por cookie (mesma origem — o SW fetch inclui
   credentials).
5. **Sino no header** (`src/routes/+layout.svelte`): ícone `bell` com badge
   de não-lidas; dropdown/sheet lista as notificações; clicar marca lida e
   navega pra `url`. **Este é o fallback universal** — funciona sem push.
6. **Registro** em `/perfil`: botão "Ativar notificações" (pede permissão
   via GESTO do usuário — obrigatório no iOS; iOS exige PWA instalado,
   16.4+) → `registration.pushManager.subscribe({userVisibleOnly:true,
   applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_PUBLIC_KEY)})`
   → POST da subscription (endpoint/p256dh/auth) pra gravar.

**Disparos v1** (transacionais, dentro das actions existentes):
- designação de território criada (`/admin` criarDesignacao,
  `/admin/predios` designarCartas) → publicadores designados.
- `designarNoTurno` (TP-C) → publicador designado.
- `pedidos_publicacao` mudou status (P-A) → solicitante.
- saiu de turno nas próximas 48h (`sairTurno`) → servo/admin.

**Env novas**: `PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (gerar par
VAPID; documentar no `.env.example` + `wrangler secret put`).
`SUPABASE_SERVICE_ROLE_KEY` já existe.

**Verificar**: em celular real com PWA instalado, ativar notificação no
`/perfil`; admin designa território → push chega e abre a tela certa. Sem
permissão concedida, o sino mostra a mesma notificação.

## PUSH-B — Lembrete agendado ("seu turno é amanhã") · v2, FORA deste plano
Precisa de cron (adapter-cloudflare não expõe scheduled handler). Caminho
futuro: pg_cron no Supabase + Edge Function. Só depois do PUSH-A provar a
infra.

---

## Fora do escopo v1 (não construir)
- Troca de turno entre publicadores (sai um / entra outro resolve).
- SMS / e-mail (push + in-app cobrem).
- Rotas móveis de carrinho (pontos fixos bastam).
- Aprovação prévia de publicador pra TP.
- Multi-congregação / escala metropolitana.

## Riscos / atenção
- **Exceção de ocorrência** (cancelar um sábado): `ocorrenciasTurnoEntre`
  não suporta. Se o usuário pedir, espelhar `excecoes_datas date[]` em
  `tp_turnos` (migration nova pequena) e filtrar na expansão.
- **iOS push**: só PWA instalado (16.4+) + gesto do usuário. Documentar no
  MANUAL.md quando o PUSH-A entrar.
- **SW fetch com sessão expirada**: `/api/notificacoes` pode dar 401 —
  tratar no SW (não mostrar notificação quebrada).
- **Conflito de carrinho**: a validação é na action (cruza horários); a
  RLS não cobre isso. Cobrir com teste puro.
- **P-A muda policies da 037**: ao aplicar a 044, as policies de
  publicacoes/suprimentos são substituídas — reaplicar limpo no
  `/admin/dev/sql`.

## Docs a atualizar quando cada bloco entrar
- `CLAUDE.md`: mover as tabelas novas da seção "em construção" pro modelo
  de dados corrente conforme forem ganhando UI; listar `/admin/publicacoes`
  e as abas de `/admin/tp` nas telas principais.
- `docs/MANUAL.md`: seções de TP (disponibilidade, relatório, sugerir
  ponto), área do servo, e o passo de ativar notificações (com a ressalva
  do iOS).
- `docs/CHANGELOG.md`: uma entrada por incremento.
