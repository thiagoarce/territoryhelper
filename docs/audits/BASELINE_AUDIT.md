# Baseline Audit

## Objetivo

Avaliar o estado atual do schema, das migrations e dos scripts de importação para definir uma baseline reutilizável pelo Installer sem carregar dados, limpezas ou suposições específicas da instância original.

A auditoria completa das migrations está consolidada em:

- [`CONSOLIDATED_SCHEMA_STATE.md`](./CONSOLIDATED_SCHEMA_STATE.md)

As matrizes por intervalo permanecem como evidência detalhada em `docs/audits/`.

## Escopo concluído

Foram revisados:

- a sequência histórica `001–090` em `supabase/migrations`;
- a ausência do número `021`;
- tabelas, colunas, constraints e índices;
- views;
- funções e RPCs;
- triggers;
- RLS e policies;
- Storage e buckets;
- seeds;
- backfills;
- limpezas de pré-produção;
- `scripts/migrate-from-csv.ts`;
- documentação de instalação atual.

A etapa de descoberta documental das migrations está concluída. A próxima fase é executável: contratos de aceitação da baseline, testes de schema e caracterização do legado.

## Conclusão executiva

O Territory Helper possui um núcleo reutilizável sólido:

- Supabase Auth;
- perfis e papéis;
- PostgreSQL/PostGIS;
- modelo `territorios → quadras → locais → unidades`;
- índices espaciais;
- designações;
- registros históricos;
- conclusão de quadras;
- operações geométricas;
- auditoria;
- links públicos por token;
- módulos adicionais de campanhas, publicações, cartas, TCE, testemunho público, notificações e infraestrutura.

O problema principal não é falta de estrutura. É a mistura histórica entre:

1. criação de schema;
2. evolução incremental;
3. correções de segurança;
4. migrações de dados da instância original;
5. limpezas de pré-produção;
6. seeds;
7. infraestrutura opcional;
8. ideias intermediárias posteriormente substituídas.

Uma congregação nova não deve executar literalmente toda a sequência `001–090`. Deve receber uma baseline limpa que represente o estado final e declare os módulos habilitados.

## Decisão arquitetural

A estratégia adotada é:

- preservar integralmente o histórico atual para a instância existente;
- criar uma baseline separada para novas instalações;
- manter migrations incrementais futuras após a baseline;
- tratar `001–090` como o limite legado auditado, sem continuar essa numeração no branch do Installer;
- registrar achados posteriores como requisitos e testes da baseline, salvo tarefa explícita de manutenção da instância original;
- separar schema, RLS, Storage, seeds e backfills;
- validar equivalência comportamental entre histórico e baseline;
- não alterar o banco de produção durante a fase de auditoria.

## Núcleo obrigatório da baseline

A baseline mínima deve conter:

### Infraestrutura

- PostGIS e extensões necessárias;
- tabela de versão do schema;
- metadados da instalação;
- timezone operacional explícito.

### Identidade e acesso

- `profiles`;
- papéis;
- trigger de criação de perfil;
- helpers com `search_path` seguro;
- proteção de campos privilegiados;
- RLS final, sem reproduzir versões vulneráveis intermediárias.

A guarda de campos privilegiados deve identificar o chamador por contexto explícito, como `auth.uid()`, e nunca depender de `current_user` dentro de uma função `SECURITY DEFINER`. `role`, `ativo`, `tp_aprovado` e capacidades administrativas equivalentes não podem ser autoatribuídos.

### Domínio geográfico

- `territorios`;
- `quadras`;
- `locais`;
- `unidades`;
- índices GiST;
- views GeoJSON finais;
- view final de contagens;
- associação espacial;
- operações de criação, atualização, união e divisão.

### Domínio operacional

- designações;
- vínculos com quadras, locais, TCEs e múltiplos publicadores conforme os módulos habilitados;
- registros de visitas;
- histórico de conclusões;
- auditoria;
- triggers de proteção e curadoria em seu estado final.

O contrato operacional não é admin-only: publicadores ativos mantêm locais, unidades e históricos com efeito imediato e curadoria posterior. Líderes e participantes de uma designação pessoal ativa podem concluir as quadras correspondentes. Dirigente e admin têm escopo global de conclusão.

## Módulos opcionais

A baseline deve permitir ativação declarativa de:

- arranjos e partes;
- TCE;
- campanhas;
- publicações;
- cartas e links públicos;
- testemunho público;
- notificações e push;
- telemetria de erros;
- jobs e lembretes;
- backups;
- fotos;
- capas de publicações;
- mapa offline.

Cada módulo precisa registrar sua versão e suas dependências.

## Itens excluídos da baseline estrutural

### Limpezas destrutivas

- exclusões de teste embutidas na `030`;
- `032_limpar_designacoes_teste.sql`;
- `033_limpar_arranjos_teste.sql`.

### Backfills da instância original

- backfill de TCE singular para array em `066`;
- `084_backfill_quadras_conclusoes.sql`;
- dados históricos e UTC−3 da `087`;
- transformações que pressupõem conteúdo já semeado.

### Seeds

- catálogo de equipamentos da `048`;
- catálogo de publicações da `052`.

Esses conteúdos devem virar seeds opcionais, idempotentes e versionados.

### Ferramentas legadas

- `011_exec_sql.sql` não entra no fluxo padrão do Installer;
- `scripts/migrate-from-csv.ts` permanece classificado como adaptador de migração legado.

## Principais cadeias consolidadas

### Posse de local

`pode_editar_local()` foi redefinida sucessivamente em `026`, `027`, `029`, `030`, `031`, `038` e `040`.

A baseline deve conter uma única versão final, testada contra líder, coparticipante, parte de arranjo, dirigente, usuário sem relação e admin.

### Guarda de edição

`057` transforma triggers em parte central da segurança de `locais` e `unidades`. `075` altera a guarda para permitir correção estrutural controlada.

O contrato final é a combinação de RLS, trigger, helper, RPC e contexto transacional.

### Território público

`territorio_publico()` evolui em `030`, `066`, `078`, `080` e `082`.

A baseline deve criar somente a versão final e incorporar o saneamento de tokens da `083`.

### Testemunho público

O modelo `tp_turnos`/`tp_escala` de `036` é substituído pelo modelo de agendamentos de `043`, expandido em `058` e `069`.

Uma instalação nova deve começar diretamente pelo modelo final.

### Conclusão de quadras

O estado final resulta de `019`, `087` e `090`. Os backfills de `084` e da parte de dados de `087` não entram em banco vazio.

A baseline não deve copiar apenas a policy global da `090`. Ela precisa centralizar a autorização contextual:

- dirigente/admin concluem qualquer quadra;
- publicador conclui quadra de designação pessoal ativa, como líder ou participante;
- autoria do histórico corresponde ao usuário real;
- estado atual e histórico são atualizados de forma consistente;
- nenhuma escrita com zero linhas afetadas retorna sucesso ao usuário.

## Riscos que ainda bloqueiam a baseline SQL

1. implementação centralizada do pertencimento entre `designacoes.publicador_id` e `designacao_publicadores`;
2. arrays de IDs sem integridade referencial;
3. teste comportamental da guarda de campos privilegiados de `profiles`;
4. separação entre edição operacional imediata e campos estruturais protegidos;
5. reversão confiável de exclusões pela curadoria;
6. dependência crítica dos triggers de guarda;
7. acesso por token e response allowlist;
8. fronteiras espaciais;
9. timezone por instância;
10. Storage policies historicamente amplas;
11. concorrência em agendamentos e jobs;
12. compatibilidade do app com remoção de helpers e colunas legadas;
13. tradução consistente de erros técnicos nas rotas e actions.

## Testes exigidos antes da baseline

O plano detalhado está em [`RLS_TEST_PLAN.md`](./RLS_TEST_PLAN.md).

A suíte deve cobrir:

- admin;
- dirigente;
- líder de designação;
- coparticipante;
- publicador sem relação;
- anônimo;
- `service_role`;
- leitura, insert, update e delete;
- tentativas de troca de IDs e escopo;
- funções `SECURITY DEFINER`;
- triggers de guarda;
- tokens válidos, inválidos e expirados;
- Storage;
- conclusão de quadras;
- conclusão por líder e participante de designação pessoal ativa;
- edição operacional imediata com curadoria e reversão;
- dirigente/admin com escopo global;
- ausência de sucesso falso quando nenhuma linha é alterada;
- tradução de `404`, `405` e erros SQL para mensagens de domínio;
- correção de posição;
- concorrência quando aplicável.

## Teste de equivalência

Criar dois bancos vazios:

### Banco histórico

Aplicar a sequência histórica completa e os mesmos módulos.

### Banco candidato

Aplicar a baseline consolidada e os mesmos módulos.

### Comparar

- extensões;
- tabelas e colunas;
- defaults;
- constraints e FKs;
- índices;
- views e tipos retornados;
- funções, assinaturas, grants e propriedades de segurança;
- triggers;
- RLS e policies;
- buckets e Storage policies;
- comportamento dos perfis de teste.

Equivalência não significa que o catálogo ou as policies precisam ser byte a byte idênticos. A baseline deve ser compatível com o aplicativo e implementar o contrato de produto aceito, podendo divergir deliberadamente do legado para corrigir segurança, usabilidade ou ideias substituídas.

## Estrutura recomendada

```text
supabase/baseline/
  000_extensions.sql
  010_schema_metadata.sql
  020_identity.sql
  030_geographic_core.sql
  040_operational_core.sql
  050_views_and_indexes.sql
  060_functions_and_triggers.sql
  070_rls.sql
  080_storage.sql
  modules/
```

Seeds devem ficar em `supabase/seeds/`. Backfills históricos permanecem em `supabase/migrations/`.

## Próxima etapa

Implementar a primeira suíte de contrato para:

- `profiles` e proteção contra autoelevação;
- `quadras` e conclusão global por dirigente/admin;
- conclusão por líder e participante de designação pessoal ativa;
- `locais` e `unidades` com edição operacional imediata;
- `curadoria_edicoes`, inclusive reversão de exclusão;
- separação entre campos operacionais e estruturais;
- triggers de guarda;
- links públicos e enumeração de tokens;
- mensagens amigáveis em falhas de autorização, recurso ausente ou action desatualizada.

O legado foi caracterizado e não precisa cumprir contratos novos que nunca implementou. A baseline piloto está em `supabase/baseline/`; sua promoção para versão utilizável depende do smoke test em Supabase vazio, dos contratos de papel e da instalação acompanhada.

## Critério de aceite da fase de auditoria

- migrations `001–090` mapeadas;
- lacuna `021` registrada;
- estado final consolidado;
- ideias intermediárias identificadas;
- seeds, backfills e limpezas separados do schema;
- módulos obrigatórios e opcionais definidos;
- riscos pendentes documentados;
- próximo passo transformado em teste executável.

A fase documental da auditoria atingiu esse critério.
