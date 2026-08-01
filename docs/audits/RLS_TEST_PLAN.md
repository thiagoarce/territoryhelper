# RLS Test Plan

## Objetivo

Definir testes reproduzíveis para provar que o estado final das políticas de Row Level Security protege os dados operacionais sem bloquear os fluxos legítimos de administrador, dirigente e publicador.

Este documento descreve o contrato esperado. A implementação dos testes deve ocorrer antes da criação da baseline consolidada, para que tanto o histórico completo de migrations quanto a futura baseline sejam validados pelo mesmo conjunto de cenários.

## Escopo confirmado do repositório

No estado atualmente visível da `main` e do branch `feat/territory-installer`, a sequência documentada vai de `001` a `029`, com ausência intencional ou histórica de `021`.

Não foi localizado um arquivo `030` nem uma sequência até `090`. Caso existam migrations adicionais fora dessas branches, em outro diretório ou ainda não enviadas ao GitHub, elas devem ser incorporadas à matriz antes de considerar a auditoria encerrada.

## Princípios

1. Cada teste deve executar com um papel realista: `anon`, `authenticated`, `service_role` ou usuário autenticado com perfil específico.
2. Não basta testar `SELECT`; devem ser verificados `INSERT`, `UPDATE` e `DELETE`.
3. Todo cenário permitido deve ter um cenário espelho negado.
4. Funções `SECURITY DEFINER` devem ser testadas separadamente das policies das tabelas.
5. Um teste não deve depender de dados de produção nem de IDs fixos.
6. O conjunto deve rodar em banco descartável e ser repetível.
7. O mesmo conjunto deve validar:
   - histórico completo de migrations;
   - baseline consolidada;
   - migrations incrementais posteriores.

## Perfis de teste

### Administrador

- perfil com `role = 'admin'`;
- acesso integral aos fluxos administrativos;
- pode criar, editar e remover dados operacionais conforme as regras do produto;
- pode executar RPCs administrativas autorizadas.

### Dirigente

- perfil com `role = 'dirigente'`;
- acesso às ações de campo e coordenação;
- pode operar designações, arranjos e delegações dentro do contrato atual;
- não deve receber poderes administrativos não previstos.

### Publicador A

- perfil com `role = 'publicador'`;
- possui uma designação aberta sobre uma quadra;
- possui eventualmente uma designação de cartas sobre um local;
- pode receber delegação temporária ativa.

### Publicador B

- perfil com `role = 'publicador'`;
- não possui vínculos com os objetos atribuídos ao Publicador A;
- é usado como controle negativo para detectar vazamento de autorização.

### Usuário autenticado sem perfil válido

- sessão autenticada sem linha correspondente utilizável em `profiles`, ou com papel inválido em fixture controlada;
- deve falhar de forma segura.

### Anônimo

- nenhuma sessão autenticada;
- somente fluxos explicitamente públicos podem funcionar, como token público de cartas quando válido.

## Fixtures mínimas

O banco de teste deve criar:

- um território;
- duas quadras distintas: `Q-A` e `Q-B`;
- um local em cada quadra;
- pelo menos duas unidades por local;
- uma designação aberta de `Q-A` para o Publicador A;
- uma designação aberta de `Q-B` para o Publicador B;
- uma designação de cartas de um local para o Publicador A;
- uma delegação temporária ativa de `Q-B` para o Publicador A;
- uma delegação expirada;
- um arranjo ativo com lista de locais;
- um arranjo inativo;
- um local pendente criado pelo Publicador A;
- um TCE com unidades associadas;
- uma campanha ativa e outra encerrada;
- token público válido, expirado e inexistente.

## Matriz de acesso principal

Legenda:

- `ALLOW`: operação deve funcionar;
- `DENY`: operação deve ser rejeitada pela RLS, privilégio ou validação da RPC;
- `CONTRACT`: depende de decisão explícita de produto e deve ser estabilizado antes da baseline.

| Recurso/operação | Admin | Dirigente | Publicador atribuído | Outro publicador | Anon |
|---|---:|---:|---:|---:|---:|
| Ler perfis necessários ao app | ALLOW | ALLOW limitado | ALLOW limitado | ALLOW limitado | DENY |
| Alterar próprio perfil permitido | ALLOW | CONTRACT | CONTRACT | CONTRACT | DENY |
| Alterar role de perfil | ALLOW | DENY | DENY | DENY | DENY |
| Ler territórios/quadras operacionais | ALLOW | ALLOW | ALLOW | ALLOW conforme produto | DENY |
| Criar/editar geometria de quadra | ALLOW | CONTRACT atual | DENY | DENY | DENY |
| Editar local de quadra designada | ALLOW | ALLOW | ALLOW | DENY | DENY |
| Editar unidade de local designado | ALLOW | ALLOW | ALLOW | DENY | DENY |
| Criar local não pendente em quadra designada | ALLOW | ALLOW | ALLOW | DENY | DENY |
| Criar local pendente próprio | ALLOW | ALLOW | ALLOW | ALLOW para o próprio registro | DENY |
| Aprovar local pendente | ALLOW | CONTRACT | DENY | DENY | DENY |
| Excluir local fora do próprio escopo | ALLOW | ALLOW conforme contrato | DENY | DENY | DENY |
| Operar designação própria | ALLOW | ALLOW coordenação | ALLOW somente trabalho de campo | DENY em objeto alheio | DENY |
| Editar local por designação de cartas | ALLOW | ALLOW | ALLOW | DENY | DENY |
| Editar local por delegação ativa | ALLOW | ALLOW | ALLOW | DENY | DENY |
| Editar local por delegação expirada | ALLOW | ALLOW | DENY | DENY | DENY |
| Acessar token público de cartas válido | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW limitado |
| Acessar token expirado/inválido | DENY ou resposta vazia segura | DENY ou resposta vazia segura | DENY ou resposta vazia segura | DENY ou resposta vazia segura | DENY |
| Executar `exec_sql` | service role apenas | DENY | DENY | DENY | DENY |
| Criar TCE por RPC | ALLOW | DENY conforme implementação atual | DENY | DENY | DENY |
| Salvar/juntar/dividir quadras por RPC | ALLOW | DENY conforme implementação atual | DENY | DENY | DENY |

## Testes críticos por migration

### `001`, `009` e `010` — perfis, recursão e search path

- usuário lê apenas o conjunto de perfis necessário ao aplicativo;
- alteração de `role` por não administrador falha;
- `is_admin()` não causa recursão de policy;
- funções `SECURITY DEFINER` possuem `search_path` fixo;
- objeto malicioso em schema alternativo não altera a resolução de nomes;
- `service_role` executa somente o que é explicitamente necessário.

### `008`, `026`, `027` e `029` — escopo de edição

A função final `pode_editar_local` deve ser testada como composição de quatro caminhos independentes:

1. designação de quadra aberta;
2. designação de cartas aberta;
3. delegação temporária ativa;
4. arranjo ativo aplicável.

Para cada caminho:

- acesso positivo isolado;
- acesso negativo sem vínculo;
- acesso negativo após encerramento/expiração;
- acesso negativo ao local vizinho;
- `UPDATE` do local;
- `INSERT`, `UPDATE` e `DELETE` de unidade;
- tentativa de trocar `local_id` ou `quadra_id` durante atualização para escapar do escopo.

### `014` — link público de cartas

- token válido retorna apenas o conteúdo necessário;
- token inválido não revela se o recurso existe;
- token expirado não permite leitura ou escrita;
- operações públicas não expõem dados pessoais, perfis ou outros locais;
- tentativa de enumerar tokens é mitigada pelo formato e pela resposta uniforme;
- token não concede acesso às tabelas fora da função ou view pública prevista.

### `015` e `025` — Storage

- leitura pública ocorre apenas nos buckets declarados públicos;
- upload, atualização e remoção exigem o papel correto;
- usuário não pode escrever em caminho de outro contexto por manipulação do nome do objeto;
- MIME type e tamanho devem ser validados na aplicação ou política complementar;
- bucket público não deve receber documentos sensíveis.

### `019` — conclusões append-only

- conclusão pode ser criada por papel autorizado;
- registro histórico não pode ser alterado silenciosamente;
- exclusão exige decisão explícita de produto;
- usuário não pode atribuir conclusão a outro usuário ou quadra fora do escopo.

### `022`, `023` e `024` — RPCs geográficas

- não administrador recebe erro de acesso;
- geometria inválida é rejeitada;
- SRID incorreto não é aceito silenciosamente;
- `MultiPolygon`, linha ou ponto são tratados segundo o contrato;
- IDs e nomes maliciosos não causam SQL injection;
- união não adjacente falha sem alterar dados;
- divisão inválida é transacional e não deixa a quadra parcialmente alterada;
- reassociação de locais após divisão respeita fronteiras e não perde pontos.

### `025` — arranjos

- leitura segue o contrato de visibilidade;
- somente papel autorizado cria ou altera modalidade;
- publicador não injeta IDs de locais ou quadras para ampliar seu escopo;
- arranjo inativo não concede edição;
- dirigente nulo em `cartas_lista` não deve conceder edição indiscriminada sem decisão explícita.

### `027` — delegações temporárias

- somente dirigente/admin cria delegação;
- dirigente não delega quadra fora do próprio escopo, caso essa seja a regra desejada;
- `data_fim` usa timezone da instância de forma previsível;
- delegação expirada perde efeito imediatamente;
- alteração do relógio da sessão não contorna a expiração;
- arrays com IDs inexistentes ou duplicados são tratados.

### `028` — local pendente

- publicador só cria pendente com `criado_por = auth.uid()`;
- tentativa de criar registro pendente em nome de outro usuário falha;
- publicador não transforma pendente próprio em aprovado;
- publicador não altera `criado_por` depois da criação;
- busca de proximidade não retorna pendentes;
- função de proximidade limita raio e quantidade com valores seguros.

## Testes de ataque e regressão

### Escalada por atualização de chave estrangeira

Um usuário autorizado a editar uma unidade não pode mudar `local_id` para um local fora do escopo e continuar com acesso.

Um usuário autorizado a editar um local não pode mudar `quadra_id` para obter associação indevida ou modificar outra área.

### Escalada por arrays

Campos como:

- `quadras_ids`;
- `cartas_locais_ids`;
- listas de delegação;

devem ser testados com IDs de objetos não autorizados, inexistentes, duplicados e arrays vazios.

### Escalada por função `SECURITY DEFINER`

Para cada função:

- verificar `EXECUTE` concedido por papel;
- verificar `search_path`;
- garantir validação interna de autorização;
- garantir que chamar a função não oferece acesso indireto a objetos não autorizados;
- verificar atomicidade em erro.

### Vazamento por views

Views GeoJSON e outras views devem respeitar o contrato de acesso das tabelas ou usar barreiras equivalentes. O teste deve confirmar que uma view não contorna RLS por ser de proprietário privilegiado.

### Realtime

Quando Realtime estiver habilitado:

- usuário recebe eventos apenas de linhas que poderia ler;
- mudança de designação ou expiração remove o acesso esperado;
- payload não revela colunas sensíveis.

## Ferramenta recomendada

Preferir testes SQL com `pgTAP` quando possível, complementados por testes de integração usando clientes Supabase autenticados com JWTs de usuários reais de fixture.

Estrutura sugerida:

```text
supabase/tests/
  helpers/
    auth.sql
    fixtures.sql
  rls/
    profiles.test.sql
    locais_unidades.test.sql
    designacoes.test.sql
    cartas_publicas.test.sql
    arranjos.test.sql
    delegacoes.test.sql
    storage.test.sql
    rpc_geografia.test.sql
  schema/
    contract.test.sql
```

Os testes de integração que dependem de Auth, Storage ou Realtime podem ficar em:

```text
tests/integration/supabase/
```

## Contrato para a baseline

A baseline consolidada só pode ser aceita quando:

1. todos os testes passam após aplicar o histórico completo;
2. todos os mesmos testes passam após aplicar apenas a baseline;
3. não existem diferenças inesperadas em policies, grants, funções e triggers;
4. `anon`, `authenticated` e `service_role` possuem exatamente os privilégios previstos;
5. não há função `SECURITY DEFINER` sem `search_path` fixo e autorização interna adequada;
6. cada fluxo positivo possui ao menos um teste negativo correspondente.

## Pendências de decisão

Antes da implementação final, precisam ser resolvidas:

- visibilidade global ou limitada de territórios e quadras para publicadores;
- quais alterações de próprio perfil são permitidas;
- se dirigente pode aprovar local pendente;
- se dirigente pode editar geometrias;
- se dirigente pode delegar somente quadras sob sua responsabilidade;
- efeito de arranjo com `dirigente_id` nulo sobre `pode_editar_local`;
- política de exclusão de histórico de conclusões;
- tratamento de pontos exatamente na fronteira de polígonos;
- timezone canônico da instância.

Essas decisões devem virar ADRs ou atualização da documentação de domínio antes de congelar a baseline.
