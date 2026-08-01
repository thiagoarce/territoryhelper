# Estado consolidado do schema — migrations 001–090

## Objetivo

Este documento consolida a auditoria individual da sequência histórica `001..090` de `supabase/migrations`.

A sequência possui uma lacuna histórica no número `021`; portanto, o intervalo termina em `090`, mas não contém 90 arquivos SQL numerados.

A finalidade desta consolidação é responder quatro perguntas:

1. Qual é o estado funcional final do banco atual?
2. Quais migrations foram substituídas, absorvidas ou tornadas obsoletas?
3. O que deve ou não deve entrar na baseline para instalações novas?
4. Quais decisões e testes ainda bloqueiam a escrita segura da baseline?

As migrations históricas permanecem necessárias para compreender e atualizar a instância original. Este documento não autoriza apagar, renumerar ou reescrever o histórico.

O limite auditado e preservado é `001–090`. Achados posteriores não devem virar `091`, `092` e seguintes no branch do Installer; eles entram como requisitos e testes da baseline separada, salvo um trabalho explicitamente voltado à manutenção da instância original.

## Fontes da consolidação

- [`MIGRATION_MATRIX.md`](./MIGRATION_MATRIX.md) — `001–029`;
- [`MIGRATION_MATRIX_030_035.md`](./MIGRATION_MATRIX_030_035.md);
- [`MIGRATION_MATRIX_036_049.md`](./MIGRATION_MATRIX_036_049.md);
- [`MIGRATION_MATRIX_050_063.md`](./MIGRATION_MATRIX_050_063.md);
- [`MIGRATION_MATRIX_064_068.md`](./MIGRATION_MATRIX_064_068.md);
- [`MIGRATION_MATRIX_069_077.md`](./MIGRATION_MATRIX_069_077.md);
- [`MIGRATION_MATRIX_078_090.md`](./MIGRATION_MATRIX_078_090.md);
- [`RLS_TEST_PLAN.md`](./RLS_TEST_PLAN.md).

## Conclusão executiva

O banco não precisa ser refeito do zero. Ele contém um núcleo territorial sólido e módulos funcionais maduros, mas a sequência histórica mistura:

- criação de schema;
- evolução incremental;
- correções de segurança;
- backfills de produção;
- limpezas de pré-produção;
- seeds de conteúdo;
- infraestrutura opcional;
- ideias intermediárias posteriormente substituídas.

Uma congregação nova não deve executar literalmente toda a história `001..090`. Ela deve receber uma **baseline limpa que represente apenas o estado final**, seguida de migrations incrementais futuras.

A baseline deve ser modular. O núcleo mínimo necessário para importar KML e CNEFE é muito menor que o produto completo com campanhas, publicações, testemunho público, notificações, backups e links públicos.

## Fronteiras funcionais do banco

### Núcleo obrigatório

O núcleo obrigatório para uma instalação territorial contém:

- Supabase Auth e `profiles`;
- papéis e helpers de autorização;
- PostGIS;
- `territorios`;
- `quadras`;
- `locais`;
- `unidades`;
- designações e seus participantes;
- registros históricos de visitas;
- histórico de conclusão de quadras;
- auditoria;
- views GeoJSON e de contagem;
- operações espaciais;
- RLS e triggers de proteção em seu estado final;
- metadados de instalação e versão do schema.

### Módulos funcionais opcionais

- arranjos e repartição em partes;
- TCE;
- campanhas;
- publicações;
- cartas e seus links públicos;
- testemunho público;
- notificações e Web Push;
- telemetria de erros;
- lembretes e jobs;
- backup automático;
- fotos de locais e capas de publicações;
- mapa offline.

“Opcional” significa que o Installer deve conseguir declarar e versionar a ativação do módulo. Não significa que o recurso seja provisório ou sem valor.

## Estado final por domínio

## 1. Identidade, perfis e capacidades

### Estado canônico

`profiles` continua sendo a extensão operacional de `auth.users`. A baseline deve criar diretamente:

- papéis atuais;
- estado ativo;
- preferências de usuário que permanecem usadas, como `pref_basemap`;
- flags de módulos opcionais, como `tp_aprovado`, somente quando o módulo correspondente estiver habilitado;
- trigger de criação de perfil;
- helpers de autorização com `search_path` seguro;
- proteção de campos privilegiados.

### Evoluções absorvidas

- `009` corrige a recursão de RLS em perfis;
- `010` endurece `search_path` e o fluxo administrativo;
- `044` introduz `servo_publicacoes` como capacidade;
- `060` encerra essa capacidade e transforma `is_servo_pub()` em compatibilidade admin-only.

### Decisão para a baseline

Uma instalação nova não deve nascer com um helper cujo nome diz “servo de publicações”, mas cuja semântica real é “admin”. As policies finais devem expressar diretamente a regra admin-only.

A coluna legada `profiles.servo_publicacoes` só deve ser mantida na baseline se o código atual ainda depender dela. Caso contrário, deve permanecer apenas na história da instância original.

### Requisito da baseline

`profiles_guard_sensitive()` precisa de teste executável. A versão histórica utiliza `current_user` dentro de função `SECURITY DEFINER`; isso pode identificar o proprietário da função em vez do chamador e neutralizar a proteção esperada.

A baseline deve criar diretamente uma guarda que use contexto explícito do chamador, como `auth.uid()`, permita manutenção administrativa controlada e impeça que usuário comum altere `role`, `ativo`, `tp_aprovado` ou capacidade equivalente. Esse achado não amplia o histórico legado.

## 2. Núcleo geográfico

### Estado canônico

O modelo atual é:

```text
territorios
  → quadras
      → locais
          → unidades
```

Ele é funcional, espacialmente indexado e reutilizável.

A baseline deve criar as tabelas já com as colunas finais acumuladas, incluindo:

- ativação de quadra;
- data de conclusão;
- reserva para campanha;
- geometria;
- códigos e metadados IBGE;
- origem e autoria de locais;
- pendência de revisão;
- override `nao_eh_predio`;
- marcação de local inexistente;
- ordem manual na quadra;
- dados de cartas nas unidades;
- atribuição de autoria de carta escrita.

### Views finais

As views devem ser criadas apenas uma vez, com lista explícita de colunas:

- `quadras_geo`;
- `locais_geo`;
- `quadras_contagens` — somente a definição corrigida de `073`;
- views agregadas de TCE quando o módulo estiver habilitado.

Não usar `table.*` em views operacionais que precisam acompanhar evolução de schema. As migrations `049` e `061` demonstram que novas colunas não surgem automaticamente numa view já materializada em definição antiga.

### Operações espaciais canônicas

- auto-vinculação de locais a quadras;
- criação e atualização de geometrias;
- união de quadras;
- divisão com `ST_Split`;
- criação aproximada de TCE;
- correção controlada de posição.

Todas as operações que alteram múltiplos vínculos devem ser transacionais e produzir relatório ou pendência de revisão.

### Decisões espaciais pendentes

- `ST_Contains` exclui pontos na fronteira. A baseline precisa escolher entre `ST_Covers`, tolerância espacial ou fila explícita de pendências.
- `ST_ConvexHull` para TCE é uma aproximação, não uma fronteira oficial.
- o raio fixo de 250 m usado para quadras vizinhas deve virar configuração ou constante documentada.
- correção humana não deve apagar a proveniência CNEFE; o modelo futuro deve separar dado de origem e override.

## 3. Designações, pertencimento e conclusão

### Estado canônico

O produto distingue:

- **designação pessoal**;
- **arranjo programado**;
- **parte de arranjo**;
- **território público por token**.

As designações podem incluir:

- quadras;
- locais para cartas;
- TCEs;
- líder em `designacoes.publicador_id`;
- participantes em `designacao_publicadores`.

### Débito estrutural

Existem duas fontes de pertencimento:

```text
designacoes.publicador_id
designacao_publicadores
```

O histórico mostra vários bugs causados por policies e funções que verificavam apenas o líder.

### Decisão para a baseline

Criar uma função canônica de pertencimento, por exemplo:

```text
participa_designacao(designacao_id, publicador_id)
```

Todas as policies, helpers e consultas sensíveis devem reutilizar esse contrato.

A baseline não deve duplicar a lógica de líder/participante em dezenas de expressões independentes.

### Conclusão de quadra

O estado final inclui:

- `quadras.data_conclusao` como estado atual;
- `quadras_conclusoes` como histórico append-only;
- `hora_informada` para distinguir horário real e estimado;
- dirigente/admin autorizados a concluir/desfazer qualquer quadra sem alterar estrutura;
- líder ou participante de designação pessoal ativa autorizado a concluir as quadras designadas;
- trigger de guarda em `quadras`.

Entram na baseline o schema e as policies finais. Não entram:

- o backfill da `084`;
- horários históricos e UTC−3 da parte de dados da `087`.

Autorização de conclusão deve usar um helper canônico de pertencimento. O histórico precisa registrar o usuário real, e a action não pode reportar sucesso quando nenhuma linha for alterada.

## 4. Arranjos e partes

### Estado canônico

`arranjos` representa eventos programados e pode reunir território misto. `arranjo_partes` distribui subconjuntos para duplas ou grupos.

O modelo histórico usa arrays de identificadores:

- `quadras_ids`;
- `cartas_locais_ids`;
- `publicadores`;
- `tces_ids`.

### Problema

Arrays de IDs não oferecem:

- FK por elemento;
- cascade por elemento;
- índice relacional simples;
- timestamp individual;
- auditoria individual;
- prevenção nativa de IDs órfãos.

### Decisão requerida

Antes de escrever a baseline final, escolher explicitamente entre:

1. manter arrays por compatibilidade, adicionando validação, limpeza e índices GIN; ou
2. normalizar para tabelas de junção e adaptar o aplicativo.

A segunda opção é arquiteturalmente mais limpa, mas não deve ser aplicada silenciosamente enquanto o app está estável.

### Autoridade de dirigente

Dirigente é um coordenador global da instância para os fluxos operacionais definidos, inclusive conclusão de quadras. Admin mantém também infraestrutura, usuários, importações e curadoria estrutural.

Esse escopo deve continuar explícito no domínio e nos testes, sem depender de uma policy histórica copiada incidentalmente.

## 5. Posse e edição de locais

### Cadeia histórica

```text
026 → 027 → 029 → 030 → 031 → 038 → 040
```

Todas redefinem ou influenciam `pode_editar_local()`.

### Estado arquitetural final

A partir de `057`, as policies de UPDATE em `locais` e `unidades` tornam-se amplas para usuários autenticados. A proteção real por coluna passa a depender de:

- `guard_locais_update()`;
- `guard_unidades_update()`;
- `pode_editar_local()`;
- fila `curadoria_edicoes`.

`075` modifica novamente `guard_locais_update()` para permitir uma exceção transacional controlada ao corrigir posição.

O contrato de produto é permissivo para trabalho operacional: publicadores ativos podem adicionar, editar e excluir locais/unidades e registrar históricos pelos fluxos do aplicativo, com efeito imediato e `curadoria_edicoes` posterior. Designação não deve virar uma barreira genérica a toda manutenção de campo.

Campos estruturais continuam protegidos. Exclusões precisam preservar um caminho real de reversão, por marcação lógica ou snapshot suficiente.

### Consequência

RLS isoladamente não descreve a segurança do sistema. A baseline e os testes precisam considerar o conjunto:

```text
policy + trigger + helper + RPC + contexto transacional
```

### Contrato mínimo de teste

- publicador ativo mantém dados operacionais e a mudança aparece imediatamente;
- edição e exclusão geram curadoria reversível;
- coparticipante de designação possui o mesmo acesso do líder conforme regra de negócio;
- participante de parte acessa apenas o escopo permitido;
- dirigente não altera colunas estruturais por UPDATE comum;
- correção de posição só funciona pela RPC autorizada;
- GUC transacional não pode ser reaproveitada fora da chamada;
- campos futuros de `quadras`, `locais` e `unidades` não ficam automaticamente desprotegidos.

## 6. Histórico, auditoria e curadoria

### Estado canônico

- registros de visitas são append-only;
- conclusões possuem histórico;
- `audit_log` registra mudanças relevantes;
- `curadoria_edicoes` registra alterações e propostas de campo;
- existe índice temporal para consulta recente de auditoria.

### Recomendações

- definir retenção ou particionamento para grandes volumes;
- verificar cobertura dos triggers de auditoria nas tabelas adicionadas após `007`;
- não permitir que correções humanas substituam silenciosamente o único valor de origem;
- registrar autoria, antes/depois e resolução em toda correção estrutural;
- não usar curadoria como bloqueio prévio do trabalho operacional;
- garantir restauração após exclusão feita pelo fluxo de campo.

## 7. Links públicos e tokens

### Estado canônico

Existem dois fluxos principais:

- território compartilhado por `territorio_tokens` e `territorio_publico(uuid)`;
- cartas por `cartas_tokens`, `carta_publica_dados(uuid)` e `carta_publica_toggle(...)`.

### Cadeia de `territorio_publico()`

```text
030 → 066 → 078 → 080 → 082
```

A baseline deve possuir somente a versão final acumulada, atualmente a de `082`, incorporando:

- contexto de cartão;
- quadras vizinhas;
- TCE;
- comércios;
- response allowlist explícita.

### Segurança final

`083` fecha a enumeração direta das tabelas de tokens. A baseline deve:

- negar SELECT anônimo direto nas tabelas de token;
- permitir acesso somente pelas RPCs validadas;
- revogar execução de `PUBLIC` antes de conceder aos papéis desejados;
- tratar token inválido e expirado sem vazar existência ou detalhes desnecessários;
- possuir testes negativos de enumeração e acesso cruzado.

## 8. Cartas

### Estado canônico

- unidade pode ter carta escrita;
- autoria pode ser registrada;
- entrega é evento separado;
- ciclos de cartas são por prédio, com fallback global;
- links públicos podem consultar e alterar apenas unidades do prédio associado ao token.

### Cadeia absorvida

`056` cria ciclo global. `062` transforma o modelo no estado final por prédio. A baseline não deve reproduzir a etapa global-only.

### Testes obrigatórios

- token de um prédio não altera unidade de outro;
- campo solicitado deve pertencer à allowlist;
- ciclo antigo não é interpretado como marca atual;
- chamada anônima não consegue descobrir outros tokens ou prédios.

## 9. Campanhas e publicações

### Campanhas

O módulo inclui:

- períodos e conteúdo;
- reserva de quadras;
- suprimentos;
- metas pessoais.

### Publicações

O módulo inclui:

- catálogo;
- códigos;
- categoria;
- estoque informativo;
- capas;
- pedidos avulsos;
- necessidade regular;
- variantes de revistas;
- controle manual por publicador.

### Estado de autorização

A capacidade separada de servo de publicações foi descontinuada. O estado atual é admin-only por compatibilidade.

### Seeds

`052_publicacoes_seed.sql` é conteúdo e não schema. Deve virar seed:

- opcional;
- versionado;
- idempotente;
- independente do estoque de uma congregação;
- atualizável sem alterar a baseline estrutural.

### Storage

As policies históricas de capas permitem insert e delete para qualquer autenticado. A baseline deve restringir escrita e exclusão a admin, salvo decisão explícita diferente.

## 10. Testemunho público

### Estado final do agendamento

O modelo inicial de `036` com `tp_turnos` e `tp_escala` foi abandonado e removido por `043`.

O estado final é baseado em:

- `tp_pontos`;
- tipos de equipamentos e peças;
- carrinhos;
- inventário;
- preferências e disponibilidade semanal como template;
- disponibilidade por mês e dia;
- meses e fases de planejamento;
- agendamentos por carrinho;
- recorrência;
- exceções por ocorrência;
- participantes;
- aceitação e recusa;
- reservas;
- relatórios e reposição;
- aprovação do publicador.

### Migrations excluídas do estado final

- tabelas `tp_turnos` e `tp_escala` da `036`;
- confirmação mensal da `054`, tornada órfã pela `058`;
- pressupostos operacionais anteriores ao modelo mensal.

### Seed

`048_tp_equipamentos_seed.sql` declara que não é idempotente. Deve ser convertido em seed versionado com chaves estáveis antes de ser usado pelo Installer.

### Riscos

- conflito de carrinho é validado principalmente na aplicação e precisa de controle de concorrência;
- RLS de relatório deve validar participação no agendamento;
- policies permissivas são combinadas por OR;
- participante designado não deve poder apagar silenciosamente o histórico se o fluxo oficial é aceitar ou recusar;
- inventário precisa de constraints de quantidade e definição clara de item livre versus publicação.

## 11. Notificações, telemetria e jobs

### Notificações

O estado final inclui:

- notificações in-app;
- subscriptions de Web Push;
- usuário visualiza e marca as próprias;
- usuário pode apagar as próprias após `088`.

A policy histórica de UPDATE permite alterar qualquer coluna da notificação própria. A baseline deve limitar a alteração ao estado de leitura, preferencialmente por RPC específica ou privilégio de coluna.

### Telemetria de erro

`085` cria `erros_client`; `089` endurece autoria e tamanho. A baseline deve criar diretamente a versão final e definir:

- retenção;
- dados pessoais permitidos;
- limites de payload;
- acesso administrativo;
- possibilidade de desativação por instância.

### Jobs e lembretes

`086` cria execução idempotente e deduplicação. É infraestrutura operacional opcional. Deve ser testada quanto a:

- corrida;
- timezone;
- falha após aquisição da trava;
- reexecução;
- uso exclusivo pelo papel administrativo apropriado.

## 12. Storage e infraestrutura

### Buckets identificados

- fotos de locais;
- capas de publicações;
- backups automáticos;
- mapa offline.

### Classificação

- fotos e capas: módulos funcionais opcionais;
- backups: infraestrutura opcional privada;
- mapa offline: infraestrutura opcional pública contendo apenas dados cartográficos não congregacionais.

### Regras para o Installer

Cada bucket deve estar num manifesto com:

- nome;
- público ou privado;
- limite de arquivo;
- MIME types;
- policies finais;
- módulo proprietário;
- estratégia de retenção;
- necessidade de seed ou upload posterior.

## Migrations que não entram como passos da baseline

## Limpeza histórica destrutiva

- exclusões de dados da `030`;
- `032_limpar_designacoes_teste.sql`;
- `033_limpar_arranjos_teste.sql`.

## Backfills e transformações específicas da instância

- backfill de TCE singular para array em `066`;
- `084_backfill_quadras_conclusoes.sql`;
- parte de dados da `087_hora_informada_backfill.sql`;
- qualquer horário histórico fixo ou pressuposto UTC−3;
- ajustes que dependem de seeds existentes, como marcação de revistas em `063`, devem migrar para o sistema de seed.

## Seeds

- `048_tp_equipamentos_seed.sql`;
- `052_publicacoes_seed.sql`.

## Ferramentas legadas

- `011_exec_sql.sql` não deve ser mecanismo padrão do Installer;
- `scripts/migrate-from-csv.ts` é adaptador de migração da instância original, não importador CNEFE genérico.

## Implementações substituídas

- `delegacoes_temp`, substituída por partes de arranjo;
- versões intermediárias de `pode_editar_local()`;
- versões intermediárias de `territorio_publico()`;
- `tp_turnos` e `tp_escala`;
- `tp_disponibilidade_confirmacoes`;
- view `quadras_contagens` de `071`;
- views GeoJSON antigas;
- ciclo de cartas global-only;
- semântica original de `servo_publicacoes`.

## Estrutura recomendada da baseline

A baseline não precisa ser um único arquivo gigantesco. Ela deve ser uma sequência pequena e estável, organizada por responsabilidade.

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
    campaigns.sql
    publications.sql
    letters.sql
    arrangements.sql
    tce.sql
    public_witnessing.sql
    notifications.sql
    telemetry.sql
    jobs.sql
    backups.sql
```

Seeds devem ficar fora:

```text
supabase/seeds/
  publications/
  public-witnessing-equipment/
```

Backfills históricos continuam em `supabase/migrations` para upgrades da instância original.

## Decisões que bloqueiam o SQL final

A baseline ainda não deve ser codificada até implementar ou testar:

1. pertencimento canônico em designações, cobrindo líder e participante;
2. arrays de IDs versus tabelas de junção;
3. guarda segura dos campos privilegiados de `profiles`;
4. edição operacional imediata com curadoria posterior;
5. reversão de exclusões operacionais;
6. contrato final dos triggers de guarda estrutural;
7. conclusão contextual de quadra e histórico consistente;
8. fronteiras espaciais;
9. timezone configurável da instância;
10. exposição exata dos RPCs públicos;
11. policies de Storage;
12. concorrência em agendamentos e jobs;
13. módulos habilitados por padrão;
14. compatibilidade do app com remoção de colunas e helpers legados;
15. tradução de erros técnicos nas rotas e actions.

## Próxima etapa técnica

A próxima etapa não é escrever imediatamente a baseline. É criar uma **especificação executável de equivalência**.

### Banco histórico

Aplicar a sequência histórica `001–090` num projeto Supabase vazio para caracterização. O legado não precisa satisfazer contratos novos deliberadamente definidos para a baseline.

### Banco candidato

Aplicar a futura baseline e os mesmos módulos habilitados.

### Comparar

- extensões;
- tabelas e colunas;
- defaults;
- constraints e FKs;
- índices;
- views e tipos retornados;
- funções e grants;
- triggers;
- RLS habilitada;
- policies;
- buckets e policies de Storage;
- comportamento de usuários admin, dirigente, publicador, anônimo e service role.

A baseline pode divergir deliberadamente de uma policy histórica quando a diferença implementa um requisito aceito de segurança ou usabilidade e possui teste próprio.

## Critério de conclusão da auditoria

A auditoria das migrations é considerada documentalmente concluída quando:

- todos os intervalos `001–090` estão mapeados;
- a lacuna `021` está registrada;
- cadeias de substituição estão identificadas;
- limpezas, seeds e backfills estão separados do schema;
- módulos obrigatórios e opcionais estão definidos;
- decisões pendentes estão listadas;
- o próximo trabalho é teste executável, não mais descoberta manual de migrations.

Este critério foi alcançado por esta consolidação. A próxima fase é transformar o contrato documentado em testes de schema e RLS antes da criação da baseline SQL.
