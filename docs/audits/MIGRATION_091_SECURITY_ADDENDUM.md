# Adendo de segurança — migration 091

## Contexto

A auditoria consolidada de `001–090` identificou como bloqueio a necessidade de testar `profiles_guard_sensitive()`. A investigação executável confirmou que a versão final histórica, definida em `044_servo_publicacoes.sql`, não deveria ser usada como contrato canônico.

Este documento registra a correção incremental aplicada por `091_profiles_sensitive_guard.sql`. Ele complementa, mas não reescreve, a auditoria histórica `001–090`.

## Falhas corrigidas

### Identificação incorreta do contexto privilegiado

A função histórica era `SECURITY DEFINER` e utilizava:

```sql
current_user in ('postgres', 'service_role')
```

Dentro de uma função `SECURITY DEFINER`, `current_user` representa o usuário efetivo da função, normalmente seu proprietário. Assim, uma função pertencente a `postgres` poderia interpretar uma chamada comum como privilegiada e retornar antes de verificar `is_admin()`.

A migration `091` deixa de usar `current_user`. O bypass operacional passa a depender de:

```sql
auth.uid() is null
```

Chamadas normais autenticadas possuem UID e continuam sujeitas à verificação administrativa. SQL direto, restaurações e chamadas de backend sem usuário final permanecem capazes de administrar perfis.

### Aprovação de testemunho público fora da guarda

A migration `068` acrescentou:

```text
profiles.tp_aprovado
```

A última guarda histórica protegia `role`, `ativo` e `servo_publicacoes`, mas não foi atualizada para incluir `tp_aprovado`. Como o usuário possui uma policy para atualizar o próprio perfil, a aprovação precisava ser protegida explicitamente no trigger.

A versão `091` protege os quatro campos privilegiados atuais:

- `role`;
- `ativo`;
- `servo_publicacoes`;
- `tp_aprovado`.

## Estado canônico após 091

`profiles_guard_sensitive()` deve obedecer ao seguinte contrato:

1. contexto sem UID de usuário final pode executar operações administrativas;
2. usuário autenticado comum pode alterar campos não privilegiados do próprio perfil, como `nome`;
3. usuário comum não pode promover sua role;
4. usuário comum não pode alterar seu estado ativo;
5. usuário comum não pode conceder a si mesmo a capacidade legada de publicações;
6. usuário comum não pode aprovar a si mesmo para testemunho público;
7. admin autenticado pode alterar esses campos por meio das policies existentes.

## Testes adicionados

### Contrato estático das migrations

`tests/migrations-security-contract.test.ts` agora:

- valida a sequência `001–091`, mantendo somente a lacuna histórica `021`;
- exige que a migration `091` use `auth.uid()`;
- exige a proteção dos quatro campos privilegiados;
- rejeita o uso de `current_user` na versão final da guarda.

### Contrato comportamental pgTAP

`supabase/tests/database/002_profiles_sensitive_fields.sql` cria usuários isolados e valida no PostgreSQL:

- alteração do próprio nome é permitida;
- autopromoção para admin é rejeitada;
- auto-desativação é rejeitada;
- autoatribuição de `servo_publicacoes` é rejeitada;
- autoaprovação de `tp_aprovado` é rejeitada;
- admin autenticado pode conceder `tp_aprovado`.

## Consequência para a baseline

A baseline consolidada nunca deve reproduzir as versões de `009`, `010` ou `044` para depois corrigi-las. Ela deve criar diretamente a versão final resultante da `091`, com testes comportamentais equivalentes.

A coluna `servo_publicacoes` e o helper `is_servo_pub()` continuam candidatos a remoção da baseline nova, porque a migration `060` tornou essa capacidade equivalente a admin. Essa decisão permanece condicionada à auditoria dos consumidores no aplicativo.

## Estado de validação

Os contratos estão versionados e integrados ao workflow `Database contract`. A execução ainda precisa ser confirmada num runner com Docker e acesso às imagens do Supabase. Até essa execução, os testes devem ser tratados como implementados, mas não como aprovados.
