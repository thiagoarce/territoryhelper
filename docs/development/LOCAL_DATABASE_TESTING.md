# Testes locais do banco

## Objetivo

Este fluxo reconstrói um projeto Supabase descartável a partir das migrations do repositório e executa contratos pgTAP sobre o schema e a RLS resultantes.

Ele nunca deve ser apontado para o projeto de produção.

## Pré-requisitos

- Node.js compatível com o projeto;
- dependências instaladas com `npm ci`;
- Docker em execução;
- portas locais `54320–54323` disponíveis.

A versão da Supabase CLI usada pelos scripts está fixada no `package.json` para tornar o ambiente reproduzível.

## Fluxo completo

```bash
npm run db:start
npm run db:reset
npm run test:db
npm run db:stop -- --no-backup
```

### `db:start`

Inicializa os contêineres definidos por `supabase/config.toml`.

### `db:reset`

Apaga apenas o banco local descartável e reaplica, em ordem, todos os arquivos de `supabase/migrations`.

Este comando é a primeira validação importante da história: uma migration que dependa de dados manuais, de estado externo ou de uma etapa não versionada fará a reconstrução falhar.

### `test:db`

Executa os arquivos SQL em `supabase/tests/database` por meio do pgTAP.

Os primeiros contratos cobrem:

- existência de objetos canônicos;
- RLS habilitada em tabelas críticas;
- bloqueio de enumeração anônima de tokens;
- versão final de `territorio_publico(uuid)`;
- trigger e policy de conclusão de quadras;
- autoria e limites de telemetria.

Esses contratos caracterizam o legado `001–090`. Requisitos novos da baseline, como a guarda corrigida de campos privilegiados, conclusão por designação pessoal e curadoria reversível, terão testes próprios quando `supabase/baseline/` existir.

### `db:stop`

Encerra os contêineres e remove o estado local sem produzir backup.

## Testes TypeScript complementares

```bash
npm test
```

O runner TypeScript não substitui o pgTAP. Ele valida propriedades do próprio histórico SQL, como:

- sequência e duplicidade de números;
- presença de hardenings obrigatórios;
- ausência de redefinições posteriores inesperadas no histórico `001–090`.

A combinação é deliberada:

```text
contrato estático das migrations
+
contrato comportamental no PostgreSQL
```

## Integração contínua

O workflow `.github/workflows/database-contract.yml` executa:

1. `npm ci`;
2. `npm test`;
3. inicialização do Supabase local;
4. reconstrução pelas migrations;
5. contratos pgTAP;
6. encerramento dos contêineres.

A baseline futura só deve ser considerada equivalente quando esse pipeline puder executar contra dois caminhos:

```text
histórico legado 001–090
baseline consolidada + incrementais
```

Os dois bancos devem ser compatíveis com o aplicativo. A baseline pode ser deliberadamente diferente quando corrige um risco, uma limitação de usabilidade ou uma ideia histórica substituída, desde que a diferença esteja documentada e testada.

## Diagnóstico de falhas

### Falha em `db:start`

Normalmente indica Docker indisponível, porta ocupada ou impossibilidade de baixar uma imagem.

### Falha em `db:reset`

Indica problema na aplicação sequencial das migrations. O primeiro arquivo SQL citado no log deve ser tratado como a causa inicial; erros posteriores podem ser apenas cascata.

### Falha em `test:db`

Indica que o estado final reconstruído não cumpre um contrato declarado. Não alterar o teste para refletir acidentalmente um comportamento inseguro. Primeiro decidir se o contrato ou o schema está incorreto.

## Dados de teste

Os contratos devem criar seus próprios usuários e registros dentro de transações encerradas com `ROLLBACK`.

Nunca usar:

- export da congregação;
- emails reais;
- endereços CNEFE reais;
- tokens de produção;
- chaves do projeto hospedado.

## Estado atual

A configuração, os testes e o workflow estão versionados. A execução bem-sucedida ainda precisa ser observada num runner com Docker e acesso às imagens necessárias; até isso ocorrer, os contratos são considerados implementados, mas não homologados.
