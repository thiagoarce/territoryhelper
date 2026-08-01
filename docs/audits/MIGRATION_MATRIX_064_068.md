# Migration Matrix — 064–068

## Escopo

Leitura individual das migrations `064` a `068` na branch `main`, com classificação para a futura baseline do Installer.

## 064 — `tp_carrinho_inventario.sql`

**Responsabilidade:** cria o inventário por carrinho/equipamento do testemunho público, permitindo item de publicação ou descrição livre, quantidade, responsável e timestamp.

**Objetos:**

- tabela `tp_carrinho_inventario`;
- índice por `carrinho_id`;
- RLS;
- leitura para qualquer autenticado;
- escrita completa apenas para admin.

**Classificação:** schema funcional canônico, condicionado ao módulo opcional de testemunho público.

**Baseline:** incluir somente se esse módulo fizer parte do produto-base ou como migration modular opcional. Não pertence ao núcleo geográfico do Installer.

**Riscos/observações:**

- a policy de leitura é ampla para todos os autenticados;
- o `check` exige `publicacao_id` ou `descricao`, mas permite ambos simultaneamente;
- faltam limites explícitos para `descricao` e validação de `qtd >= 0`.

## 065 — `campanha_metas_pessoais.sql`

**Responsabilidade:** checklist pessoal do publicador dentro de uma campanha.

**Objetos:**

- tabela `campanha_metas_pessoais`;
- índice por campanha e publicador;
- RLS de leitura e escrita pelo próprio dono ou admin.

**Classificação:** schema funcional canônico do módulo de campanhas.

**Baseline:** incluir no módulo de campanhas, não no núcleo mínimo geográfico.

**Riscos/observações:**

- policy de `for all` está coerente com propriedade da linha;
- precisa de limite de tamanho para `texto`;
- não há ordenação explícita nem campo de conclusão temporal, decisão de produto e não falha estrutural.

## 066 — `tce_multiplo_por_arranjo.sql`

**Responsabilidade:** substitui o vínculo singular de TCE em arranjo por uma coleção `tces_ids` e redefine `territorio_publico()`.

**Objetos/alterações:**

- adiciona `arranjos.tces_ids text[]`;
- executa backfill de `tce_id` para o array;
- mantém `tce_id` como coluna legada;
- redefine a RPC `territorio_publico()`.

**Classificação:** evolução absorvida + backfill histórico + redefinição posteriormente substituída.

**Baseline:**

- não executar o backfill em instalação nova;
- não incluir a versão da RPC desta migration, pois foi substituída por `078`, `080` e `082`;
- decidir se o estado final continuará com array de IDs ou migrará para junção relacional N:N;
- não carregar `tce_id` legado em uma baseline nova sem justificativa de compatibilidade.

**Riscos/observações:**

- `text[]` de FKs não garante integridade referencial por elemento;
- coexistência de `tce_id` e `tces_ids` cria duas representações possíveis;
- é um forte candidato à consolidação em tabela de junção na arquitetura futura, mas isso exige adaptação do app e não deve ser feito silenciosamente.

## 067 — `tce_designacao_pessoal.sql`

**Responsabilidade:** permite designar TCE a um publicador e repartir TCE por parte de arranjo; também corrige autorização de conclusão de TCE.

**Objetos/alterações:**

- tabela de junção `designacao_tces`;
- índice por `tce_id`;
- RLS da junção;
- coluna `arranjo_partes.tces_ids`;
- policies adicionais em `tces` e `tce_unidades`;
- policy de update para conclusão pelo publicador responsável.

**Classificação:** schema funcional canônico + correção de RLS.

**Baseline:** absorver o estado final diretamente, sem reproduzir a ausência anterior da policy de update.

**Riscos/observações:**

- as policies verificam apenas `designacoes.publicador_id`; precisam ser confrontadas com o modelo multi-publicador criado anteriormente;
- `arranjo_partes.tces_ids` repete o padrão de array sem FK por elemento;
- a policy de update em `tces` permite alterar qualquer coluna da linha alcançável, salvo se houver trigger de guarda posterior. Isso precisa entrar no plano de testes de RLS.

## 068 — `tp_aprovacao.sql`

**Responsabilidade:** adiciona ao perfil a aprovação para participação no testemunho público.

**Objetos:**

- coluna `profiles.tp_aprovado boolean not null default false`.

**Classificação:** schema canônico do módulo de testemunho público.

**Baseline:** incluir apenas quando o módulo TP estiver habilitado; para instalações novas, o default `false` é seguro.

**Riscos/observações:**

- depende das policies de `profiles` realmente impedirem autoaprovação;
- deve haver teste garantindo que publicador comum não altera `tp_aprovado`.

## Cadeias de evolução identificadas

### TCE em arranjos e designações

```text
modelo singular (`tce_id`)
→ 066: coleção `tces_ids`
→ 067: designação pessoal e partes de arranjo
→ 070/072: integração posterior com quadras/partes
→ 078/080/082: compartilhamento público final
```

A baseline deve representar apenas o estado final dessa cadeia.

### Módulos opcionais

`064` e `068` pertencem ao testemunho público. `065` pertence a campanhas. Esses objetos não devem ser confundidos com requisitos obrigatórios para importar KML e CNEFE.

## Próximo bloco

Completar `069–077`, com atenção especial a:

- reserva de território pessoal;
- views de TCE e contagens;
- infraestrutura de backup;
- relato de posição incorreta;
- índices de auditoria.
