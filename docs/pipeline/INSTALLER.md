# Installer

## Responsabilidade

O Installer coordena a criação de uma nova instância. Ele não deve concentrar regras de transformação CNEFE nem algoritmos geográficos; apenas orquestrar módulos especializados.

## Fluxo

1. Verificar ambiente e conectividade.
2. Configurar e validar as contas próprias de Supabase e Cloudflare.
3. Aplicar a baseline separada e somente as migrations posteriores ao seu marco.
4. Criar administrador inicial.
5. Receber o KML, descobrir os municípios interceptados e obter ou validar os CSVs CNEFE.
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
- credenciais privilegiadas não são aceitas como argumentos do fluxo guiado, evitando histórico do shell;
- o token Cloudflare e a connection string PostgreSQL permanecem somente no ambiente local e não entram no estado retomável;
- a chave administrativa do Supabase é enviada ao Worker como secret de runtime, não incorporada ao bundle do cliente;
- publicação em massa exige confirmação;
- a aprovação sela o manifesto e todos os artefatos publicáveis; qualquer alteração posterior invalida o pacote;
- logs não devem expor credenciais;
- cada estágio deve ser retomável.

Na preparação CNEFE, todas as linhas fora do KML entram nas contagens, mas apenas uma amostra configurável é gravada em `enderecos-fora.json`. Isso evita pacotes de centenas de megabytes sem reduzir a auditoria quantitativa.

O comando `configure` executa um pré-voo somente de leitura: valida a chave pública e a chave administrativa do Supabase, a conexão PostgreSQL e a disponibilidade do PostGIS, além do API Token restrito à conta Cloudflare. Os artefatos públicos retomáveis ficam em `.territory-installer/`, ignorado pelo Git. O comando `deploy --confirm` cria um arquivo de secrets temporário, gera o build, publica o Worker, apaga o arquivo mesmo em caso de falha e testa a URL retornada.

O comando `discover` cruza o KML primeiro com a malha das UFs e depois somente com as malhas municipais relevantes do IBGE. O modo `prepare --auto-cnefe` resolve os ZIPs no diretório municipal oficial, exige confirmação antes de baixar, aceita apenas o CSV esperado dentro de cada ZIP, valida `COD_MUNICIPIO`, calcula hashes e reutiliza o cache local. O GeoJSON CNEFE pode servir para auditoria espacial, mas o CSV permanece canônico porque preserva os componentes e indicadores usados na classificação.

O GeoJSON opcional de áreas pode descrever vários territórios e suas quadras. Cada quadra referencia um território e deve permanecer dentro do KML, admitindo apenas a tolerância explícita configurada para diferenças de precisão. A associação espacial é determinística: um local recebe uma quadra somente quando está contido em exatamente um polígono; zero ou múltiplas correspondências são registradas em `pendencias.json`.

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
