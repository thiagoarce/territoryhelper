# Segurança

## Como relatar

Não abra uma issue pública para vulnerabilidades, credenciais expostas ou vazamento de dados. Use o recurso **Security → Report a vulnerability** do repositório no GitHub.

Inclua, sem dados pessoais reais:

- versão/commit afetado;
- impacto observado;
- passos mínimos para reproduzir;
- sugestão de correção, se houver.

## Modelo de responsabilidade

Cada congregação opera sua própria infraestrutura e é responsável por contas, segredos, backups, atualizações e acesso ao Supabase/Cloudflare. A service role nunca deve chegar ao navegador nem ser commitada.

O projeto prioriza uma autorização proporcional ao contexto: o trabalho operacional é simples e auditável; privilégios, geometria e operações em massa permanecem protegidos. Relatórios de falha devem evitar nomes, endereços, tokens e payloads completos.

## Versões suportadas

Durante o piloto, somente o branch `feat/territory-installer` recebe correções do novo processo de instalação. O histórico `001–090` não é um caminho suportado para instalações novas.
