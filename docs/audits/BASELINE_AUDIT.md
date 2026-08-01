# Baseline Audit

## Objetivo

Avaliar o estado atual do schema, das migrations e dos scripts de importação para definir uma baseline reutilizável pelo Installer sem carregar dados ou suposições específicas da instância original.

A classificação individual e completa das migrations está em [`MIGRATION_MATRIX.md`](./MIGRATION_MATRIX.md).

## Escopo analisado

- `README.md`
- `package.json`
- `supabase/migrations/001_profiles_and_auth.sql`
- `supabase/migrations/002_geografia.sql`
- `supabase/migrations/011_exec_sql.sql`
- `scripts/migrate-from-csv.ts`
- migrations `001..029`, com registro da ausência do número `021`

A auditoria estrutural inicial está concluída. A próxima etapa é validar a equivalência entre o histórico completo e uma baseline consolidada aplicada em banco vazio.

## Conclusão executiva

O projeto já possui um núcleo reutilizável sólido:

- autenticação baseada em Supabase Auth;
- perfis e papéis;
- PostgreSQL/PostGIS;
- modelo `territorios -> quadras -> locais -> unidades`;
- índices espaciais;
- associação espacial de endereços;
- views GeoJSON;
- operações de criação e divisão de geometrias;
- RLS e hardening de segurança;
- importação em lote via `service_role`.

O maior problema não é falta de estrutura. É a mistura entre três responsabilidades:

1. criação do schema;
2. migração one-shot da instância original;
3. importação inicial reutilizável para novas congregações.

A baseline do Installer deve preservar o schema e separar completamente os itens 2 e 3.

## Classificação dos componentes

### Reutilizar como base

#### Autenticação e perfis

`001_profiles_and_auth.sql` é um bom ponto de partida para novas instâncias. Ele cria `profiles`, papéis e o trigger de criação de perfil.

Atenção: funções e policies iniciais foram corrigidas em migrations posteriores. A baseline não deve simplesmente reaplicar a versão histórica de `001`; deve incorporar o estado final após os fixes de RLS e `search_path`.

#### Domínio geográfico

`002_geografia.sql` já contém uma separação útil:

```text
territorios
  -> quadras
      -> locais
          -> unidades
```

Também já usa:

- `geometry(Polygon, 4326)` para quadras;
- `geometry(Point, 4326)` para locais;
- índices GiST;
- separação entre o lugar físico e a unidade visitável.

Essa parte deve ser reaproveitada, mas evoluída para suportar a abstração de área de trabalho sem quebrar as quadras atuais.

#### Migrations funcionais posteriores

A leitura individual de `001..029` confirmou módulos genericamente reutilizáveis:

- auditoria;
- RLS;
- views GeoJSON;
- auto-vinculação via PostGIS;
- armazenamento de fotos;
- histórico de conclusões;
- edição, união e divisão de geometria;
- campanhas;
- arranjos;
- delegações;
- criação de locais pendentes por publicadores;
- designações de locais para cartas.

O destino exato de cada migration está documentado na matriz detalhada.

### Reaproveitar com refatoração

#### `scripts/migrate-from-csv.ts`

O script contém conhecimento valioso:

- parser CSV com BOM e RFC 4180;
- coerção de datas, números e booleanos;
- agrupamento de registros por `logradouro + numero`;
- geração de um `local` com várias `unidades`;
- classificação heurística de casa, prédio, comércio, coletivo e terreno;
- conversão de coordenadas para GeoJSON;
- conversão de polígonos legados para PostGIS;
- inserção em lotes.

Porém, ele é uma migração específica do aplicativo antigo. Isso aparece em dependências como:

- nomes fixos de abas/CSVs do Google Sheets;
- `legacy_row`;
- `Predios.csv` e `PrediosAptos.csv` como overlays manuais;
- `Territorios.csv`, `Quadras.csv`, `Registros.csv`, `Designacoes.csv` e outros arquivos da instância original;
- limpeza destrutiva das tabelas antes da importação.

Ele não deve virar o importador do Installer diretamente. Deve ser decomposto em:

```text
CSV infrastructure
CNEFE Transformation Engine
Data Quality Engine
Legacy Migration Adapter
Publisher
```

O `Legacy Migration Adapter` continua disponível para a instância original. O novo CNEFE Transformer recebe os CSVs oficiais do IBGE e produz um pacote intermediário independente do banco.

#### Idempotência atual

O script declara idempotência porque executa `TRUNCATE ... CASCADE` antes de inserir novamente. Isso é adequado para uma migração one-shot controlada, mas não para o Installer nem para reimportações futuras.

A idempotência do novo pipeline deve ser baseada em:

- chave estável de origem;
- hash do arquivo;
- versão do transformador;
- `upsert` controlado;
- preservação de overrides manuais;
- relatório de registros novos, alterados, ausentes e conflitantes.

### Não incluir na baseline genérica

Os seguintes itens pertencem ao legado ou aos dados da instância original:

- arquivos de `migration-data`;
- nomes de territórios e quadras concretos;
- polígonos importados da planilha antiga;
- `legacy_row` como contrato permanente;
- registros históricos específicos;
- prédios e apartamentos revisados manualmente na planilha;
- designações, campanhas e arranjos já existentes;
- qualquer seed com usuários ou dados congregacionais.

Podem existir adaptadores de migração, mas esses itens não devem aparecer nas migrations de schema para novas congregações.

## Problemas identificados

### 1. Instalação manual das migrations

O README exige colar as migrations no SQL Editor em ordem. Isso é aceitável para desenvolvimento inicial, mas inadequado para o Installer.

A instalação precisa ter um executor versionado que:

- detecte migrations já aplicadas;
- aplique apenas as pendentes;
- registre a versão do schema;
- pare com erro claro;
- produza relatório de instalação.

### 2. Baseline histórica versus baseline final

As migrations `001..029` registram a evolução do produto. Uma instalação nova não deveria depender de reproduzir todos os estados intermediários indefinidamente.

Recomendação:

- preservar o histórico atual para instâncias existentes;
- criar uma baseline consolidada para instalações novas;
- manter migrations incrementais posteriores à baseline;
- testar equivalência entre `histórico completo` e `baseline + incrementais`.

### 3. `exec_sql` é poderoso demais para ser parte do fluxo comum

`011_exec_sql.sql` cria uma RPC que executa SQL arbitrário usando `SECURITY DEFINER`. A função está restrita a `service_role`, o que reduz o risco, mas ainda representa uma superfície poderosa.

Recomendação:

- não expor essa função ao usuário comum;
- não usá-la como mecanismo principal do Installer;
- preferir um migrator local com conexão administrativa;
- avaliar remover a função de novas instalações após a transição;
- caso mantida, registrar auditoria e limitar o uso a ambiente de desenvolvimento/manutenção.

### 4. Acoplamento do modelo à quadra urbana

O modelo atual usa `quadra_id` diretamente em `locais`. Isso funciona para o produto atual, mas não cobre bem rota rural, localidade ou ponto isolado.

A evolução deve ser incremental. Não é necessário renomear tudo agora. Uma estratégia possível é:

1. criar `work_areas` ou uma camada equivalente;
2. migrar quadras para um tipo de área;
3. manter views/compatibilidade para o código atual;
4. só depois reduzir o acoplamento direto a `quadras`.

### 5. Conhecimento do CNEFE embutido no migrador legado

A classificação baseada em `Tipo`, `Nota IBGE`, quantidade de unidades e overlays manuais é útil, mas está misturada com persistência e migração do Sheets.

Ela deve virar regra de domínio versionada, testada e explicável.

### 6. Pertencimento duplicado em designações

O schema possui `designacoes.publicador_id` e `designacao_publicadores`. Algumas funções e policies posteriores verificam apenas `publicador_id`.

A baseline precisa de uma função canônica de pertencimento à designação, utilizada por RLS, consultas e autorização de edição.

### 7. Autorização cumulativa em `pode_editar_local`

A função é redefinida nas migrations 026, 027 e 029. Cada redefinição precisa repetir todos os casos anteriores, o que cria risco de regressão.

A baseline deve criar uma única versão final testada ou decompor a autorização em helpers menores.

### 8. Fronteiras e timezone

`ST_Contains` não inclui pontos exatamente na fronteira. Além disso, a expiração de delegações no fim do dia depende do timezone do banco.

O Installer deve definir uma regra espacial canônica e registrar o timezone operacional da instância.

## Baseline proposta

A baseline para novas instalações deve conter:

### Infraestrutura

- extensões necessárias, incluindo PostGIS;
- tabela de controle de versão do schema;
- funções utilitárias seguras;
- configuração de storage necessária.

### Identidade e acesso

- `profiles`;
- papéis;
- trigger de criação de perfil;
- policies no estado final, sem repetir versões vulneráveis intermediárias.

### Domínio operacional atual

- territórios;
- quadras;
- locais;
- unidades;
- designações;
- registros;
- campanhas;
- arranjos;
- histórico de conclusões;
- auditoria.

### Geoespacial

- índices GiST;
- views GeoJSON;
- associação espacial;
- funções de criação, atualização, união e divisão de geometria.

### Metadados do Installer

Novas tabelas ou estruturas devem registrar:

- versão instalada;
- execução do pipeline;
- arquivos de origem e hashes;
- versão do dicionário CNEFE;
- versão do transformador;
- status de revisão e publicação;
- relatório final da instalação.

## Plano de ação recomendado

### Etapa A — concluída: matriz das migrations

A matriz `001..029` foi criada com responsabilidade, dependências, destino na baseline e riscos.

### Etapa B — testes de equivalência

Criar dois bancos vazios:

1. banco A: aplicar `001..029`;
2. banco B: aplicar baseline consolidada.

Comparar:

- tabelas;
- colunas;
- enums;
- constraints;
- índices;
- functions;
- triggers;
- policies;
- buckets e storage policies.

### Etapa C — separar o legado

Renomear conceitualmente o script atual para um adaptador de migração legado e impedir que ele seja confundido com o novo importador CNEFE.

Estrutura sugerida:

```text
scripts/legacy/migrate-from-google-sheets.ts
packages/cnefe-transform/
packages/data-quality/
packages/territory-builder/
apps/installer/
```

A movimentação física dos arquivos deve ocorrer apenas em uma tarefa própria, com testes e sem quebrar o comando de migração existente.

### Etapa D — primeiro incremento implementável

Antes da interface do Installer, criar:

- contrato de entrada do CNEFE Transformer;
- contrato de saída normalizada;
- fixtures de uma amostra real pós-Power Query;
- teste de equivalência da transformação.

## Critérios de aceite da Fase 0

- Nenhum dado específico da congregação faz parte da baseline.
- O script legado está explicitamente classificado como adaptador, não como importador genérico.
- O estado final das migrations pode ser reproduzido em banco vazio.
- A instalação deixa de depender de copiar SQL manualmente.
- Existe estratégia de versionamento e rollback.
- O CNEFE Transformer pode ser desenvolvido sem gravar diretamente no Supabase.
- A evolução para áreas de trabalho não exige quebrar imediatamente o app estável.

## Decisão desta auditoria

O projeto não precisa ser reescrito para suportar o Installer. O núcleo atual deve ser preservado.

A implementação deve começar pela separação das responsabilidades e pela consolidação da baseline, mantendo compatibilidade com a instância em produção. O risco principal seria tratar `migrate-from-csv.ts` como solução genérica ou transformar todas as tabelas atuais de uma vez.
