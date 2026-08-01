# ADR 0006 — Autorização orientada à usabilidade

- Status: aceito
- Data: 2026-08-01

## Contexto

Uma instância atende uma congregação com um grupo pequeno de usuários conhecidos. Regras excessivamente granulares aumentam a chance de bloqueios legítimos, sucesso falso e erros técnicos incompreensíveis, sem produzir benefício proporcional.

O produto também depende da participação direta dos publicadores na manutenção de locais, unidades e históricos.

## Decisão

A autorização será permissiva para o trabalho operacional e rígida nos limites estruturais.

- publicadores ativos podem adicionar, editar e excluir dados operacionais com efeito imediato e curadoria posterior;
- líder e participante de designação pessoal ativa podem concluir as quadras da designação;
- dirigente e admin possuem escopo global de coordenação e conclusão;
- alterações estruturais, privilégios, importações e operações destrutivas em massa permanecem protegidos;
- RLS funciona como cinto de segurança e não como substituto das regras de domínio;
- erros técnicos são registrados para diagnóstico, mas traduzidos em mensagens acionáveis para o usuário.

O contrato detalhado está em [`../architecture/AUTHORIZATION_AND_USABILITY.md`](../architecture/AUTHORIZATION_AND_USABILITY.md).

## Consequências

- curadoria não bloqueia o trabalho de campo;
- exclusões operacionais precisam ser reversíveis;
- autorização de conclusão não pode depender apenas do papel global;
- actions, helpers e policies devem compartilhar a mesma regra de pertencimento à designação;
- testes devem priorizar fluxos legítimos e ausência de sucesso falso, além dos cenários de negação;
- `404`, `405` e mensagens SQL não podem ser a experiência final do publicador.

## Alternativas rejeitadas

- exigir aprovação antes de toda alteração de campo;
- tornar locais e unidades administráveis apenas por admin;
- permitir conclusão somente por dirigente/admin;
- maximizar restrições de RLS sem considerar o fluxo real;
- exibir códigos HTTP ou mensagens do banco diretamente na interface.
