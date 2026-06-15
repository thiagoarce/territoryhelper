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
