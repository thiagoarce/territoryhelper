# Specs — Rodada Exportáveis (E1–E5)

> Prioridade definida pelo usuário: E1 cartão S-12 → E2 relatório S-13 →
> E3 fix TCE no hub → E4 mapa offline (PMTiles, W11 herdado) → E5
> dashboard. E6 (multicongregação) é projeto FUTURO em branch separada —
> fora desta rodada. Migrations a partir de **078**.

## E1 — Cartão de Mapa de Território (formato S-12)

Gerar uma IMAGEM no layout do formulário oficial S-12-T ("Cartão de Mapa
de Território"): título, linha "Localidade ....... Terr. N.º ...", área
branca com o mapa, rodapé com a instrução de cuidado e "S-12-T 6/72".
Referência visual: PDF oficial enviado pelo usuário (cartão paisagem,
proporção ≈ 1,55:1).

**Onde**: no MESMO fluxo de compartilhar que já existe — a página
`/t/[token]` (link público de designação/arranjo). O botão "Compartilhar
com imagem" passa a abrir um sheet com preview do cartão + opções, em vez
de exportar o PNG cru do mapa.

**Conteúdo do cartão**:
- **Localidade**: não existe coluna de bairro no schema — o campo vem
  PRÉ-PREENCHIDO por geocodificação reversa do centroide da seleção
  (Nominatim, `zoom=14`, pega `suburb`/`neighbourhood`/`city_district`/
  `city`) e é EDITÁVEL no sheet antes de gerar (a pessoa corrige se o
  OSM errar). Compartilhar já é online-only, então a chamada externa não
  fere o offline. Falhou o Nominatim → campo vazio, digita à mão.
- **Terr. N.º**: os ids dos territórios AFETADOS pelas quadras do token
  (1 território → um número; várias → lista "3, 5").
- **Mapa**: mostra TODAS as quadras (ativas) dos territórios afetados,
  com a regra de cores do usuário:
  - **cinza** — não designada, disponível pra trabalhar;
  - **vermelho com X** — concluída "há pouco tempo" (limiar escolhível
    no sheet: últimos 3/6/12 meses, default 6 — não dá pra adivinhar o
    ciclo da congregação, então vira opção);
  - **destaque** (cor forte + borda grossa + rótulo) — as quadras do
    próprio token ("designadas para o dia").
  Quadra designada a OUTRA pessoa não tem estado próprio: aparece cinza
  (raro no mesmo território; não vale a complexidade).
- **Fundo**: seletor no sheet — Cinza (positron, default), Colorido
  (liberty), Brilhante (bright). Atende o "o fundo cinza não é tão bom
  mas podemos ter a opção de mudar".

**Dados**: o RPC `territorio_publico` só devolve as quadras do token.
Migration **078** adiciona a chave `contexto` ao JSON (nos dois branches,
arranjo e designação): `territorios` = [{id, nome}] distintos das quadras
do token, e `quadras` = todas as quadras ATIVAS desses territórios
({id, territorio_id, data_conclusao, poly_geojson}). Token sem quadra
(ex: só TCE/cartas) → `contexto` null → botão de cartão não aparece
(cartão de território só faz sentido com quadras). Exposição: o link
público passa a revelar geometria + data de conclusão das quadras
VIZINHAS do mesmo território — aceitável (mesma natureza do que o link
já mostra; sem dados pessoais).

**Render**: 100% no browser (canvas 2D), zero dependência nova:
1. Um mapa MapLibre PRÓPRIO e oculto (`CartaoTerritorio.svelte`), com
   `preserveDrawingBuffer`, recebe as quadras coloridas pela regra acima,
   faz `fitBounds` no conjunto do contexto, espera `idle` e exporta PNG.
   (Não reusa o mapa visível da página — o cartão precisa de outro
   enquadramento e outras cores sem bagunçar a tela.)
2. Composição num canvas 1600×1035 (≈ proporção do S-12 em 2x): moldura,
   título serif, linha Localidade/Terr. N.º com pontilhado, o PNG do mapa
   na área branca (object-fit contain), X vermelho desenhado por cima das
   quadras recentes (o X já vai na camada do MapLibre — ver nota), rodapé.
   Nota: o X é desenhado como camada `symbol` (text-field "✕") no próprio
   MapLibre, não no canvas de composição — assim escala e posiciona com o
   mapa de graça.
3. Compartilha com o MESMO caminho atual (navigator.share de File →
   fallback download + wa.me).

## E2 — Relatório S-13 por ano de serviço

Réplica imprimível do S-13-T ("Registro de Designação de Território"):
tabela Terr. n.º | Última data concluída | 4× blocos "Designado para"
(nome + data da designação + data da conclusão).

**Onde**: nova rota `/admin/relatorios/s13` (admin-only), entrada no
drawer (Sistema → "Relatório S-13"). **PDF via impressão do navegador**
(botão "Imprimir / Salvar PDF" → `window.print()`, CSS `@media print`
com `@page landscape`) — zero dependência nova; o Safari/Chrome salvam
PDF nativamente. Decisão: não usar jsPDF (dep nova pra algo que o
navegador já faz melhor).

**Ano de serviço**: seletor no topo. Ano de serviço N = 1/set/(N-1) a
31/ago/N (set/2024 → ano de serviço 2025). Default: ano de serviço
corrente.

**Algoritmo (ciclos por território)** — regra do usuário: "a designação
inicia com a data da primeira quadra de um território designada e
termina quando a última quadra daquele território é concluída".
- Por território T (quadras ativas de T):
  - Eventos de DESIGNAÇÃO: `designacoes.criado_em` de designações com
    alguma quadra de T (via `designacao_quadras`) + `arranjos.data` de
    arranjos com quadra de T.
  - Eventos de CONCLUSÃO: `quadras_conclusoes.data` das quadras de T
    (histórico append-only — a fonte da verdade).
  - **Ciclo**: abre no primeiro evento de designação após o fim do ciclo
    anterior; fecha na primeira data em que TODAS as quadras de T têm
    conclusão >= abertura do ciclo (data de fechamento = a última dessas
    conclusões). Ciclo aberto sem fechar = "Data da conclusão" em branco.
  - **Designado para**: nome do publicador da primeira designação do
    ciclo; se o ciclo só tem arranjos (trabalho em grupo), imprime
    "Campo (grupo)"; múltiplos publicadores → o primeiro + "e outros".
- Filtro do ano: entram os ciclos cuja designação OU conclusão cai
  dentro do ano de serviço; "Última data concluída" = fechamento do
  último ciclo ANTES do início do ano (regra do asterisco do formulário).
- Máximo 4 ciclos por linha (como o formulário); excedente vira uma
  segunda linha do mesmo território (continuação).

**Load universal no browser** (regra da casa: nada pesado no Worker).

## E3 — TCE só aparece no hub quando designado

Bug reportado (print): TCE criado fica listado em `/admin/designacoes`
pra sempre, mesmo "(sem publicador)". Regra nova: TCE entra no hub SÓ se
(a) `publicador_id` preenchido, OU (b) vínculo em `designacao_tces` com
designação aberta, OU (c) está em `arranjos.tces_ids` de arranjo ativo
válido. TCE órfão continua existindo (gerível em /admin — filtro TCEs — e
Polígonos), só sai da LISTA de designações. Contador do topo idem.

## E4 — Mapa de fundo offline (PMTiles) [= W11]

Ver specs-workers-offline.md (W11). Extract do município num bucket
público `mapa-offline`, download em /perfil, componentes de mapa usam
`pmtiles://` + glifos/sprites locais quando offline. Executor: Fable.

## E5 — Dashboard de saúde do território

Nova rota `/admin/dashboard` (entrada no drawer), load universal +
comCache. Cards:
- Cobertura: % de quadras com conclusão nos últimos 12 meses; total de
  quadras/territórios ativos.
- "Esquecidas": top 10 quadras com conclusão mais antiga (ou nunca).
- Tempo médio de ciclo por território (média do intervalo entre
  conclusões consecutivas em `quadras_conclusoes`).
- Conclusões por mês (gráfico de barras, últimos 12 meses).
- Funil do momento: designadas agora / em arranjo futuro / livres.

## E6 — Multicongregação (FUTURO, fora da rodada)

Branch separada. Exige `congregacao_id` em todas as tabelas + RLS por
congregação + onboarding de dados (quadras/endereços — trabalho de
planilha que o usuário fará antes). Registrado aqui só pra não perder.
