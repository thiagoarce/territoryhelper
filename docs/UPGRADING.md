# Atualizando uma instalação

## Instância original

A instância original conserva o histórico `supabase/migrations/001–090`. Não aplique a baseline sobre ela.

## Instalações novas

Instalações criadas pela baseline registram suas versões em `schema_versions`. Atualizações futuras devem ser migrations incrementais próprias da linha da baseline, pequenas e idempotentes. Nunca se deve reaplicar o legado para “alcançar” uma versão.

Antes de atualizar:

1. leia o changelog e as notas da versão;
2. faça backup do banco e do Storage;
3. teste numa cópia descartável;
4. execute os testes de fumaça dos papéis e fluxos usados pela congregação;
5. somente então atualize produção.

Durante o piloto, atualizações são acompanhadas. Não há ainda promessa de atualização automática sem supervisão.
