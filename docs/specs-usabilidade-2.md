# Specs — Rodada de usabilidade 2

> Escrito a partir de uma rodada de testes de usabilidade real do
> usuário (13 itens). Ordem de execução em
> `docs/tasks-usabilidade-2.md`. Numeração de migrations começa em 074.
> Convenções gerais valem as mesmas do CLAUDE.md e das rodadas
> anteriores (zero emoji fora do `Icon`, `window.toast`, datas
> `T12:00:00`, `selectAll` em query grande, guard espelhando RLS).

---

## U13 — [FEITO] Densidade por residências ficava cinza

Causa: `quadras_contagens` (migration 071) devolvia `qtd_locais`/
`qtd_unidades` como `bigint`/`numeric`, que o PostgREST serializa como
STRING no JSON — a expression `interpolate` do MapLibre exige `number`.
Corrigido com `::int` na view (migration 073) + `Number()` defensivo em
`contarPorQuadra` (`src/lib/server/queries.ts`). Já commitado e
mergeado em `main`.

## U4 — [RESPONDIDO] Botão "Auditoria" na sidebar

`/admin/auditoria` é o visualizador do `audit_log` — trilha genérica de
mudanças (quem alterou o quê, quando), filtrável por tabela. É
diferente do modo "Auditar" dentro de Polígonos (U11), que é uma
ferramenta de consistência geométrica/IBGE. Nenhuma mudança de código
necessária.

---

## U3 — Publicador não-aprovado não vê o TP

Hoje qualquer publicador vê a aba TP mesmo sem `profiles.tp_aprovado`.
O pedido é: só ADMIN vê a aba/ícone do TP sem estar aprovado; qualquer
outro publicador só vê se `tp_aprovado = true`.

- Esconder o ícone/link do TP na bottom nav e em qualquer menu quando
  `!(profile.role === 'admin' || profile.tp_aprovado)`.
- Adicionar guard equivalente no `+layout.server.ts` ou no próprio
  `+page.server.ts` de `/publicador/tp` pra redirecionar (defesa em
  profundidade — RLS de `tp_*` já deve restringir os dados, mas a rota
  em si não tinha esse gate).
- Arquivos prováveis: layout com a bottom nav (`+layout.svelte` do
  grupo `publicador`), `src/routes/publicador/tp/+page.server.ts`.
- Aceite: publicador comum sem aprovação não vê nenhum vestígio do TP;
  ao tentar acessar `/publicador/tp` direto pela URL, é redirecionado.

## U8 — Botão pra voltar fase do TP

`FASES = ['disponibilidade', 'montagem', 'publicado', 'fechado']`
(`tp_meses.fase`). A action `definirFaseMes` já faz upsert sem
restrição de direção — só o helper `proximaFase()` no client é
forward-only.

- Adicionar no `/admin/tp` um controle (ex.: menu ou botão secundário
  ao lado do indicador de fase atual) que permite voltar uma fase, ou
  "reabrir mês" (fase='disponibilidade' de novo a partir de
  'publicado'/'fechado').
- Confirmação (`confirm()` ou sheet) avisando o efeito: voltar pra
  disponibilidade não apaga agendamentos já publicados, só reabre a
  fase pra edição.
- Arquivos: `src/routes/admin/tp/+page.svelte` (a UI da fase),
  `+page.server.ts` (reusa `definirFaseMes`, sem mudança de backend).
- Aceite: dá pra ir de qualquer fase pra qualquer outra pelo admin.

## U9 — Dirigente finalizar designação antes do prazo

`precisaFinalizar()` (`$lib/arranjos`) só mostra "Finalizar designação"
depois que a data do arranjo já passou (ou hoje após 20h). Não existe
hoje um jeito do dirigente encerrar voluntariamente ANTES disso (pra
liberar as quadras mais cedo, por exemplo se o grupo terminou tudo).

- Em Casa a casa → "Seu grupo", adicionar uma ação secundária sempre
  visível (não só quando `precisaFinalizar()`) tipo "Encerrar agora"
  que roda a MESMA action `finalizarArranjo` já existente, com um
  `confirm()`/sheet deixando claro que é antecipado ("Isso libera as
  quadras não concluídas pra outra designação AGORA, mesmo antes do
  prazo").
- Não mexer no alerta automático pós-prazo (continua como está) — só
  adicionar a opção manual antecipada.
- Arquivo: `src/routes/publicador/casa-a-casa/+page.svelte` (+ o
  `+page.server.ts` já tem a action, não deve precisar mudar).
- Aceite: dirigente com arranjo futuro/em andamento vê a opção de
  encerrar antes da hora; após confirmar, quadras somem de "Seu grupo".

## U10 — Overflow das abas em Polígonos no mobile

Container `<div class="flex gap-1 rounded-lg bg-slate-100 p-0.5">` (a
barra `MODOS`) não tem `overflow-x-auto` — com a 6ª aba (Curadoria) as
abas estouram a tela no mobile.

- Adicionar `overflow-x-auto` no container + `shrink-0 whitespace-nowrap`
  em cada botão de aba, pra rolar horizontalmente em vez de quebrar
  linha ou cortar.
- Arquivo: `src/routes/admin/poligonos/+page.svelte`.
- Aceite: testar em viewport estreito (375px) — abas rolam, nada corta.

## U1 — Ordenação automática ao redor da quadra

Reordenar manualmente (T14, setinhas ▲▼) funciona, mas o pedido é ter
uma ordem PADRÃO sensata quando ninguém mexeu ainda — ao redor da
quadra, sentido horário, a partir do centro.

- Onde a lista de endereços de uma quadra é montada (provavelmente
  `src/routes/publicador/quadra/[id]/+page.server.ts` e o equivalente
  em `/admin`), quando `ordem_na_quadra` é null para todos (ou o
  publicador não reordenou manualmente), calcular:
  1. Centro da quadra: centroide do polígono (`poly_geojson`) — média
     dos vértices do anel externo é suficiente (não precisa de
     centroide "verdadeiro" ponderado por área).
  2. Ângulo de cada local em relação ao centro:
     `Math.atan2(lat - centroLat, lng - centroLng)`.
  3. Ordenar por esse ângulo (ascendente = sentido horário quando lat
     cresce pra cima e lng pra direita, com atan2 padrão — conferir o
     sinal visualmente com uma quadra real antes de finalizar; se sair
     anti-horário, inverter o sort).
- Isso é só a ORDEM PADRÃO — endereços com `ordem_na_quadra` setado
  manualmente continuam respeitando o valor manual (regra que já
  existe, T14); a ordenação por ângulo só entra como fallback quando
  não há nenhuma ordem manual na quadra.
- Pode ser uma função pura nova em `$lib/utils` (ex.:
  `ordenarPorAngulo(centro, locais)`), testável em `tests/`.
- Sem migration (é só função de ordenação, não persiste nada novo).
- Aceite: quadra sem nenhuma reordenação manual mostra os endereços
  "dando a volta" em vez de ordem aleatória de inserção.

---

## U5 — Export de backup: 1kb + erro 500

Causa: `src/routes/admin/dev/backup/export/+server.ts` faz um loop
sequencial sobre as 39 tabelas de `TABELAS_BACKUP`, cada uma com
`selectAll` (paginação + dedup), acumula tudo num objeto `tabelas` em
memória, e só no final faz UM `JSON.stringify(payload)` gigante. Pra
uma base de tamanho real isso é o pior padrão possível: um bloco
síncrono enorme (o stringify de centenas de milhares de linhas) e/ou
tempo total de execução estourando o limite do Worker no meio do loop
— o "arquivo de 1kb com erro 500" bate com uma página de erro do
Cloudflare cortando a resposta no meio.

- Reescrever como **streaming**: usar um `ReadableStream` (ou
  `TransformStream`) que escreve o JSON incrementalmente — abre `{`,
  escreve `"versao":...,"gerado_em":...,"tabelas":{`, e então, tabela
  por tabela, busca (`await`) + serializa SÓ aquela tabela
  (`JSON.stringify(linhas)`) + enfileira (`controller.enqueue`) antes
  de passar pra próxima. Fecha com `}}`.
- Por que ajuda: o modelo de CPU do Cloudflare Workers é por RAJADA
  síncrona entre `await`s, não cumulativo pro request inteiro (já
  confirmado nesta sessão). Serializar tabela por tabela, com um
  `await` de rede entre cada uma, quebra o trabalho em N rajadas
  pequenas em vez de 1 rajada gigante — reduz bem o risco de estourar
  o limite por rajada, mesmo que o tempo TOTAL do request seja parecido.
- Manter o mesmo formato de JSON final (chave `tabelas` com um objeto
  por nome de tabela) — o restore (`_tabelas.ts` / restore endpoint) não
  deve precisar mudar, só como o export é PRODUZIDO.
- Arquivo: `src/routes/admin/dev/backup/export/+server.ts`.
- Aceite: exportar com a base real do usuário gera um arquivo completo
  (não 1kb) sem erro 500. Testar localmente com um dataset grande
  (pode simular duplicando linhas de fixture se a base local for
  pequena) pra garantir que o streaming realmente funciona antes do
  usuário testar em produção.
- Não testado (a declarar no commit): comportamento exato do
  Cloudflare Workers Runtime com streams grandes — validar visualmente
  no `npm run preview`/`wrangler dev` local antes do deploy, já que o
  ambiente local de Postgres não reproduz o Worker de verdade.

## U12 — Continuar buscando otimizações (item recorrente)

O usuário bateu no erro 1102 (worker caiu) de novo mexendo em
Polígonos — reforça que ainda há mais candidatos do mesmo padrão
(bloco síncrono grande) espalhados pelo app, além dos já corrigidos
(TCE embed, `contarLocaisPorQuadra`/`contarResidenciasPorQuadra`,
export de backup).

- Não é uma task fechada — é um mandato permanente (o usuário já deu
  sinal verde: "o que der pra melhorar a performance, tô aceitando
  sempre"). Candidatos a auditar nesta rodada, em ordem de suspeita:
  1. `/admin/poligonos` load() — carrega `locais` inteiro da
     congregação (pra Vincular/Auditar) numa query só; conferir se dá
     pra empurrar mais filtro/agregação pro Postgres (ex.: o cálculo
     de `clusterPorQuadra`/`quadraIdsPorCluster` hoje é um `for` em JS
     sobre todos os locais — candidato a virar view/RPC como
     `quadras_contagens`, se o volume justificar).
  2. `/admin/dev/sql` (executor de SQL livre) — sem agregação
     aplicável, mas conferir se o retorno de queries grandes é
     truncado/paginado antes de virar HTML.
  3. Qualquer rota que ainda chame `selectAll` sobre `locais`/
     `unidades`/`registros` sem filtro de quadra/publicador.
- Pra cada candidato confirmado como problema real (não só suspeita),
  abrir uma migration/mudança pontual seguindo o MESMO padrão já
  estabelecido (agregação em SQL via view, ou streaming como em U5) —
  não uma reescrita geral.
- Aceite: relatório curto (no commit ou no chat) do que foi auditado e
  o que foi ou não corrigido nesta passada.

---

## U6 — Snapshot automático + restauração (versionamento de dados)

Decisão do usuário: sem plano pago do Supabase — versionamento via
**snapshot JSON automático agendado**, não PITR de verdade. Depende de
U5 (o cron reusa a lógica de export em streaming — sem isso, o cron
corre o mesmo risco de estourar CPU).

- **Geração**: Cloudflare Cron Trigger (config em `wrangler.toml`, ex.
  diário de madrugada) chamando uma rota interna equivalente ao export
  de U5, mas gravando o resultado num bucket do Supabase Storage
  (criar bucket `backups-auto`, privado) em vez de retornar como
  download. Nome do arquivo com timestamp
  (`backup-YYYY-MM-DD.json`).
- **Rotação**: manter só os últimos N (ex.: 7) — o próprio cron apaga
  o mais antigo antes de gravar o novo, ou uma rotina separada. N
  configurável por constante no código, não precisa de UI pra isso.
- **Restauração**: em `/admin/dev/backup`, nova seção "Snapshots
  automáticos" listando os arquivos do bucket (nome + data), com botão
  "Restaurar deste snapshot" reusando a MESMA lógica de restore-por-
  upsert que já existe (T34) — baixar o JSON do Storage em vez de
  upload manual, e seguir o fluxo de confirmação forte já existente.
- **wrangler.toml**: adicionar o `[triggers]`/`crons` com cuidado — já
  houve um incidente de deploy quebrado nesta sessão por trocar env var
  de dynamic pra static; testar a config de cron não quebra o build
  antes de fazer merge pra `main` (idealmente confirmar num preview
  deploy, não só local).
- Aceite: um snapshot aparece automaticamente no bucket após o cron
  rodar (pode testar disparando a rota manualmente primeiro); a lista
  aparece em `/admin/dev/backup`; restaurar de um snapshot antigo local
  de teste funciona via o restore já existente.
- 🔴 justificativa: mexe em `wrangler.toml` (já causou 1 incidente de
  deploy nesta sessão), cria infraestrutura nova (Storage bucket +
  Cron Trigger) e reusa um caminho destrutivo (restore) — pedir
  revisão antes do merge final pra `main`, mesmo que a implementação
  em si seja direta.

---

## U11 — Auditar (Polígonos): ver endereços + Street View por cluster

Hoje o bloco "Múltiplos clusters IBGE" (`quadrasMultiCluster`, A20)
mostra só a CONTAGEM de locais por cluster (`setor|quadra_ibge`) dentro
de uma quadra, sem os endereços — o usuário não consegue auditar sem
ver ONDE cada cluster está fisicamente.

- **Server** (`src/routes/admin/poligonos/+page.server.ts`, função que
  monta `quadrasMultiCluster`): hoje o `for` sobre `locais` só conta
  (`m.set(cluster, qtd+1)`). Trocar pra também guardar, por cluster,
  a lista dos `locais` membros: `{ id, endereco, lat, lng }` (usar
  `locais_geo` ou o `geo_geojson` já disponível no load — extrair
  `[lng, lat]` de `coordinates`). Quadra-escopado, não é caro (poucas
  dezenas de locais por quadra).
- **UI** (`+page.svelte`, bloco do `quadrasMultiCluster`): expandir
  cada cluster pra mostrar a lista de endereços membros, cada um com:
  - checkbox "pertence a esta quadra" (default TRUE pro cluster
    majoritário, e também TRUE pros outros até o admin decidir — ou
    default FALSE pros clusters minoritários, o que for mais seguro:
    recomendo default = pertence ao cluster MAJORITÁRIO apenas,
    minoritários vêm desmarcados, já que são o sinal de problema);
  - link "Street View" — abrir
    `https://www.google.com/maps/@{lat},{lng},3a,75y,90t/data=!3m4!1e1`
    (ou o formato equivalente mais simples
    `https://www.google.com/maps?q=&layer=c&cbll={lat},{lng}`) numa
    nova aba (`target="_blank" rel="noopener"`), pra conferir visualmente
    se aquele ponto realmente é dessa quadra.
- **Ação "Salvar seleção"**: os endereços DESMARCADOS têm
  `quadra_id` setado pra `null` (saem desta quadra) — não tenta
  adivinhar outra quadra automaticamente, eles caem no pool "sem
  quadra" que já tem o fluxo existente (aparecem em
  `data.locaisSemFace`-like listagem → botão "Atribuir quadra" já
  existente, que pula pro modo Vincular). Os marcados ficam como estão
  (ou, se for o cluster minoritário marcado como pertencente, isso
  ainda deixa o `setor`/`quadra_ibge` inconsistente — está OK, o
  "Unificar clusters" continua sendo a ação certa pra esse caso
  específico; a nova seleção é sobre GEOGRAFIA/pertencimento, o
  Unificar já resolve NORMALIZAÇÃO de cluster).
- Reusar a action de update de `locais.quadra_id` já existente
  (admin-only, sem trigger bloqueando porque é admin) — não precisa de
  RPC novo, é UPDATE direto via action do SvelteKit.
- Aceite: abrir uma quadra com 2+ clusters mostra os endereços de cada
  cluster com link de Street View; desmarcar um endereço e salvar tira
  ele da quadra e ele aparece na listagem de "sem quadra".

---

## U2 — Publicador reporta posição errada do prédio

Decisão do usuário: aplica na hora + fica pendente de curadoria (mesmo
padrão do overlay livre, T11/migration 057) — não é uma aprovação
prévia do admin.

Hoje o trigger `guard_locais_update()` (migration 057) BLOQUEIA
não-admin de alterar `geo`, `quadra_id`, `setor`, `quadra_ibge`,
`face_ibge` (colunas estruturais) com o erro `'Coluna estrutural do
endereço — só admin altera'`. Preciso abrir uma exceção controlada só
pra este fluxo específico, sem abrir a porta geral pra qualquer
publicador editar essas colunas livremente por outro caminho.

**Desenho: RPC `security definer` dedicado**, não afrouxar o trigger
geral (o trigger continua bloqueando update direto via PostgREST;
só uma função explícita, com suas próprias checagens, pode passar por
cima dele — mesmo espírito de outras operações geométricas que já
passam por RPC, ex. `ST_Union`/`ST_Split`).

- **Migration 074**: função `reportar_posicao_incorreta(p_local_id
  bigint, p_novo_geo geometry, p_nova_quadra_id text)` `security
  definer`:
  - Exige que o caller (`auth.uid()`) tenha POSSE da quadra ATUAL do
    local — mesma checagem de `pode_editar_local`/posse.ts (dirigente
    designado, publicador com designação/parte cobrindo a quadra, ou
    admin).
  - Caso (a) — mesma quadra, posição errada: `p_nova_quadra_id` vem
    igual ao atual (ou null = "não mudou"); só atualiza `geo`.
  - Caso (b) — não pertence a esta quadra: `p_nova_quadra_id` é a
    quadra escolhida; atualiza `quadra_id` e também `setor`/
    `quadra_ibge`/`face_ibge` copiando de um local existente na quadra
    de destino (pega qualquer um com esses campos preenchidos; se a
    quadra de destino não tiver nenhum, deixa null — cai no fluxo de
    "sem face IBGE" existente, que já tem ação de resolver).
  - Grava snapshot ANTES (linha completa relevante) e insere em
    `curadoria_edicoes` (tipo='edicao', mesmo helper/formato de
    `registrarCuradoria`, mas chamado de dentro da função SQL ou logo
    em seguida no server action — decidir pelo que for mais simples de
    manter consistente com o padrão TS existente; se `registrarCuradoria`
    for só TS, chamar ele na action do SvelteKit LOGO APÓS a RPC, dentro
    da mesma request, não dentro da function SQL).
  - Confirmar/reverter na tela de curadoria (T12) já deve funcionar sem
    mudança, desde que o "antes"/"depois" tenha os campos certos —
    conferir se o componente de diff já lida com múltiplos campos
    (deve, já mostra `Object.entries(c.antes)`).
- **UI** — dois pontos de entrada, na tela de trabalhar prédio/quadra
  (`/predio/[id]` e/ou `/publicador/quadra/[id]`, ver qual já expõe
  edição de endereço):
  - Botão "📍 Reportar posição errada" → sheet com 2 opções:
    1. **"Pertence aqui, mas o pino tá no lugar errado"** → botão
       "Usar minha localização atual" (mesmo padrão de GPS já usado em
       `/publicador/predios` pra criar prédio pendente) → chama a RPC
       com a `geo` do GPS do aparelho, mesma `quadra_id`.
    2. **"Não pertence a esta quadra"** → mostra as quadras PRÓXIMAS
       (reusar a mesma lógica de proximidade — haversine local — já
       usada em outros lugares, ex. sort por proximidade documentado
       no CLAUDE.md) num seletor; ao escolher, chama a RPC com
       `p_nova_quadra_id` = a escolhida.
  - Depois de qualquer uma das duas, o endereço SOME da lista da
    quadra atual (se mudou de quadra) ou só atualiza a posição no mapa
    (se só corrigiu o pino) — `invalidateAll()`.
- **Não afeta** as colunas de CARTA nem `registros`/desfechos — só
  geo/quadra_id/cluster.
- Aceite: publicador comum reporta os dois casos, o endereço se move
  (visualmente, na hora) e aparece pendente em `/admin/poligonos` →
  Curadoria (ou onde a fila de curadoria for revisada) pro admin
  confirmar/reverter.
- 🔴 justificativa: é uma exceção deliberada a uma trava de segurança
  de dado que existe desde T11 por um motivo real (impedir que
  qualquer publicador bagunce a geometria/cluster do território) — a
  mitigação é a checagem de posse dentro da RPC + trilha de curadoria,
  mas vale uma revisão específica desta migration antes de aplicar em
  produção.

---

## U7 — Reset de dados de teste

Decisão do usuário (via pergunta de esclarecimento): manter
território/quadras/endereços intactos; apagar histórico de trabalho de
campo E designações/arranjos/agendamentos de teste; manter só os
catálogos.

**MANTER intactos** (estrutura/config, não é "teste"):
- `territorios`, `quadras` (nome/cor/território/ativa/poly) — porém
  RESETAR `quadras.data_conclusao` → null e
  `quadras.reservada_campanha_id` → null (são estado de trabalho, não
  estrutura).
- `locais`, `unidades` (endereços/estrutura) — porém RESETAR
  `unidades.carta_entregue` → null e `carta_escrita_por` → null.
- `tces` (nome/tipo/notas/geometria — estrutura) — porém RESETAR
  `status` → `'aberto'`, `publicador_id` → null (e decidir na hora se
  `prazo` também zera — default: zera, já que era um prazo de teste).
- `profiles`, `convites` (usuários reais).
- Catálogos: `arranjo_modalidades`, `publicacoes`,
  `tp_carrinho_tipos`, `tp_pecas_catalogo`, `tp_carrinhos`,
  `tp_pontos`, `publicador_necessidade_regular`.
- `tp_preferencias`, `tp_disponibilidade` (config pessoal recorrente,
  não é dado de "teste de uso", é preferência real de cada publicador).

**APAGAR (DELETE completo das linhas)**:
- `registros`
- `quadras_conclusoes`
- `campanha`, `campanhas`, `campanha_suprimentos`
- `curadoria_edicoes`
- `designacoes`, `designacao_quadras`, `designacao_publicadores`,
  `designacao_locais`, `designacao_tces`
- `arranjos`, `arranjo_partes`
- `tp_agendamentos`, `tp_agendamento_excecoes`,
  `tp_agendamento_participantes`, `tp_meses`,
  `tp_disponibilidade_mes`, `tp_disponibilidade_confirmacoes`
- `tp_relatorios`, `tp_relatorio_itens`
- `pedidos_publicacao`, `publicacao_controle`
- `territorio_tokens`, `cartas_tokens`
- `notificacoes` (opcional, mas faz sentido — são notificações do
  período de teste)

**Ordem de exclusão**: respeitar FKs — de folha pra raiz, o inverso da
ordem de restore em `_tabelas.ts` (ex.: `arranjo_partes` antes de
`arranjos`; `designacao_*` antes de `designacoes`;
`tp_agendamento_*` antes de `tp_agendamentos`).

**Depois de apagar**: inserir uma linha nova em `cartas_ciclos` (mesmo
efeito do botão "Iniciar novo ciclo" em `/admin/predios`), pra garantir
que nenhuma marca de carta antiga do ciclo anterior fique "valendo".

- Este NÃO é uma migration numerada — é um script de manutenção
  pontual (SQL avulso), rodado uma única vez via `/admin/dev/sql`
  (RPC `exec_sql`), igual outras operações administrativas ad-hoc.
  Não entra no diretório `supabase/migrations/`.
- **Antes de rodar de verdade**: montar o SQL literal completo
  (todos os `DELETE FROM ...` na ordem certa + o `UPDATE quadras SET
  data_conclusao = null, reservada_campanha_id = null`, o `UPDATE
  unidades SET carta_entregue = null, carta_escrita_por = null`, o
  `UPDATE tces SET status = 'aberto', publicador_id = null, prazo =
  null`, e o `INSERT INTO cartas_ciclos ...`) e mostrar pro usuário
  no chat pra confirmação explícita, MESMO que este spec já esteja
  aprovado — é uma operação destrutiva e irreversível sobre dados que
  parecem ser de uma congregação real, não um ambiente de teste
  isolado.
- Rodar por ÚLTIMO na rodada, depois que as outras features estiverem
  prontas e testadas (faz mais sentido resetar quando o app já está no
  estado final desta rodada).
