# Manual de uso — Territory Helper

Esse guia mostra como usar o app no dia a dia. Não precisa saber programar.

> **Atalhos rápidos**
> - App: acesse pelo link que a congregação usa (funciona no navegador do
>   celular ou instalado como app — veja "Adicionar à tela inicial")
> - Bottom nav no modo campo: **Designações / Agenda / Prédios / Campanha**
>   (dirigente/admin também vê **Mapa**); Perfil fica no ícone do
>   cabeçalho
> - Menu no modo admin: **Geral / Designações / Polígonos / Prédios /
>   Arranjos / Testemunho público / Campanha / Usuários / Auditoria**
> - Sem internet? O app continua funcionando pros fluxos mais comuns —
>   salva localmente e sincroniza quando a conexão voltar

---

## Papéis

- **Publicador** — trabalha o território que foi designado pra ele
  (quadras, prédios/cartas, TCE). Vê só o que é dele.
- **Dirigente** — além de publicador, coordena saídas em grupo (arranjos):
  repartir o território entre os participantes, marcar quadra concluída,
  assumir arranjo de outro dirigente.
- **Admin** — acesso total: cadastro de quadras/territórios, designações,
  campanha, testemunho público, usuários.

O mesmo login pode ter qualquer um desses papéis — a interface se adapta
automaticamente ao que a pessoa pode fazer.

---

# Modo administração

## Visão Geral (`/admin`)

Mapa principal com todas as quadras da congregação.

- No topo: botão **Designações** (contador de designações abertas), cor do
  mapa (por status/território/densidade/idade da última conclusão), estilo
  do mapa e toggle de rótulos
- **Clica nas quadras** pra selecionar (multi-seleção). Quadra inativa ou
  já comprometida com um arranjo avisa antes de deixar continuar
- Contorno tracejado roxo = quadra reservada pra uma campanha futura
- **Pressiona e segura** numa quadra pra ver detalhes: território,
  endereços, última conclusão e histórico completo (com reverter)
- Com quadras selecionadas, a barra inferior mostra:
  - **Designar** — cria uma designação de território pessoal pra um
    publicador (com prazo)
  - **Anexar a arranjo** — leva pra uma saída em grupo já agendada
  - **Concluir** — marca como feita numa data (default hoje)
  - **Reverter** — desfaz a última conclusão
  - **Limpar histórico** — apaga tudo o histórico de conclusões (pede
    confirmação)

## Polígonos (`/admin/poligonos`)

Editor único do desenho do território, com modos alternáveis no topo:

- **Vincular** — pontos de endereço (azuis = residencial, laranjas =
  comercial) mais filtros de tipo e vínculo; clica nos pontos e depois na
  quadra que vai recebê-los
- **Quadras** — renomear, trocar território, ativar/inativar, desenhar ou
  editar o formato da quadra no mapa, juntar duas quadras numa só, dividir
  uma quadra em duas, ou excluir
- **Territórios** — criar/editar/agrupar quadras/excluir (excluir um
  território não apaga as quadras, só tira o vínculo)
- **TCE** — seleciona pontos comerciais em sequência → o app desenha o
  contorno automaticamente (convex hull) → confirma nome/publicador/prazo
- **Auditar** — mostra clusters de endereços por face do IBGE, quadras
  vazias e territórios órfãos, pra limpar inconsistências

Quadra **inativa** = parque/área verde/sem trabalho real. Não entra na
contagem de campanha nem aparece designável.

## Prédios (`/admin/predios`)

Lista de todos os prédios (2+ endereços no mesmo logradouro/número viram
prédio automaticamente).

- Busca por logradouro/nome + filtros (com irmão morando, cartas
  pendentes, "não é prédio")
- **📍 Proximidade GPS** ordena a lista pela distância até você
- Toque num card abre edição inline (nome, portaria, irmão que mora ali,
  notas) ou o botão **▶ Trabalhar** manda pra `/predio/[id]`
- **⏳ Validar pendente** — prédios criados pelo publicador em campo
  esperam essa validação do admin antes de entrar na listagem normal
- **🎯 Designar cartas** — seleciona vários prédios e designa pra um
  publicador de uma vez
- Botão de WhatsApp compartilha o link público de cartas daquele prédio

## Designações (`/admin/designacoes`)

Hub central — tudo que está designado (pessoal, cartas, arranjos e TCEs)
num só lugar, com filtros por tipo e status.

- **Concluir / Reabrir / Cancelar / Excluir** cada designação
- **Link** gera um link público (`/t/<token>`) com mapa, pra compartilhar
  no WhatsApp com quem não tem o app
- Nos cards de arranjo: **Realocar** move quadras que não foram
  terminadas pra outro arranjo (as demais continuam onde estão); **Limpar**
  esvazia o território do arranjo sem apagar o evento da agenda

**Trava automática:** uma quadra nunca fica em dois arranjos com data
futura ao mesmo tempo. Se tentar designar/anexar/realocar uma quadra já
comprometida, o app bloqueia e mostra onde ela está.

## Arranjos (`/admin/arranjos`)

Saídas de campo agendadas (com dirigente).

- **Modalidades** — categorias com nome/cor (Casa em casa, Comercial,
  Cartas, Testemunho público...) — só definem a aparência, não travam
  quais tipos de território o arranjo pode ter
- Agenda em semana/mês/3 meses/ano
- Cada arranjo pode ter **qualquer combinação**: quadras + prédios (cartas)
  + TCE + ponto de encontro, tudo junto
- Recorrência gera N ocorrências pontuais, editáveis individualmente
- Anexo de arquivo (ex: convite em PDF pra distribuir)

## Testemunho público (`/admin/tp`)

Pontos fixos (carrinhos) e a grade semanal de turnos.

1. **+ Ponto** — nome, endereço, notas (onde pegar o carrinho/chave) e
   localização (botão "Usar minha localização" pega o GPS)
2. Dentro do ponto, **+ Turno** — dia da semana, hora de início/fim,
   quantidade de vagas
3. A lista mostra quem já está escalado na semana e marca em **vermelho**
   quando falta gente (vagas maior que inscritos)

## Campanha (`/admin/campanha`)

- **+ Período** — nome, datas de início/alvo, meta semanal, publicação
  principal (opcional)
- Card do período ativo mostra progresso (quadras concluídas / tempo
  decorrido) e o **Ritmo**: quadras/dia atual vs. necessário pra bater a
  meta, com selo verde (adequado), âmbar (atenção) ou vermelho (risco) e
  projeção de quando terminaria no ritmo atual
- **Mapa do período** com dois modos: "Só a campanha" (verde forte = feito
  durante o período, ignora histórico anterior) ou "Histórico completo"
- **Suprimento** — catálogo de publicações (Catálogo) + checklist de
  quantidade necessária/em mãos/pedido feito por publicação, com aviso
  vermelho se faltar e a campanha começar em menos de 30 dias
- **Objetivos** — por modalidade, tipo Geral ou Semana, com título,
  descrição, link e opção de aparecer no painel público
- **Encerrar campanha ativa** manda pro histórico (nada é apagado);
  **Reativar** um período do histórico volta ele ao topo
- **Reservar quadras pra campanha** ("quarentena"): na Visão Geral,
  enquanto a campanha está planejada (ainda não começou), seleciona
  quadras no mapa → botão roxo **Reservar** → ficam bloqueadas pra
  designação até a campanha começar (aviso visual, contorno tracejado
  roxo). Depois que a campanha inicia, vira só um lembrete visual —
  aparecem como chips prontos pra anexar num arranjo

## Usuários (`/admin/usuarios`)

- **Lista** — busca, papel, status ativo/inativo; editar troca nome/papel,
  desativa (bloqueia login) ou exclui
- **+1 usuário** — cria conta direto com nome/email/senha/papel
- **Convite** — gera link único (copiado automaticamente) pro próprio
  usuário definir a senha; lista convites com status e opção de revogar
- **Em lote** — cola um CSV (email,senha,nome,role) pra importar vários
  de uma vez, com relatório linha a linha

## Auditoria (`/admin/auditoria`)

Últimas 100 alterações no sistema: quem fez, o quê (criação/atualização/
exclusão), em qual registro e quando. Filtro por tabela. Clica numa linha
pra ver os dados antes/depois da mudança.

---

# Modo campo (publicador e dirigente)

## Home / carteira (`/publicador`)

- Card destacado se houver campanha ativa ou planejada
- Card **"Você dirige"** — arranjos que você coordena, com link
  **Repartir território →**
- Card amarelo **"Pregação em grupo — sua parte"** — sua fatia de um
  arranjo que outro dirigente repartiu com você
- Card de **turnos de testemunho público** nos próximos 7 dias
- Carteira dividida em **Território pessoal** / **✉ Cartas designadas** +
  lista de TCEs abertos
- Botão **Compartilhar** em cada card gera um link público com mapa
  (`/t/<token>`) pra mandar no WhatsApp

## Mapa estratégico (`/publicador/mapa`)

Só dirigente/admin. Mapa "map-driven":

- Clica numa quadra concluída pra marcar/desmarcar
- **Estacionar perto** — mostra marcadores de estacionamento no mapa + rota
  pro Google Maps
- **📸 Exportar PNG** — gera imagem do mapa pra compartilhar
- **✂ Criar parte** — seleciona um arranjo que você dirige + um subconjunto
  de quadras/prédios pra repartir com um ou dois publicadores (dupla/trio
  compartilham a mesma parte)

## Arranjo (`/publicador/arranjo`)

Agenda da semana com as saídas marcadas, incluindo turnos de testemunho
público (ícone de megafone).

- **Quero participar** — qualquer publicador sinaliza interesse numa saída
  futura sem virar parte automaticamente; o dirigente vê a lista de
  interessados (aparecem primeiro na hora de repartir, com selo)
- **Me inscrever / Sair do turno** — pros turnos de testemunho público, por
  data concreta (dá pra faltar uma semana sem sair da escala fixa)
- Se você dirige o arranjo: **✂ Repartir território** (sheet com o
  território completo em chips selecionáveis + escolha de publicador(es);
  alerta se um item já está em outra parte) e lista das partes já criadas
  (com excluir)
- Se é arranjo de outro dirigente: **👋 Assumir dirigência**
- **Link público (WhatsApp c/ mapa)** pra compartilhar com quem não tem
  o app

## Prédios (`/publicador/predios`)

- Busca + **📍 GPS** (ordena por proximidade) + filtros
- **Criar prédio pendente** — cadastra um prédio novo em campo; fica
  esperando validação do admin
- Se dirigente: checkbox de multi-seleção + **🎯 Designar cartas**

## Campanha (`/publicador/campanha`)

Objetivos da campanha atual + gráfico de progresso, versão simplificada
da tela do admin.

## TCE — Território Comercial Especial (`/publicador/tce/[id]`)

- Lista os endereços comerciais, com contador de trabalhados
- Por endereço: não atendeu / sem palestra / conversou + carta entregue
  (toggle)
- **Concluir TCE** no rodapé (com confirmação) marca como finalizado

## Trabalhar uma quadra (`/publicador/quadra/[id]`)

Tela de casa em casa.

- Mapa com pinos numerados, correlacionados com a lista abaixo
- Botão **Simples/Avançado** alterna pra botões grandes sem mapa (mais
  fácil de usar andando na rua)
- Filtros: Todos / Pendentes / Feitos
- Prédios aparecem agrupados (clique expande/recolhe); casas direto na
  lista
- Por endereço: não atendeu / sem palestra / conversou / carta entregue
  + ícone de lápis pra editar o local
- Botão flutuante **+** adiciona endereço novo
- Se dirigente/admin: botão extra pra marcar a quadra inteira como
  concluída (com data) ou desfazer
- Atualiza em tempo real se outro publicador mexer na mesma quadra

## Trabalhar um prédio (`/predio/[id]`)

Tela única, tanto pro admin quanto pro campo.

- Toggle **🚪 Casa em casa** vs **✉ Cartas** muda os botões disponíveis
  por apartamento
- Duas barras de progresso (visitados / cartas entregues)
- ✏ **Editar** (nome, portaria, caixas/interfones, irmão mora aqui, notas)
  e 📤 **WhatsApp** (gera link público de cartas)
- Arraste o dedo (swipe) pra navegar entre apartamentos; ao marcar um
  resultado, pula sozinho pro próximo pendente
- Funciona **offline**: se a rede cair, salva localmente ("salvo offline")
  e sincroniza sozinho quando a conexão voltar

---

# Links públicos (sem precisar de login)

## Cartas de um prédio (`/cartas/[token]`)

Cabeçalho com endereço, tipo de acesso (interfone/portaria/caixas) e se
um irmão mora ali. Cada apartamento tem 3 botões: carta entregue,
desocupado, não escrever. Qualquer pessoa com o link marca, sem precisar
entrar no app.

## Território ou arranjo (`/t/[token]`)

Mapa somente-leitura do território/arranjo, com data/hora (se for saída
de campo), prazo e lista de quadras/prédios. Botões **Compartilhar com
imagem** (gera PNG do mapa e abre o WhatsApp) e **Só o link**. Pra
efetivamente trabalhar o território é preciso entrar no app.

## Aceitar convite (`/convite/[token]`)

Saudação com o nome, email pré-preenchido, campo pra criar senha (mín. 6
caracteres) e botão **Criar conta**.

---

## Dúvidas comuns

### "O app não está mostrando o mapa"
Recarregue a página. Se persistir, verifique a conexão — o app avisa
quando está offline.

### "Trabalhei sem internet, os dados sumiram?"
Não. O app salva localmente e reenvia sozinho quando a conexão voltar
(aviso "salvo offline" aparece na hora). Não feche o navegador antes de
ver a confirmação de que sincronizou.

### "Apaguei uma conclusão sem querer"
Toque na quadra (long-press na Visão Geral, ou histórico na tela da
quadra) → botão **Reverter/Desfazer** restaura a conclusão anterior.

### "Uma quadra não deixa eu designar"
Ela já está comprometida com outro arranjo com data futura, ou está
reservada pra uma campanha. O aviso mostra em qual arranjo/campanha ela
está.

---

## Ajuda

Se achou um bug ou tem ideia de melhoria, anota e fala com quem mantém o
app. Pra detalhes técnicos, ver:

- [`CLAUDE.md`](../CLAUDE.md) — visão técnica completa (rotas, modelo de
  dados, convenções)
- [`README.md`](../README.md) — visão geral do projeto
