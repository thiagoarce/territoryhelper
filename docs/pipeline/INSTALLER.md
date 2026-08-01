# Installer

## Responsabilidade

O Installer coordena a criação de uma nova instância. Ele não deve concentrar regras de transformação CNEFE nem algoritmos geográficos; apenas orquestrar módulos especializados.

## Fluxo

1. Verificar ambiente e conectividade.
2. Configurar Supabase e Cloudflare.
3. Aplicar a baseline separada e somente as migrations posteriores ao seu marco.
4. Criar administrador inicial.
5. Receber KML e CSVs CNEFE.
6. Executar o CNEFE Transformation Engine.
7. Executar o Territory Builder.
8. Exibir revisão e pendências.
9. Publicar os dados aprovados.
10. Publicar a aplicação e gerar relatório final.

## Modos

### Congregação territorial

Inclui revisão de prédios, condomínios e unidades.

### Congregação de idioma

Inclui importação e reconciliação de endereços já conhecidos, separados do cadastro geográfico.

### Território rural

Inclui propostas de rotas, localidades, áreas e pontos isolados.

## Experiência do usuário

O usuário não deve precisar compreender Git, Node, Python, PostGIS ou bibliotecas GIS. O instalador deve apresentar linguagem operacional e mensagens acionáveis.

O histórico legado `supabase/migrations/001–090` não é um caminho de instalação. A baseline piloto já está implementada em `supabase/baseline/`; o Installer só pode promovê-la como estável depois dos testes num Supabase vazio e da instalação acompanhada descritos no Quickstart.

Erros técnicos ficam nos diagnósticos. A interface nunca deve apresentar `404`, `405`, SQL ou nomes de policies como orientação ao usuário.

## Segurança

- segredos não entram no repositório;
- chaves de serviço são usadas apenas localmente ou em ambiente seguro;
- publicação em massa exige confirmação;
- logs não devem expor credenciais;
- cada estágio deve ser retomável.

## Relatório final

O instalador deve registrar:

- versão do código e do schema;
- arquivos e hashes usados;
- municípios e edição CNEFE;
- quantidade de registros lidos e publicados;
- áreas geradas;
- pendências restantes;
- módulos habilitados;
- data e resultado da instalação.
