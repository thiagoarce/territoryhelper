# Template de Tarefa para Agentes

## Objetivo

Descreva o resultado concreto esperado.

## Contexto obrigatório

Leia:

- `docs/README.md`
- documentos de visão e domínio relacionados
- ADRs aplicáveis
- implementação atual afetada

## Escopo

Inclua somente:

- arquivos ou módulos autorizados;
- comportamento que deve ser criado ou alterado;
- dados de entrada e saída;
- limitações conhecidas.

## Fora de escopo

Liste explicitamente o que não deve ser alterado.

## Restrições

- preservar comportamento atual;
- não modificar a `main` diretamente;
- não criar migration sem auditoria prévia;
- não publicar dados em massa sem revisão;
- manter idempotência quando aplicável;
- preservar dados originais e correções humanas.

## Critérios de aceite

- [ ] implementação limitada ao escopo;
- [ ] testes ou fixtures adicionados;
- [ ] erros claros e acionáveis;
- [ ] documentação atualizada;
- [ ] nenhum segredo ou dado real versionado;
- [ ] comportamento anterior relevante validado.

## Entrega esperada

O agente deve apresentar:

1. resumo do que encontrou;
2. arquivos alterados;
3. decisões tomadas;
4. testes executados;
5. limitações e próximos passos.
