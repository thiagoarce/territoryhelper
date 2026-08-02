# Territory Installer — Especificação

## Escopo

O Territory Installer será um assistente local para preparar uma nova instalação do Territory Helper. A primeira versão pode ser iniciada por comando e abrir uma interface no navegador. O empacotamento como executável será avaliado depois que o fluxo estiver estável.

O instalador não substitui o aplicativo operacional. Ele prepara a infraestrutura, processa os dados iniciais e publica o resultado aprovado.

## Experiência-alvo

Fluxo esperado para o usuário:

1. abrir o instalador;
2. configurar e testar Supabase;
3. informar os dados da congregação;
4. escolher o modo de operação;
5. enviar o KML e permitir a obtenção automática dos CSVs CNEFE, ou fornecê-los manualmente;
6. processar território, endereços e áreas;
7. revisar pendências no mapa;
8. completar dados específicos;
9. publicar no banco;
10. configurar ou executar o deploy.

## Etapas

### 1. Verificação do ambiente

Validar:

- sistema operacional suportado;
- espaço em disco;
- conexão com a internet;
- acesso aos serviços externos necessários;
- versões e dependências quando executado em modo de desenvolvimento;
- permissões de leitura e escrita no diretório de trabalho.

A interface deve apresentar diagnósticos compreensíveis, sem depender da leitura de logs de terminal.

### 2. Configuração da instalação

Coletar:

- nome exibido da congregação;
- cidade e estado principais;
- fuso horário;
- modo de operação: territorial ou idioma;
- módulos inicialmente habilitados;
- domínio ou nome desejado para o deploy.

Segredos nunca devem ser gravados em arquivos versionados.

### 3. Conexão com Supabase

Coletar e testar:

- URL do projeto;
- chave pública necessária ao aplicativo;
- credencial administrativa necessária apenas ao instalador local;
- disponibilidade de PostgreSQL/PostGIS;
- permissões suficientes para aplicar o schema e importar dados.

O instalador deve interromper a publicação em caso de conexão inválida ou privilégios insuficientes.

### 4. Preparação do banco

A instalação nova deve usar uma baseline limpa e somente as migrations publicadas depois do marco dessa baseline.

`supabase/migrations/001–090` é o histórico legado da instância original. O Installer não deve executar, copiar nem continuar essa sequência. Achados da auditoria entram diretamente na baseline separada, conforme o [`ADR 0005`](../adr/0005-separate-installation-baseline.md).

`supabase/baseline/` já existe como candidata do piloto e passou pelo smoke test executável em banco vazio. Ela continua marcada como piloto até a equivalência com o Power Query e uma instalação acompanhada por outra congregação; o Installer exige confirmação explícita e nunca improvisa com o histórico legado.

A baseline não pode conter:

- territórios da instalação original;
- quadras ou endereços específicos;
- usuários reais;
- histórico operacional;
- dados de campanhas ou designações;
- nomes de prédios particulares.

O instalador deve registrar a versão do schema aplicada e permitir reexecução idempotente ou retomada segura.

A baseline deve nascer com o contrato de autorização e usabilidade descrito em [`../architecture/AUTHORIZATION_AND_USABILITY.md`](../architecture/AUTHORIZATION_AND_USABILITY.md), sem reproduzir policies intermediárias apenas para corrigi-las depois.

### 5. Importação dos arquivos territoriais

Entradas obrigatórias:

- um KML oficial;
- acesso aos CSVs CNEFE/IBGE, obtidos automaticamente do diretório oficial ou fornecidos manualmente.

Validações mínimas:

- KML legível e com geometria válida;
- sistema de coordenadas reconhecido;
- CSV com colunas mínimas identificáveis;
- latitude e longitude válidas;
- detecção de arquivos duplicados;
- cruzamento do KML com a malha municipal antes do download;
- confirmação explícita, cache, validação do município e hash dos arquivos baixados;
- relatório de linhas descartadas ou corrigidas.

### 6. Processamento geoespacial

O pipeline deve:

- extrair e normalizar o limite territorial;
- combinar os CSVs;
- filtrar endereços dentro do território;
- obter dados viários e geográficos auxiliares;
- propor áreas de trabalho;
- gerar quadras urbanas quando a topologia permitir;
- preservar finalidades independentes para pregação regular e censo de idioma;
- associar endereços às áreas;
- identificar exceções.

O resultado deve ser salvo em um pacote intermediário antes de qualquer escrita definitiva.

### 7. Revisão visual

O mapa deve permitir, progressivamente:

- aprovar ou excluir uma área;
- editar vértices;
- dividir e unir áreas;
- criar área manualmente;
- mover endereço para outra área;
- tratar endereço sem área;
- classificar área como urbana, rural, rota, localidade, condomínio ou ponto isolado;
- revisar alertas de sobreposição e geometrias suspeitas.

A primeira versão pode oferecer somente aprovação, exclusão e correções básicas, desde que as pendências sejam claramente exportáveis.

Áreas sugeridas não participam de designações nem recebem endereços. A aprovação de uma área de censo de idioma também não a transforma em quadra de pregação regular; as duas malhas podem coexistir e se sobrepor.

### 8A. Complementação territorial

Para congregação territorial:

- detectar candidatos a prédio ou condomínio;
- agrupar unidades pelo mesmo número, complemento ou proximidade;
- sugerir nomes encontrados em fontes permitidas;
- permitir nomeação manual;
- vincular entradas, blocos e unidades;
- registrar a origem e a confirmação do nome.

A ausência de nomes de condomínios não deve bloquear a publicação inicial.

### 8B. Complementação de idioma

Para congregação de idioma:

- importar endereços previamente conhecidos;
- normalizar logradouro, número e complemento;
- buscar correspondências exatas, aproximadas e espaciais;
- classificar o nível de confiança;
- exigir revisão de ambiguidades;
- criar registros de idioma separados do endereço-base.

O endereço não deve receber um booleano permanente de “estrangeiro”. O vínculo deve representar idioma, status e histórico.

### 9. Publicação

Antes de publicar, apresentar um resumo:

- total de endereços lidos;
- total dentro do território;
- total de áreas propostas e aprovadas;
- endereços sem área;
- áreas sem endereço;
- geometrias suspeitas;
- prédios/condomínios pendentes;
- registros de idioma vinculados e não vinculados.

A publicação deve ocorrer em lotes, com transações ou estratégia de retomada, proteção contra duplicidade e relatório final.

### 10. Deploy

O piloto já gera uma configuração local isolada, valida o token Cloudflare e pode executar build, envio de secrets e deploy após confirmação. O fluxo deve evoluir para uma interface local que também permita:

- configurar variáveis de ambiente;
- criar secrets;
- executar build;
- publicar na Cloudflare;
- exibir a URL final;
- testar a tela de login e a leitura básica do banco.

O usuário continua responsável por criar as próprias contas e o projeto Supabase vazio. O instalador não recebe credenciais do mantenedor e não centraliza dados. Segredos não são aceitos em argumentos do assistente guiado; o token Cloudflare e a connection string permanecem apenas no ambiente local, enquanto a chave administrativa do Supabase é configurada como secret de runtime do Worker.

## Artefatos intermediários

O processamento deve produzir uma pasta semelhante a:

```text
output/
├── manifest.json
├── territorio.geojson
├── areas_trabalho.geojson
├── enderecos.parquet
├── associacoes.parquet
├── pendencias.json
└── relatorio.html
```

O manifesto deve registrar versões, hashes dos arquivos de entrada, parâmetros e estatísticas para permitir auditoria e reexecução.

## Requisitos não funcionais

- não expor credenciais administrativas no frontend publicado;
- não enviar arquivos brutos a terceiros sem aviso explícito;
- suportar retomada após falha;
- manter logs técnicos e mensagens amigáveis separadamente;
- nunca exibir `404`, `405`, mensagens SQL, nomes de policies ou respostas cruas do PostgREST como mensagem principal;
- impedir sucesso visual quando uma escrita afetar zero linhas;
- não carregar todos os polígonos ou endereços no navegador operacional de uma vez;
- usar consultas espaciais e carregamento por viewport;
- preservar identificadores de origem quando disponíveis;
- tornar operações destrutivas explícitas e reversíveis antes da publicação.

## Contrato operacional da instância criada

- publicadores podem manter dados operacionais com efeito imediato e curadoria posterior;
- exclusões operacionais preservam informação suficiente para reversão;
- publicadores com designação pessoal ativa podem concluir as quadras designadas;
- dirigente e admin possuem escopo global de conclusão;
- campos estruturais, privilégios e operações em massa permanecem protegidos;
- erros são traduzidos para linguagem de domínio, com detalhes técnicos apenas nos logs.

## Fora do escopo inicial

- SaaS multi-tenant;
- administração central de todas as congregações;
- sincronização automática de dados entre instalações;
- garantia de nomes de condomínios 100% automáticos;
- geração perfeita de quadras sem revisão;
- atualização automática da infraestrutura sem estratégia de versão e rollback.
