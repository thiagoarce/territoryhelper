# Specs: Campanhas v2 · Testemunho Público · Publicações

> ✅ **Status: IMPLEMENTADO.** Os três módulos abaixo (C1–C3, TP1–TP2, P1)
> foram construídos na ordem sugerida e estão em produção — migrations
> `034_reserva_campanha.sql` a `037_publicacoes.sql`, telas `/admin/tp`,
> `/admin/campanha` (suprimento + ritmo), `/publicador/arranjo` (turnos de
> TP + inscrição antecipada). Este documento fica como **registro de
> design** (o raciocínio por trás de cada decisão) — pra saber como o app
> se comporta HOJE, ver `CLAUDE.md` (modelo de dados + convenções) e
> `docs/MANUAL.md` (uso). O texto abaixo é mantido como foi escrito antes
> da implementação, sem alterar o que já foi decidido.

**Documento de construção para IA futura.** Escrito com contexto completo do
app (o spec original do Gemini, avaliado no fim deste doc, foi produzido sem
acesso ao código — várias suposições dele são corrigidas aqui).

**Leia antes de codar:** `CLAUDE.md` (convenções inegociáveis) e `specs.md`
(modelo de dados vigente). Regras que NÃO se repete aqui mas valem sempre:
Svelte 5 runes com deps lidas antes de early-return em `$effect`; `selectAll`
em tabela grande; datas `date` nunca via `new Date("yyyy-mm-dd")` (somar
`T12:00:00`); `BottomSheet` pra modais; componente `Icon` (lucide) — **zero
emoji**; toda action role-restrita checa `locals.profile?.role` no início
além da RLS; migrations numeradas em `supabase/migrations/` aplicadas via
`/admin/dev/sql`; build verde + commit direto em `main` a cada incremento
testável.

---

## Estado atual relevante (não recriar nada disso)

| Já existe | Onde |
|---|---|
| `campanhas` (períodos: nome, data_inicio, data_alvo, meta_semanal, `ativa` c/ unique parcial) | migration 016 |
| `campanha` (objetivos, `campanha_id` FK → campanhas) | 006 + 016; ligação passou a ser usada em 2026-07 |
| Ativar/encerrar campanha SEM deletar + histórico com % da meta (via `quadras_conclusoes`) | `/admin/campanha` |
| Card de campanha ativa no home do campo | `/publicador/+page.svelte` |
| Arranjo = saída agendada c/ dirigente + território misto (quadras/prédios/TCE/ponto) | `arranjos` + `/admin/arranjos` |
| `arranjo_partes` (dirigente reparte → dupla/trio) | migration 030 |
| Agenda de arranjos com filtro semana/mês/3m/ano no admin E no campo | `/admin/arranjos`, `/publicador/arranjo` |
| Link público `/t/<token>` com mapa + share WhatsApp c/ PNG | migration 030 + rota `t/[token]` |
| Modalidade `ponto_tp` em `arranjo_modalidades` (TP avulso já é representável como arranjo) | migration 025 |

---

## Módulo 1 — Campanhas v2

### 1.1 Status derivado (NÃO criar enum)
O Gemini propôs `Planejada | Em Andamento | Concluída` como campo. **Não
fazer**: o app já segue o princípio "status é derivado, não armazenado"
(mesma decisão das quadras). Derivar em helper client/server:

```ts
// $lib/campanhas.ts
type StatusCampanha = 'planejada' | 'em_andamento' | 'encerrada';
function statusCampanha(c: {ativa: boolean; data_inicio: string; data_alvo: string}): StatusCampanha {
  if (!c.ativa) return 'encerrada';
  const hoje = new Date().toISOString().substring(0, 10);
  return hoje < c.data_inicio ? 'planejada' : 'em_andamento';
}
```
`ativa=true` com início futuro = planejada. Encerrar = `ativa=false`
(action `desativarPeriodo`, já existe).

### 1.2 Reserva de territórios ("quarentena")
Objetivo: chegar na campanha com território descansado.

**Schema** (migration nova):
```sql
alter table quadras add column if not exists reservada_campanha_id
  bigint references campanhas(id) on delete set null;
create index if not exists quadras_reserva_idx on quadras(reservada_campanha_id)
  where reservada_campanha_id is not null;
```
Prédios/TCE: NÃO reservar no v1 (quadra cobre o caso real; evitar 3 junções).

**Comportamento:**
- Admin, na Visão Geral (`/admin`): multi-seleção já existe → novo botão
  "Reservar p/ campanha" (aparece se existir campanha `planejada`), grava
  `reservada_campanha_id`. Botão "Liberar reserva" no mesmo fluxo do
  "Liberar de arranjo" existente.
- Quadra reservada conta como ALOCADA fora da campanha: incluir em
  `quadrasAlocadas` no load de `/admin/+page.server.ts` e retornar 409 em
  `criarDesignacao`/`adicionarQuadrasAoArranjo` quando
  `reservada_campanha_id` aponta pra campanha cujo `data_inicio > hoje`
  (mesmo padrão do conflito de arranjo que já existe ali).
- A partir de `data_inicio`: reserva deixa de bloquear (checar data, não
  apagar o vínculo — ele vira o "filtro direcionado").
- Mapa da Visão Geral: quadras reservadas com padrão visual próprio
  (`MapaAdmin` — nova prop, mesma técnica do `destacarIds` do `AdminMapa`).
- Ao criar arranjo DURANTE a campanha: no form de `/admin/arranjos`, se há
  campanha em andamento, mostrar acima do campo de quadras os IDs
  reservados a ela como chips clicáveis de sugestão ("Reservadas pra
  campanha: Q-1, Q-2 — toque pra adicionar").

### 1.3 Termômetro de ritmo
Em `/admin/campanha`, junto do gráfico semanal que já existe. Tudo
computável no load atual (sem schema novo):

```
faltam       = meta_total − concluídas_no_período      (meta_total já é calculada no histórico; reusar helper)
dias_rest    = data_alvo − hoje
ritmo_atual  = concluídas / dias_decorridos            (por dia)
ritmo_nec    = faltam / dias_rest
```
UI: card com barra dupla + selo `Ritmo adequado` (verde,
ritmo_atual ≥ ritmo_nec), `Atenção` (âmbar, ≥ 70%), `Risco de não concluir`
(vermelho). Projeção textual: "No ritmo atual, término em ~DD/MM".

### 1.4 Mapa de calor da campanha
Já existe 80%: o load calcula `quadrasConcluidasNoPeriodo` e o mapa colore.
Completar: toggle "Só a campanha" que pinta VERDE forte concluídas no
período, CINZA todo o resto (ignorando histórico anterior — hoje a cor por
status vaza conclusões antigas). Implementar como `colorirPor` novo no
`MapaAdmin` (admin) — propriedade `concluida_na_campanha` boolean calculada
no JS e injetada nas features, igual ao bucket `recencia` do `AdminMapa`.

### 1.5 Publicador: banner de contagem regressiva + inscrição
- Home do campo: se campanha `planejada`, o card (que já existe pra ativa)
  ganha variante "Faltam N dias — [nome]" com link pra `/publicador/arranjo`
  já filtrado no período da campanha (query param `?periodo=...` — hoje o
  filtro é estado local; expor via searchParam é 5 linhas).
- **Inscrição antecipada em arranjo** (novo conceito, além do spec):
  ```sql
  alter table arranjos add column if not exists interessados uuid[] not null default '{}';
  ```
  Botão "Quero participar" no card do arranjo (campo) → action
  `toggleInteresse` (append/remove o próprio uid; validar
  `auth.uid()` = elemento alterado). Dirigente vê a lista de interessados no
  card e no sheet Repartir os interessados aparecem PRIMEIRO na lista de
  publicadores, com selo. Não cria parte automaticamente — inscrição é
  sinal, repartição continua decisão do dirigente.

### 1.6 Vínculo campanha ↔ publicação
Depende do Módulo 3. Adicionar `campanhas.publicacao_id` (FK) quando o
catálogo existir. Ao salvar campanha com publicação vinculada, criar o
item de suprimento (ver 3.2) — NÃO criar "módulo de lançamento" separado
como o Gemini sugeriu; é uma linha em `campanha_suprimentos`.

---

## Módulo 2 — Testemunho Público (carrinhos)

Distinção importante que o Gemini não fez: TP **avulso** já existe
(arranjo com modalidade ponto_tp). O que falta é TP **recorrente com
escala de turnos** — uma grade semanal fixa, não eventos pontuais.

### 2.1 Schema (migration nova)
```sql
create table tp_pontos (
  id bigserial primary key,
  nome text not null,                       -- "Praça Central", "Feira do bairro"
  endereco text,
  geo geometry(Point, 4326),
  notas text,                               -- onde pega o carrinho, chave etc.
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table tp_turnos (
  id bigserial primary key,
  ponto_id bigint not null references tp_pontos(id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  vagas int not null default 2,
  ativo boolean not null default true
);

-- Escala é POR DATA CONCRETA (não por turno abstrato): permite faltar
-- numa semana sem sair da grade e dá histórico real.
create table tp_escala (
  id bigserial primary key,
  turno_id bigint not null references tp_turnos(id) on delete cascade,
  data date not null,
  publicador_id uuid not null references profiles(id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (turno_id, data, publicador_id)
);
```
RLS: pontos/turnos leitura `authenticated`, escrita admin. `tp_escala`:
select `authenticated`; insert com `publicador_id = auth.uid()` (qualquer um
se inscreve) ou admin; delete próprio ou admin. Validar vagas na ACTION
(count < vagas), não em constraint (corrida aceitável nesse volume).

### 2.2 Telas
- **`/admin/tp`** (novo item no drawer, grupo Administrar): CRUD de pontos
  (mapa pra posicionar o pin — reusar o fluxo de geo do criar-prédio) +
  grade de turnos por ponto (tabela dia × horário, editar vagas).
- **`/publicador/tp`**: entra como 5º/6º item? NÃO — bottom nav já está no
  limite. Integrar na aba **Arranjo**, que vira "Agenda": os turnos de TP
  da janela do período selecionado aparecem intercalados com os arranjos,
  com visual próprio (borda/ícone `megaphone`). Card do turno: ponto,
  horário, `N/vagas` preenchidas com os nomes, botão "Me inscrever"/"Sair"
  (action `inscreverTurno`/`sairTurno`, gera as linhas de `tp_escala` da
  data concreta). Renomear label do bottom nav pra "Agenda".
- Home do campo: seção "Seus turnos de TP" (próximos 7 dias) com chips —
  mesmo padrão do card de partes.
- Admin vê a grade preenchida em `/admin/tp` (quem está em cada turno da
  semana corrente + buracos em vermelho).

### 2.3 O que NÃO fazer no v1
- Sem troca de turno entre publicadores (sai um, entra outro manualmente).
- Sem notificação push (não existe infra de push no app).
- Sem controle de publicações levadas por turno (fica pro Módulo 3 v2).

---

## Módulo 3 — Publicações (suprimento de campanha)

Escopo v1 deliberadamente pequeno: **checklist de suprimento por
campanha**, não um estoque geral da congregação.

### 3.1 Schema
```sql
create table publicacoes (
  id bigserial primary key,
  nome text not null,               -- "Convite da Celebração", "Tratado X"
  codigo text,                      -- código JW se houver
  ativo boolean not null default true
);

create table campanha_suprimentos (
  id bigserial primary key,
  campanha_id bigint not null references campanhas(id) on delete cascade,
  publicacao_id bigint not null references publicacoes(id) on delete restrict,
  qtd_necessaria int not null default 0,
  qtd_em_maos int not null default 0,
  pedido_feito boolean not null default false,
  notas text
);
```
RLS: leitura `authenticated`, escrita admin.

### 3.2 Telas
- Seção "Suprimento" DENTRO de `/admin/campanha` (não criar rota nova):
  tabela publicação × necessária × em mãos × pedido ✓, com alerta visual
  quando `em_maos < necessaria` e `data_inicio` a menos de 30 dias.
- Catálogo de publicações: sheet simples dentro da mesma tela (+ Nova
  publicação). Não merece rota própria.
- Campo: número "levar X convites" pode aparecer no card da campanha do
  home quando em andamento (`qtd sugerida por publicador` = campo notas —
  manter texto livre, não calcular).

---

## Ordem de construção sugerida (incrementos testáveis)

Todos os incrementos abaixo foram concluídos, nessa ordem:

1. ✅ **C1**: reserva de quadras (schema + Visão Geral + bloqueio 409 + visual
   no mapa).
2. ✅ **C2**: termômetro + toggle mapa de calor em `/admin/campanha`.
3. ✅ **C3**: banner planejada + `interessados` em arranjos + inscrição no
   campo + interessados primeiro no Repartir.
4. ✅ **TP1**: schema TP + `/admin/tp` (pontos + turnos).
5. ✅ **TP2**: turnos na aba Agenda do campo + inscrição + seção no home.
6. ✅ **P1**: publicações + suprimentos na tela de campanha + vínculo
   `campanhas.publicacao_id`.

Cada incremento: migration própria, `npm run build` verde, push em `main`,
esperar o usuário testar antes do próximo.

---

## Avaliação do spec do Gemini (o que foi corrigido e por quê)

| Proposta do Gemini | Veredito | Motivo |
|---|---|---|
| Status enum na campanha | **Rejeitado** | App usa status derivado (decisão arquitetural existente); `ativa`+datas bastam |
| "Cria automaticamente lista de Lançamento no módulo de Publicações" | **Simplificado** | Módulo de publicações não existia; virou 1 linha em `campanha_suprimentos`, sem "módulo de lançamento" |
| Reserva de Quadras/Cartas/TPLs | **Reduzido a quadras** | Prédio/TCE reservado não tem caso real relatado; 1 coluna resolve, 3 junções não se pagam |
| Áreas reservadas "ficam ocultas" | **Trocado por bloqueio visível** | Ocultar quadra do mapa admin quebra o modelo map-driven; bloquear com 409 + visual segue o padrão da trava de arranjo |
| Filtro direcionado ao criar arranjo | **Aceito** | Vira chips de sugestão no form (baixo custo) |
| Termômetro de ritmo | **Aceito integral** | Computável com dados existentes (`quadras_conclusoes`) |
| Mapa de calor | **Aceito** | 80% já existia; falta só o toggle de coloração |
| Banner + inscrição antecipada | **Aceito e estendido** | Inscrição virou `interessados[]` no arranjo, integrada ao Repartir |
| "TPLs" tratados como território de campanha | **Reinterpretado** | TP recorrente é grade de turnos (módulo próprio), não item de arranjo; TP avulso já existe via modalidade `ponto_tp` |
