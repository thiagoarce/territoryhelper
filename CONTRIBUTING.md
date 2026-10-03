# Contribuindo

Obrigado por ajudar o Territory Helper a servir outras congregações.

## Antes de alterar

1. Leia `docs/README.md` e `docs/agents/AGENT_GUIDE.md`.
2. Abra uma issue descrevendo o problema, principalmente para mudanças de banco ou domínio.
3. Nunca inclua dados reais de publicadores, endereços, KMLs, CSVs ou credenciais.
4. Mantenha decisões específicas da congregação fora do código; prefira configuração.

## Regras de compatibilidade

- `supabase/migrations/001–090` é legado imutável da instância original.
- novas instalações usam somente `supabase/baseline/`;
- transformações CNEFE exigem fixture anonimizada e teste;
- publicação em massa exige pré-visualização e aprovação;
- mudanças operacionais devem preservar edição imediata e curadoria posterior;
- erros técnicos devem ser traduzidos para linguagem de domínio.

## Validação mínima

```bash
npm test
npm run check
npm run build
```

Mudanças na baseline também precisam ser testadas num Supabase vazio e numa segunda aplicação idempotente. Descreva no pull request o cenário, os resultados e as limitações.

## Commits

Use mensagens claras que expliquem a intenção. Separe documentação, baseline e comportamento quando isso facilitar a revisão.
