-- 092: conclusão POR LADO da quadra ("só fizemos o lado da Rua X").
--
-- Um lado = uma RUA: os endereços da quadra agrupados por
-- locais.logradouro (NOT NULL), normalizado por $lib/lados.ts::chaveLado.
-- NÃO se usa locais.face_ibge: é texto livre, vem NULL em boa parte dos
-- endereços (existe até uma auditoria "Endereços sem face IBGE" em
-- /admin/poligonos) e "Face 3" não diz nada pro publicador.
--
-- Não existe tabela de LADO — o lado é derivado dos endereços a cada
-- leitura. Só a CONCLUSÃO é persistida, aqui.
--
-- Por que uma tabela paralela e não uma coluna em `quadras`:
--   1) ~20 consumidores dependem da conclusão BINÁRIA por quadra (o
--      motor de ciclos do S-13, dashboard, campanha, cor do mapa,
--      cartão S-12, cobertura, lembretes, fechamento automático de
--      designação). Marcar um lado NÃO pode mexer em nenhum deles;
--   2) o trigger quadras_guard_nao_admin (migration 090) proíbe o
--      DIRIGENTE de alterar qualquer coluna de `quadras` que não seja
--      data_conclusao — uma coluna nova lá nasceria bloqueada justo
--      pra quem mais usa a feature.
--
-- Semântica: marcar um lado é PROGRESSO dentro do ciclo atual, não
-- fecha ciclo nenhum. Quando o ÚLTIMO lado é marcado, o app chama
-- registrarConclusaoQuadra ($lib/server/conclusao.ts) — a conclusão
-- cheia continua sendo o único caminho de escrita, com histórico e a
-- checagem de count:'exact'.

create table if not exists quadra_lados_conclusoes (
  id bigserial primary key,
  quadra_id text not null references quadras(id) on delete cascade,
  -- chave normalizada (maiúsculas, sem acento, tipo de logradouro
  -- padronizado) — é por ela que se compara
  lado_chave text not null,
  -- o logradouro como o publicador vê, pra UI e histórico legível
  lado_rotulo text not null,
  data_conclusao date not null,
  marcado_por uuid references profiles(id) on delete set null,
  marcado_em timestamptz not null default now(),
  hora_informada boolean not null default false
);

create index if not exists qlc_quadra_lado_idx
  on quadra_lados_conclusoes(quadra_id, lado_chave, data_conclusao desc);

-- Idempotência do replay da fila offline: postComFila reenvia o MESMO
-- POST quando a rede volta, e sem isso o mesmo lado no mesmo dia
-- viraria duas linhas. O app grava com upsert + ignoreDuplicates em
-- cima deste índice.
create unique index if not exists qlc_uniq
  on quadra_lados_conclusoes(quadra_id, lado_chave, data_conclusao);

alter table quadra_lados_conclusoes enable row level security;

-- Mesmo desenho de quadras_conclusoes (019 + 090): insert de qualquer
-- autenticado (a action do app já checa o papel), delete de
-- dirigente/admin.
drop policy if exists qlc_select_auth on quadra_lados_conclusoes;
create policy qlc_select_auth on quadra_lados_conclusoes
  for select to authenticated using (true);

drop policy if exists qlc_insert_auth on quadra_lados_conclusoes;
create policy qlc_insert_auth on quadra_lados_conclusoes
  for insert to authenticated with check (true);

drop policy if exists qlc_delete_dirigente on quadra_lados_conclusoes;
create policy qlc_delete_dirigente on quadra_lados_conclusoes
  for delete to authenticated using (is_dirigente_or_admin());
