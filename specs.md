# Especificações e Fases de Implementação - Territory Helper

## 1. Objetivo e Arquitetura
Aplicativo PWA map-driven para gestão de territórios.
* **Stack:** SvelteKit 2 + Svelte 5 (runes), Tailwind 3, Supabase (Postgres, Auth, RLS), MapLibre GL. Deploy no Cloudflare Workers.
* **Paradigma de UI:** A interface no modo campo deve ser centralizada no mapa. O mapa é o principal controlador das ações.
* **2 modos apenas** (revisão): **admin** (organizador) e **campo**
  (publicador + dirigente na mesma tela; dirigente ganha features extras
  via `role`). Rotas antigas `/dirigente/*` redirecionam 301 pra
  `/publicador/*`.

## Fase 1: Endurecimento e Segurança ✅ concluída
* ✅ **Correção RLS** — migration `026_rls_hardening.sql` (estendida em
  `027`/`029`). Helper `pode_editar_local(bigint)` decide se publicador
  pode UPDATE em local/unidade: só se tem designação aberta com a quadra,
  ou delegação temp ativa, ou arranjo cartas.
* ✅ **Validação de Rota** — `exigirQuadraDesignada(locals, quadraId)` em
  `$lib/server/guards.ts`, aplicado em `/publicador/quadra/[id]`. Admin/
  dirigente passam direto; publicador só se tem designação ativa OU
  delegação temp OU arranjo cobrindo a quadra.
* ✅ **Bug menu vazando** — `+layout.svelte` decide `modoAtual` por role
  em rotas compartilhadas (`/perfil`, `/buscar`); antes caía no default
  `admin` e mostrava drawer completo pro publicador/dirigente.
* ✅ **Limpeza menu admin** — Auditoria e SQL(dev) removidos do drawer.
* ✅ **Padding /admin/usuarios** — wrap em `p-4 max-w-6xl mx-auto`.

## Fase 2: Modo "Campo" ✅ concluída
* ✅ **Perfil sai do bottom nav** — vira ícone discreto no header.
* ✅ **Card destacado de campanha ativa** no topo do home publicador
  (`/publicador/+page.svelte`) linkando pra `/publicador/campanha`.
* ✅ **Carteira dividida** em Território pessoal / Pregação em grupo /
  ✉ Cartas designadas (nova junção `designacao_locais` + `tipo='cartas'`).
* ✅ **Arranjos read-only** pro publicador (existente em `/publicador/arranjo`;
  dirigente ganha botões distribuir + assumir por role).
* ✅ **Busca de prédios + criar pendente**:
  * `/publicador/predios` = aba dedicada com busca de texto + 📍 GPS por
    proximidade (haversine local sobre `locais_geo`) + tabs tipo (
    Todos/Residencial/Comercial) + filtros portaria/irmão/caixas.
  * "➕ Novo" cria com `pendente=true` (migration `028_locais_pendente.sql`
    + RLS libera insert quando `criado_por = auth.uid()`).
  * Admin valida via ⏳ no `/admin/predios` (associa quadra correta +
    zera pendente).

## Fase 3: Superpoderes do Dirigente ✅ concluída
* ✅ **Mapa Estratégico** (`/publicador/mapa`, só dirigente/admin) —
  mapa map-driven map-driven com AdminMapa; concluir quadra via sheet;
  PNG export via `mapa.getCanvas().toDataURL()`. (Coloração diferenciada
  por idade de conclusão fica pra polimento futuro.)
* ✅ **Marcar Concluída** — em `/publicador/quadra/[id]`, bloco visível
  se `role in [dirigente, admin]`. Actions `concluirQuadra` +
  `desfazerConclusao` com role guard.
* ✅ **POIs e Estacionamento** — `Estacionar perto` no sheet da quadra do
  mapa estratégico. Overpass API (`$lib/utils/overpass.ts`) com 6
  categorias (parking, pharmacy, square, fuel, supermarket, bakery).
  POIs viram **marcadores no mapa** (via prop `pois` do `AdminMapa`);
  click no marcador abre Google Maps direto (`urlRotaGoogleMaps`).
* ✅ **Cartão de Território PNG** — botão 📸 exporta o mapa como PNG
  (single-quadra funciona; batch é polimento futuro).
* ✅ **Assumir Arranjo** — botão "👋 Assumir dirigência" nos cards de
  arranjo dos outros. Action `assumirArranjo` troca `dirigente_id` +
  reassinala designações abertas do dirigente anterior via match de
  notas.
* ✅ **Delegação Temporária** — nova tabela `delegacoes_temp` (migration
  `027`) com `data_fim` default = hoje 23:59. Botão "👤 Delegar temp" no
  header do mapa estratégico; publicador vê card amarelo "🚶 Pregando
  com dirigente agora" no home.
* ✅ **Designar prédios como cartas** — nova junção `designacao_locais`
  (migration `029`) + `designacoes.tipo='cartas'`. Barra bottom em
  `/publicador/predios` e `/admin/predios` (quando dirigente/admin
  seleciona prédios) → sheet "🎯 Designar cartas" escolhe publicador(es)
  + prazo.

## /predio/[id] unificado
Substituiu duas telas separadas. Toggle no topo:
* **🚪 Casa em casa**: botões `conversou / semConversa / naoAtendeu / carta`
  → tabela `registros` (histórico append-only).
* **✉ Cartas**: botões `✉ / 🏚 / 🚫` → colunas de `unidades`.

Header ganhou ✏ (editar prédio: nome, portaria, caixas, notas) e
📤 (WhatsApp share via `cartas_tokens`). Progresso duplo. Modo persiste
em `localStorage`.

## Bug fixes
* ✅ Import CSV — `Comp. Num.` vazio deixava `complemento=null` em toda
  a base. `scripts/fill-complementos.ts` remedia sem destruir dados;
  `migrate-from-csv.ts` teve fallback per-row corrigido.
* ✅ Sort proximidade — RPC `buscar_locais_proximos` só cobria raio de
  5km com geo. Substituído por haversine local em `/publicador/predios`
  e `/admin/predios`.

## Regras Inflexíveis de Código
* NUNCA use `Turf.js` no frontend para operações de polígonos. Use sempre RPCs do PostGIS no Supabase (`ST_Union`, etc).
* Com Svelte 5 runes, NUNCA faça *early-returns* dentro de um `$effect` antes de declarar as dependências reativas.
* Use os componentes unificados da pasta `$lib/ui` em vez de criar botões e cards do zero. Modais devem usar `BottomSheet`.
* Actions role-restritas: sempre checar `locals.profile?.role` no início da action (defesa em profundidade além de RLS).
* Não usar `now()` em predicate de índice parcial (não é IMMUTABLE — fica no WHERE das queries).

## Polimentos futuros (fora do specs original)
* Coloração cinza/vermelho por idade de conclusão no mapa estratégico
  (hoje já tem amber/green/slate por status).
* PNG export em lote (múltiplas quadras selecionadas).
* Rename `/publicador/*` → `/campo/*` (cosmético — URLs semânticas).
* Multi-publicador por designação (`designacao_publicadores` já existe;
  UI ainda opera 1-a-1).
