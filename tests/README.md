# Testes

Testes em Node puro (sem framework), rodando via `tsx` — resolvem o alias
`$lib` pelos paths do `.svelte-kit/tsconfig.json` gerado pelo SvelteKit.

```bash
npm test
```

(equivalente a `svelte-kit sync && tsx tests/run.ts` — o sync garante que
`.svelte-kit/tsconfig.json` existe antes de rodar)

Saída esperada: lista de testes com ✓/✗ e total. CI (`.github/workflows/
tests.yml`) roda em cada push.

## O que cobre

Como os testes rodam em Node puro sem acesso a um Supabase real, o foco é
lógica **pura** (sem I/O) que hoje mora em `$lib`:

- `posse.test.ts` — o helper único de posse de quadra
  (`$lib/server/posse.ts`), que centraliza a mesma decisão que a função
  SQL `pode_editar_local` (RLS) implementa em paralelo. O guard
  `exigirQuadraDesignada` só busca os booleans via query e delega a
  decisão pra esse helper — testado aqui sem precisar de banco.
- `data.test.ts` — regressão do bug "há -1 dias" (`$lib/utils/data.ts`).
- `campanhas.test.ts` — status derivado da campanha (planejada/em
  andamento/encerrada).
- `arranjos.test.ts` — expansão de ocorrências (arranjo pontual/
  recorrente, turno de TP) e cálculo de período (semana/mês/etc).

Não há testes de integração contra Supabase real (RLS, queries, actions
de `+page.server.ts`) — precisaria de um projeto Supabase de teste com
seed de dados, que não existe neste repo. Se popularmos um no futuro, o
próximo passo natural é testar as actions ponta-a-ponta.
