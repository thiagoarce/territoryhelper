# Manual de uso — Servo de Território

Esse guia mostra como usar o app no dia a dia. Não precisa saber programar.

> **Atalhos rápidos**
> - Web app: abra o link `/exec` que você usa normalmente
> - Aba inferior: navega entre **Geral / Polígonos / Registro / Prédios / Campanha**
> - Erro? → **Atualizar** (botão amarelo no topo) força recarregar

---

## Visão Geral (mapa principal)

A primeira tela. Mostra todas as quadras e territórios.

### Compartilhar quadras (designar)

1. **Clica nas quadras** que quer mandar — ficam azuis selecionadas
2. Aparece uma barra no topo: "X quadra(s) selecionada(s)"
3. **Publicador** → gera link `?v=publico` (vê só os endereços)
   **Dirigente** → gera link `?v=dirigente` (pode marcar como feita)
4. No modal que abre, opcionalmente preencha:
   - **Nome do publicador** (cria designação "território pessoal")
   - **Prazo** (default 30 dias)
5. Copia, manda no WhatsApp ou usa o botão de email

> Se preencheu o nome, a quadra fica **travada com cadeado 🔒** no mapa. Outros dirigentes vendo o mapa sabem que está com alguém.

### Designações ativas

Botão **🔒 Designações** no topo. Lista quem está com o quê:
- **Vencidas** (prazo passou) ficam em vermelho no topo
- **Em andamento** em azul
- Botão X cancela a designação (libera as quadras)
- Quando o dirigente marca uma quadra como concluída, a designação se ajusta sozinha (remove a quadra da lista; fecha quando todas viram concluído)

---

## Polígonos (Editor)

Tela pra **criar/editar quadras e territórios**, e **vincular endereços** às quadras.

### Vincular endereços às quadras

1. **Pontos azuis** = domicílios. **Laranjas** = comerciais.
2. Use os filtros no topo:
   - **Tipo**: Dom / Com
   - **Vínculo**: Vinculados / Sem quadra
3. Pra trabalhar nos órfãos: deixa só **Sem quadra** ligado
4. **Clique nos pontos** pra selecionar (até várias faces). Ficam destacados
5. **Clique na quadra** que vai receber → confirma → vinculados!

### Renomear quadras de um território (interativo)

Quando você quer renomear `Q-15, Q-23, Q-41, ...` pra `1A, 1B, 1C` numa ordem específica:

1. Botão **🔤 Renomear** (no topo da aba Polígonos)
2. Escolhe o **território** + digita o **prefixo** (ex: `1`)
3. Quadras desse território ficam **laranjas** no mapa
4. **Clica nelas na ordem desejada**: primeira → 1A, segunda → 1B, etc.
5. Quadra escolhida vira verde com o novo nome no rótulo
6. Toca de novo = remove (e renumera as posteriores)
7. **Confirmar** só fica disponível quando TODAS estão atribuídas
8. **Resetar** zera as escolhas; **Cancelar** desfaz tudo

Atualiza em cascata: endereços, territórios, designações e histórico de registros — tudo aponta pro novo nome automaticamente.

### Editar uma quadra individualmente

Clica na quadra → modal abre → edita ID, território, cor ou polígono.
**Mudar o ID aqui também atualiza em cascata** em todas as outras abas. Se o novo ID já existe em outra quadra, dá erro.

---

## Registro (marcar como feita)

Tela pra marcar quadras como concluídas.

1. **Clica nas quadras** que foram trabalhadas → ficam vermelhas selecionadas
2. **Concluir** → escolhe a data (default hoje) → confirma

### Desfazer uma conclusão

Clica numa quadra concluída → o cartão dela aparece com botão **Desfazer**. Restaura a data anterior do histórico (não força "Pendente" se já tinha conclusão antes).

### Quadras com designação ativa

Aparecem com 🔒 no centro. Se você tenta marcar uma como concluída, aparece **aviso** ("Quadra X está designada para João até 15/07. Continuar?"). Confirma se quiser mesmo.

---

## Prédios (Trabalho de cartas)

Quinta aba — gestão dos prédios pra escrever e entregar cartas.

### Como funciona

O app detecta prédios **automaticamente**: quando há ≥2 endereços com o mesmo logradouro+número, cria um "prédio".

### Editar um prédio

Toca no card → modal abre:
- **Nome do edifício** (editável — placeholder mostra o detectado)
- **Irmão mora aqui** (switch) + **nome do irmão** (referência)
- **Acesso ao prédio**:
  - "Interfone p/ apto" → podemos chamar cada apartamento
  - "Portaria eletrônica" → sem acesso direto, mandar por correio
  - "Não informado" → default
- **Não é prédio** → tira da listagem padrão (filtro mostra de volta)
- **Notas** livres

### Compartilhar UM prédio

Cada card tem botão **WhatsApp verde**. Gera link `?v=cartas&p=CHAVE_PREDIO` específico daquele prédio. Os irmãos abrem e veem os apartamentos.

### Filtros da lista

- Busca por logradouro / nome
- **Só com irmão** — pra focar em quem pode receber cartas pelos irmãos
- **Mostrar "não é prédio"** — pra revisar/desfazer marcações

---

## Campanha

### Configurar

Botão **Editar** no topo da aba Campanha.

- **Campanha ativa** (switch verde) — quando OFF, painel público mostra "Sem campanha ativa"
- **Nome**, **datas de início e alvo**, **meta semanal**
- Os textões "Objetivo" e "Estratégia" do app antigo viraram **Objetivos estruturados** (próximo bloco)

### Objetivos por modalidade

Cada objetivo tem:
- **Tipo**: Geral (visão de campanha) ou Semana (foco atual)
- **Modalidade**: Casa em casa, Comercial, Rural, Cartas, Telefone, Testemunho Público
- **Título**, descrição, link (Drive/Sheets), upload de arquivo
- **Mostrar no painel público** (switch — default ligado)

Pra criar: aba Campanha → "Objetivos" → **Adicionar**.

No painel público, objetivos da Semana ficam **grandes e destacados**; os gerais ficam numa lista enxuta abaixo.

### Compartilhar campanha pelo WhatsApp

Botão **Compartilhar** (verde, no topo da aba). Gera uma **imagem PNG** com:
- Nome da campanha + período
- **Faltam X dias** (vermelho se ≤7 dias)
- % de cobertura com barra
- Objetivos da semana em cards verdes
- Link "Acompanhe mais detalhes"

Envia pelo share nativo do celular. No desktop, baixa o PNG.

---

## Dirigente (quando você recebe um link)

Se outro irmão te mandar um link `?v=dirigente&ids=...`:

1. Você vê **só as quadras que ele te designou** + contexto do território em volta
2. Pode marcar como Concluída pelo botão (com data)
3. Pode **Desfazer** uma conclusão (volta a data anterior)
4. **Enviar pro Publicador** → gera link `?v=publico` filho. Card de Território Pessoal também disponível aqui
5. **Exportar mapa** → cria PNG no estilo do cartão impresso, com:
   - Localidade (Manaíra, João Pessoa — detectada automaticamente)
   - Nº dos territórios
   - Legenda de cores (azul = designada, verde = concluída, cinza = disponível)
   - Compartilha via WhatsApp com a imagem + texto pronto

---

## Publicador (quando você abre um link de quadras)

Vai abrir `?v=publico&ids=...`:

1. **Topo**: indicador de cobertura "X de Y endereços alcançados" com barra de %
2. **Mapa** mostrando as quadras designadas em azul + vizinhança cinza
3. **Lista por quadra** com cada endereço

### Marcar progresso em cada endereço

Pra cada endereço, **3 botões mutex**:
- 🚪 **cinza** — Chamei mas não atendeu
- 📞 **amarelo** — Atendeu mas não quis conversar
- ✓ **verde** — Conversou

E **independente**:
- ✉ **laranja** — Deixei carta

A diferença entre "vazio" (não tentei ainda) e "🚪 cinza" (chamei sem resposta) é importante — ajuda a saber se o território foi realmente coberto.

### Rota dentro da quadra

Botão de rotação ao lado de "Limpar". Reordena os endereços seguindo o **sentido horário** em volta da quadra. Toca de novo → **sentido anti-horário**.

### Memória do território

Em cada endereço, badge pequeno mostra a **última atividade** (de qualquer publicador anterior). Tipo "🕐 🚪 14/05" significa: alguém chamou aqui em 14/05 e não atenderam. Ajuda você a chegar informado.

---

## Trabalho de cartas (link público)

Se você receber link `?v=cartas&p=XYZ`:

1. **Header verde** com nome do prédio
2. Se **"Portaria eletrônica"**, aparece aviso amarelo: "Cartas só pelo correio"
3. Lista dos apartamentos. Cada um tem 4 botões:
   - 🔵 **Escrita** (azul) — carta pronta pra entregar
   - 🟢 **Entregue** (verde) — carta deixada no apto
   - ⚪ **Desocupado** (cinza) — sem morador
   - 🔴 **Não escrever** (vermelho) — pular esse apto (cards ficam com borda vermelha)
4. Resumo no topo: quantas escritas / entregues / ativos
5. Badge "antes" em cada apto se houve atividade prévia

Quem recebe não precisa de login — só clica no link e marca conforme trabalha.

---

## Dúvidas comuns

### "O mapa não está aparecendo"
Toque em **Atualizar** (botão amarelo no topo).

### "Renomei uma quadra e os endereços sumiram"
Isso era um bug antigo, já corrigido. Hoje a renomeação atualiza em cascata todos os endereços, designações e histórico.

### "Apaguei sem querer"
- Para conclusões: existe o botão **Desfazer** que restaura a data anterior
- Para outras coisas: o Google Sheets tem histórico de versões (Arquivo → Histórico de versões) — pode reverter por lá

### "Quero ver as URLs todas que eu posso usar"
- `/exec` — app principal (gestão)
- `/exec?v=publico&ids=Q-1,Q-2` — painel do publicador com quadras designadas
- `/exec?v=dirigente&ids=Q-1,Q-2` — painel do dirigente
- `/exec?v=campanha` — painel motivacional da campanha
- `/exec?v=cartas` — lista geral de prédios (trabalho de cartas)
- `/exec?v=cartas&p=CHAVE_PREDIO` — apartamentos de um prédio específico

### "Compartilhei o link, mas a pessoa vê uma versão antiga"
Quando você gerar uma versão nova do código, o link `/exec` continua o mesmo SE você editar o deployment existente em "Manage deployments → New version". Se criou um "New deployment", a URL muda. Veja `docs/clasp-setup.md` (técnico).

---

## Ajuda

Se achou um bug ou tem ideia de melhoria, anota e fala com quem mantém o app. Pra resolver problemas técnicos, ver:

- [`CLAUDE.md`](../CLAUDE.md) — visão técnica completa
- [`docs/clasp-setup.md`](clasp-setup.md) — como funciona o deploy automático
- [`README.md`](../README.md) — visão geral do projeto

---

# Adendos

## Quadras "Inativas" (área verde/parque)

No editor (aba Polígonos → clica numa quadra), o modal agora tem o campo **Estado da quadra**: **Ativa / Inativa**.

- **Inativa** = parques, áreas verdes, quadras sem trabalho real
- Quadras inativas **não entram na contagem** da campanha, não aparecem no ranking, e o publicador NÃO vê endereços delas mesmo se for incluída no link
- No mapa ficam em **cinza claro neutro** sem rótulo nem interação
- Voltar a Ativa = mesmo lugar, troca o radio

## Designações ativas (Território Pessoal)

Botão **🔒 Designações** no topo da Visão Geral mostra todas. Badge vermelho = vencidas.

Cada card abre menu rápido:
- **Concluir todas** — marca as quadras do publicador como concluídas hoje
- **+30 dias** — estende prazo
- **Ver no mapa** — fitBounds nas quadras
- **X** — cancela designação (libera as quadras)

Avisos no header da Visão Geral: alerta amarelo se houver vencidas.

## Território Comercial Especial (TCE)

Aba Polígonos → botão **🏪 TCE** (amarelo).

1. Modo ativa, filtra mapa pra mostrar só pontos comerciais
2. Clica nos pontos comerciais na ordem que quiser
3. Botão "Continuar" abre modal pedindo nome, publicador, prazo
4. Polígono auto via convex hull dos pontos

Lista geral em **🏪 TCEs** (header da Visão Geral). Switch "Concluídos" mostra histórico.

Cada TCE concluído tem:
- **Reabrir** (se foi por engano) — volta o mesmo TCE ao status ativo
- **Reutilizar** — cria NOVO TCE com mesmos endereços, pra novo ciclo. Preserva o antigo como histórico

Endereço em TCE aberto fica **esmaecido com aviso amarelo** no painel residencial: "🏪 Em território comercial (Fulano), mas pregue se tiver uma boa oportunidade." Publicador residencial decide se aborda.

Link público específico do TCE: `?v=cartas&p=` (✗ errado) — `?v=publico&te=ID` (✓ correto).

## Cobertura visual no publicador (Pacote F)

Em cada endereço, 3 botões mutex grandes (44×44):
- 🚪 **cinza** — chamei, não atendeu
- 📞 **amarelo** — atendeu, sem palestra
- ✓ **verde** — conversou

Plus 1 independente:
- ✉ **laranja** — carta entregue

No topo: card mostra "X de Y endereços alcançados" com breakdown. Sem vermelho — não culpabiliza.

Endereço com atividade prévia (de outro publicador) tem badge "antes" com ícone e data. **Memória do território** — chega informado.

## Conclusão e desfazer

Aba Registro → marca como concluída.

Pra desfazer (admin) → toca na quadra concluída → botão **Desfazer**. Restaura a data anterior do histórico (não força Pendente se já tinha conclusão antes).

## Renomear quadras em massa (interativo)

Aba Polígonos → botão **🔤 Renomear**.

1. Escolhe território + prefixo (ex: "1")
2. Quadras do território ficam laranjas no mapa
3. Clica nelas na ordem desejada → vão recebendo 1A, 1B, 1C…
4. Tooltip muda em tempo real
5. Confirmar só habilita quando todas estão atribuídas
6. Atualiza em cascata: Quadras, Dados Brutos, Territórios, Designações, Registros

---

# Funcionalidades novas — Designações, Campanhas v2, Testemunho Público, Publicações

## Realocar quadras de um arranjo que não terminou tudo

Onde: **Designações** (`/admin/designacoes`), card de qualquer arranjo com quadras.

1. No card do arranjo, botão **Realocar** (ícone de duas setas)
2. Marca as quadras que NÃO foram terminadas (viram azuis)
3. Escolhe o arranjo de destino no select
4. Confirma — as quadras marcadas saem do arranjo de origem e entram no
   destino. As demais continuam onde estavam. Nenhum dos dois eventos é
   apagado.

Também dá pra:
- **Limpar** — esvazia todo o território do arranjo (quadras + prédios +
  TCE) sem apagar o evento (data/dirigente continuam na agenda)
- **Apagar** — remove uma designação pessoal ou de cartas por completo

**Trava automática:** uma quadra nunca pode estar em dois arranjos com
data futura ao mesmo tempo (ou sem data). Se você tentar designar,
anexar ou realocar uma quadra que já está comprometida, o app bloqueia
e mostra em qual arranjo ela está.

## Reserva de quadras pra campanha ("quarentena")

Objetivo: descansar o território antes da campanha começar.

Onde: **Visão Geral** (`/admin`), quando existe uma campanha **planejada**
(criada mas ainda não iniciada).

1. Seleciona as quadras no mapa (clique múltiplo)
2. Na barra inferior, botão roxo **Reservar p/ [nome da campanha]**
3. As quadras reservadas ganham um contorno tracejado roxo no mapa
4. Enquanto a campanha não começa, essas quadras ficam bloqueadas pra
   designação/arranjo (como uma trava normal)
5. No dia que a campanha começa, a reserva para de bloquear sozinha —
   vira só um lembrete visual de quais quadras são "da campanha"
6. Botão **Liberar reserva** desfaz a qualquer momento

Ao criar um arranjo **durante** a campanha (`/admin/arranjos`), as
quadras reservadas aparecem como chips clicáveis acima do campo de
quadras — um toque adiciona ao território do arranjo.

## Termômetro de ritmo + mapa "Só a campanha"

Onde: **Campanha** (`/admin/campanha`), com uma campanha ativa e meta
semanal definida.

- Card **Ritmo**: mostra quantas quadras faltam, quantos dias restam, o
  ritmo atual (quadras/dia) e o ritmo necessário pra bater a meta. Selo
  verde (**Ritmo adequado**), âmbar (**Atenção**) ou vermelho (**Risco
  de não concluir**) + uma projeção de quando a campanha terminaria no
  ritmo atual.
- Mapa do período tem dois botões: **Só a campanha** (verde forte =
  concluída durante a campanha, cinza = resto — não mistura com
  histórico antigo) e **Histórico completo** (coloração normal por
  recência, mostra conclusões de antes da campanha também).

## Campanha planejada + inscrição antecipada em arranjo

- Quando existe uma campanha planejada (ainda não começou), o **home do
  campo** mostra um card roxo "Faltam N dias — [nome]" que leva direto
  pra Agenda já filtrada nos próximos 3 meses.
- Em qualquer arranjo (Agenda do campo), botão **Quero participar** —
  qualquer publicador sinaliza interesse numa saída futura sem que isso
  crie uma parte automaticamente. O dirigente vê a lista de
  interessados no card.
- No sheet **Repartir**, os publicadores que sinalizaram interesse
  aparecem primeiro na lista, com um selo "interessado".

## Testemunho público (carrinhos)

### Cadastrar pontos e turnos (admin)

Onde: **Testemunho público** (`/admin/tp`, novo item no menu Administrar).

1. Botão **+ Ponto** — nome, endereço, notas (onde pega o carrinho,
   chave, etc.) e localização (botão "Usar minha localização" pega o
   GPS do celular)
2. Dentro do ponto, botão **+ Turno** — dia da semana, horário de
   início/fim, quantidade de vagas
3. A lista mostra quem já está escalado na semana corrente pra cada
   turno, e marca em vermelho quando falta gente (vagas > inscritos)

### Se inscrever num turno (campo)

Onde: aba **Agenda** (antiga "Arranjo"), os turnos de TP aparecem
intercalados com os arranjos normais, com uma faixa/ícone de megafone.

1. Encontra o turno no dia desejado
2. Botão **Me inscrever** (se tiver vaga) ou **Sair do turno** (se já
   estiver inscrito)
3. A home do campo mostra um card teal "Seus turnos de TP (próximos 7
   dias)" com atalho rápido pra Agenda

A inscrição é por **data concreta**, não por turno genérico — dá pra
faltar uma semana sem sair da escala fixa, e fica histórico real de
quem trabalhou quando.

## Publicações e suprimento de campanha

Onde: **Campanha** (`/admin/campanha`), seção **Suprimento**.

1. Botão **Catálogo** — cadastra as publicações usadas (nome + código
   opcional), independente de campanha
2. Botão **Adicionar** — escolhe uma publicação do catálogo e define a
   quantidade necessária pra campanha atual
3. Cada linha tem os campos **Necessária**, **Em mãos** e o checkbox
   **Pedido feito** — edita direto na tela, sem precisar salvar botão
   separado
4. Um campo de notas em texto livre (ex: "20 convites por publicador")
5. Se faltar quantidade e a campanha começar em menos de 30 dias, a
   linha fica com borda vermelha de alerta

No form de período da campanha (**+ Período** / editar), dá pra
escolher uma **publicação principal** — quando a campanha está em
andamento, a nota de suprimento dessa publicação aparece no card da
campanha na home do campo (aviso de "levar X" pros publicadores).

## Migrations dessa leva (rodar em `/admin/dev/sql`, em ordem)

- `034_reserva_campanha.sql` — reserva de quadras
- `035_arranjo_interessados.sql` — inscrição antecipada em arranjo
- `036_testemunho_publico.sql` — pontos/turnos/escala de TP
- `037_publicacoes.sql` — catálogo de publicações + suprimento
