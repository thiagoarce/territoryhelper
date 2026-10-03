# ADR 0005 — Baseline separada do histórico legado

- Status: aceito
- Data: 2026-08-01

## Contexto

As migrations `001–090` registram a evolução gradual da instância original. A sequência inclui ideias substituídas, correções, backfills, limpezas e dados que não pertencem a uma instalação genérica.

Continuar esse histórico no branch do Installer confundiria dois objetivos: atualizar a instância original e criar um caminho limpo para novas congregações.

## Decisão

- `supabase/migrations/001–090` é o histórico legado da instância original;
- esse histórico permanece disponível para auditoria e manutenção, mas não é o caminho de instalação de uma nova congregação;
- novas instalações usarão uma sequência curta e separada em `supabase/baseline/`;
- a baseline criará diretamente o estado final, seguida apenas das migrations incrementais publicadas depois de sua versão;
- seeds, importações CNEFE/KML e backfills ficam fora da baseline estrutural;
- achados descobertos durante a auditoria viram requisitos e testes da baseline, não migrations `091`, `092` e seguintes neste branch.

## Consequências

- uma congregação nova não reproduz tentativas, vulnerabilidades ou dados históricos da instância original;
- a instância original pode continuar recebendo correções em um fluxo de manutenção próprio, quando isso for solicitado explicitamente;
- o Installer precisa conhecer a versão da baseline e o ponto inicial das migrations incrementais;
- a equivalência com o app é comportamental, não uma cópia literal do catálogo legado;
- diferenças deliberadas de autorização e segurança devem ser registradas e testadas.

## Alternativas rejeitadas

- executar `001–090` em toda nova instalação;
- reescrever ou renumerar o histórico já aplicado;
- continuar adicionando patches da instância original ao branch do Installer;
- misturar schema, seeds e dados territoriais num único arquivo.
