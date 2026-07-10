# Changelog

Mudanças relevantes do app. O app antigo em Google Apps Script (Jan–Jun
2026) foi **arquivado** na tag/branch `v1-google-apps-script` — este
changelog cobre a reescrita como PWA (SvelteKit + Supabase).

## 2026-07 — v2.1: exportáveis (cartão S-12, relatório S-13, dashboard, mapa offline)

Rodada Exportáveis (E1–E5; specs em `docs/specs-exportaveis.md`).

### Cartão de Mapa de Território (formato S-12)
- "Compartilhar com imagem" do link público agora gera o cartão no
  layout do formulário oficial: Localidade (pré-preenchida por
  geocodificação, editável), Terr. N.º, mapa com TODAS as quadras dos
  territórios afetados — designadas em destaque, feitas há pouco com ✕
  vermelho (limiar 3/6/12 meses), demais em cinza — e o rodapé clássico
- Fundo do mapa selecionável (cinza/colorido/brilhante)
- Requer a migration 078 aplicada

### Relatório S-13 por ano de serviço
- Nova tela Sistema → Relatório S-13: réplica imprimível do S-13-T
  (Imprimir/Salvar PDF pelo navegador), com os ciclos de cada território
  calculados do histórico (abre na primeira quadra designada, fecha
  quando a última é concluída) e ano de serviço set→ago

### Dashboard
- Nova tela Administrar → Dashboard: cobertura de 12 meses, ciclo médio
  entre conclusões, quadras há mais tempo sem trabalhar, conclusões por
  mês e o funil designadas × arranjo futuro × livres

### Correções e mapa offline
- TCE recém-criado não polui mais o hub de designações — só aparece
  quando designado a alguém ou anexado a arranjo
- Auditoria: índice novo no banco (migration 077) + detalhe sob demanda
  — o 500 era timeout do Postgres ordenando a tabela inteira
- Splash de abertura + watchdog contra tela branca no boot
- **Mapa de fundo offline (fecha o W11)**: o admin publica um recorte
  PMTiles do município (guia em `scripts/gerar-mapa-offline.md`,
  migration 079) e o publicador baixa uma vez em Perfil → Offline;
  sem internet os mapas desenham as ruas desse arquivo — online nada
  muda

## 2026-07 — v2.0: modo offline completo + fim dos erros 1102 (tag `v2.0.0`)

Rodada Workers/Offline (W1–W12 + revisão final). Fecha a versão 2.0.

### Fim dos travamentos "Error 1102" (limite de CPU do Cloudflare free)
- Diagnóstico corrigido: o limite de ~10ms de CPU é **cumulativo por
  requisição** — a arquitetura foi refeita em cima disso
- Leituras pesadas saíram do servidor: as 11 telas principais (Geral,
  Polígonos e todas as de campo) agora carregam os dados direto no
  navegador (mesma segurança — RLS do Supabase decide o que cada um vê)
- Agregações que derrubavam o servidor viraram views SQL
  (`quadras_contagens`, `tces_com_quadras`)

### Modo offline completo do campo ("salão → rua → salão")
- Todas as telas de campo abrem sem sinal com a última cópia baixada;
  abrir a home com internet baixa tudo sozinho ("Baixar tudo agora"
  também disponível em Perfil → Offline)
- Todas as escritas de campo entram numa fila no aparelho e sobem
  sozinhas quando o sinal volta: desfechos, cartas, concluir quadra/TCE,
  reordenar, criar prédio pendente, relatório de TP, pedidos
- Fila revisável: item recusado pelo servidor **não some** — aviso
  vermelho + tela pra tentar de novo ou descartar item por item
- Fila por usuário: em aparelho compartilhado, o que A marcou nunca sobe
  na sessão de B
- Cada tela mostra "Atualizado às HH:MM" / "Offline — dados de HH:MM"
- Corrigido o erro do Safari/iPhone "Response served by service worker
  has redirections" ao reabrir o app sem sinal
- Online-only por decisão: link público, PNG/WhatsApp, foto, inscrição
  de TP (checa conflito de horário na hora), "Estacionar perto"

### Backup funcionando de verdade
- Snapshot e restauração reescritos: o navegador faz o trabalho pesado
  e o servidor só recebe lotes pequenos — testado com a base real
- Reset de rodada de testes preserva o registro de quadras feitas
  (`quadras_conclusoes` + data de conclusão)

### Revisão final (caça a bugs da rodada)
- **Corrigido (grave)**: ação salva offline podia ser reenviada pro
  endereço errado se a conexão voltasse com o app em outra tela — o
  dado de campo se perdia; agora a fila guarda o endereço completo
- **Corrigido**: queda de rede no meio do carregamento podia gravar uma
  tela vazia por cima da cópia offline boa (TP/agenda/campanha)
- Fila offline etiquetada por usuário + banner distingue "aguardando
  sinal" (âmbar) de "recusado, revise" (vermelho)
- Manual ganhou o capítulo "Trabalhar sem internet"

### Pendente pra próxima versão
- Mapa de fundo offline (PMTiles do município) — as telas funcionam sem
  ele, só o desenho do mapa fica vazio em área nunca vista com internet

## 2026-07 — Revisão ampla + Testemunho Público + Publicações

### Revisão de bugs, UI, ícones e documentação
- Corrigidos bugs de segurança (`pode_editar_local` com brecha em
  colegas de arranjo), falso-sucesso em escritas offline, guards
  faltando em rotas restritas
- Substituídos os últimos `alert()` residuais por `toast`
- Padronizados ícones ambíguos ou incorretos (ex: "hand" usado tanto
  pra "não atendeu" quanto pra "quero participar"; "trash" num botão
  não-destrutivo), rótulos inconsistentes ("Apagar" vs "Excluir")
- Adicionados indicadores de carregamento em ações assíncronas que não
  davam feedback nenhum (risco de duplo clique)
- `CLAUDE.md`, `docs/MANUAL.md` e este changelog atualizados pra
  refletir o estado real do app (antes descreviam a versão antiga)

### Testemunho público (carrinhos)
- Nova tela `/admin/tp`: pontos fixos + grade semanal de turnos
  (dia/hora/vagas), com indicador de "buraco" na escala
- Inscrição por publicador em `/publicador/arranjo`, por **data
  concreta** (não por turno genérico) — dá pra faltar uma semana sem
  sair da escala fixa
- Card na home do campo com os turnos dos próximos 7 dias

### Publicações e suprimento de campanha
- Catálogo de publicações (nome/código) independente de campanha
- Checklist de suprimento por campanha (necessária/em mãos/pedido
  feito/notas), com alerta se faltar quantidade perto do início
- Publicação principal do período aparece como aviso no card da
  campanha na home do campo

### Campanha v2
- **Reserva de quadras** ("quarentena") — descansa o território antes
  da campanha começar; quadras reservadas ficam bloqueadas pra
  designação até o início, depois viram só lembrete visual
- **Termômetro de ritmo** — quadras/dia atual vs. necessário pra bater
  a meta, com selo (adequado/atenção/risco) e projeção de término
- Mapa do período com toggle "Só a campanha" (ignora histórico antigo)
  vs. "Histórico completo"
- **Inscrição antecipada** ("Quero participar") em qualquer arranjo —
  sinaliza interesse sem criar parte automaticamente; aparece destacado
  pro dirigente na hora de repartir

### Offline-first
- Fila de escrita offline (IndexedDB): se a rede cair de verdade
  (não um erro do servidor), a marcação fica na fila e sincroniza
  sozinha quando a conexão voltar. Aplicado nos fluxos de maior
  frequência (registrar desfecho, toggle de cartas em `/predio/[id]`)

## 2026-06 (final do mês) — Limpeza do modelo de designações + ícones

### Grande limpeza do modelo de designações
Três mecanismos paralelos de eras diferentes (designação tipo "arranjo"
sem publicador, `distribuirQuadras` sem repartir, `delegacoes_temp`
efêmero) foram substituídos por um modelo único:

- **Designação** = território pessoal, sempre com publicador (quadras
  e/ou prédios de cartas)
- **Arranjo** = saída agendada com dirigente + território **misto
  livre** (quadras + prédios + TCE + ponto, qualquer combinação)
- **Parte** = repartição do dirigente dentro de um arranjo — subconjunto
  do território pra 1+ publicadores (dupla/trio compartilham a mesma
  parte); só existe dentro de um arranjo, com validade ligada à data dele
- **Link público `/t/<token>`** — compartilha o mapa de um arranjo ou
  designação por WhatsApp (com imagem PNG), sem precisar de login
- Hub `/admin/designacoes` reúne designações + arranjos + TCEs num
  único lugar, com **realocar quadras** não terminadas pra outro arranjo
  e trava automática contra quadra em dois arranjos futuros ao mesmo
  tempo

### Ícones
- Emojis literais substituídos por `lucide-svelte` em toda a UI geral
  (mantidos só em marcadores/ícones de mapa, onde ajudam a diferenciar
  visualmente à distância)

### Offline-first (base) + robustez
- Cache de leitura + fila de escrita offline (base da versão expandida
  em julho)
- Helper único e puro de "posse de quadra" (`$lib/server/posse.ts`)
  espelhando as cláusulas de RLS, com testes automatizados

## 2026-06-29/30 — Reestruturação em 5 abas + arranjos

- **Bottom nav em 5 abas** (Designações / Arranjo / Campanha / Perfil +
  Mapa pro dirigente/admin), mapa-cêntrico no modo campo
- **Arranjos** — saída em grupo coordenada por um dirigente, com
  modalidades (categorias de cor/nome) e agenda semana/mês/3m/ano com
  recorrência
- **Multi-publicador por designação** (dupla/trio na mesma designação)
- Portação completa das telas do app antigo pro novo modelo: Visão
  Geral, Polígonos (editor único com modos Vincular/Quadras/
  Territórios/TCE/Auditar), Registro (depois fundido em Visão Geral),
  Prédios (edição inline + WhatsApp), Campanha (período + mapa +
  gráfico)
- PWA completo (manifest + service worker + instalação), busca global,
  perfil, auditoria, sidebar

## 2026-06-24/25 — Scaffold da reescrita (SvelteKit + Supabase)

- Arquivamento do app antigo (Google Apps Script) na tag
  `v1-google-apps-script`
- Novo schema Postgres em 6 domínios, com PostGIS (`geometry(Polygon)`
  pras quadras, `Point` pros locais), RLS baseado em role + posse, e
  auditoria automática
- Script de migração dos CSVs (IBGE/GAS) pro Postgres
- Login por email/senha, roles (publicador/dirigente/admin), deploy em
  Cloudflare Workers

## Pré-junho 2026 — App antigo (Google Apps Script)

Versão anterior, hoje arquivada. Tinha 4 abas (Visão Geral, Editor,
Registro, Campanha), status binário Pendente/Concluído, links
`?v=publico`/`?v=dirigente` por query string e planilha Google Sheets
como banco de dados. Ver a tag `v1-google-apps-script` no git pro
código-fonte completo dessa versão.
