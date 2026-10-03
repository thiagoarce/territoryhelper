# Territory Helper

Plataforma web self-hosted para organizar territórios, endereços, designações e trabalho de campo de uma congregação. Cada congregação mantém sua própria instância, seu próprio Supabase e seu próprio deploy.

> **Estado atual:** o aplicativo operacional é estável na instância original. A instalação reutilizável está em **piloto técnico guiado** no branch `feat/territory-installer`; ainda exige familiaridade básica com terminal, Supabase e Cloudflare.

## O que o piloto já oferece

- baseline curta e separada para um Supabase vazio;
- transformação versionada de CSVs do CNEFE, preservando dados brutos;
- leitura de KML, incluindo multipolígonos e áreas internas;
- filtro de endereços dentro do território, com pontos de fronteira incluídos;
- pacote intermediário revisável antes de qualquer publicação;
- publicação em lotes, retomável e protegida contra duplicação do mesmo pacote;
- autorização orientada à usabilidade e curadoria posterior;
- módulos ainda não instalados ocultos por configuração, sem menus vazios.

O piloto **não** promete geração automática perfeita das quadras, instalador Windows ou deploy Cloudflare totalmente automático. Quadras podem ser importadas/ajustadas com as ferramentas atuais enquanto o gerador OSM evolui.

## Começar

Leia o [Quickstart](QUICKSTART.md). O caminho novo é:

```text
Supabase vazio
→ supabase/baseline/000–080
→ KML + CSVs CNEFE
→ pacote local para revisão
→ aprovação explícita
→ publicação
→ deploy Cloudflare
```

As migrations históricas `supabase/migrations/001–090` pertencem à evolução da instância original. **Não as execute numa instalação nova.**

## Princípios do produto

- uma infraestrutura independente por congregação;
- usabilidade acima de restrições excessivas;
- publicadores podem registrar e corrigir o trabalho operacional imediatamente;
- alterações relevantes entram em curadoria, sem bloquear o campo;
- designações pessoais ativas autorizam seus líderes e participantes a concluir as respectivas quadras;
- dirigente e admin possuem escopo global;
- geometria, privilégios e operações em massa continuam protegidos;
- mensagens SQL, nomes de policies e erros HTTP crus não chegam ao usuário.

## Desenvolvimento

```bash
npm install
npm test
npm run check
npm run build
```

A documentação canônica começa em [docs/README.md](docs/README.md). Para contribuir, leia [CONTRIBUTING.md](CONTRIBUTING.md). Problemas de segurança seguem [SECURITY.md](SECURITY.md).

## Licença

GNU Affero General Public License v3.0 ou posterior. Consulte [LICENSE](LICENSE).
