# Territory Installer — Visão

## Objetivo

Transformar o Territory Helper em uma aplicação **single-tenant, auto-hospedável e replicável**, que cada congregação possa instalar em sua própria infraestrutura usando o mesmo repositório.

Cada instalação terá seu próprio:

- projeto Supabase;
- banco PostgreSQL/PostGIS;
- autenticação e usuários;
- armazenamento;
- aplicação publicada na Cloudflare;
- dados territoriais.

O projeto não será, inicialmente, um SaaS multi-tenant. Não haverá banco compartilhado entre congregações nem necessidade de `congregacao_id` em todas as tabelas.

## Proposta de valor

Uma congregação deve conseguir sair de arquivos territoriais brutos para uma instância operacional do Territory Helper por meio de um assistente guiado.

Entradas principais:

1. KML oficial do território;
2. arquivos CSV do CNEFE/IBGE dos municípios abrangidos;
3. credenciais de uma instância vazia do Supabase;
4. credenciais/configuração de deploy na Cloudflare;
5. dados complementares específicos do modo de operação.

Saídas esperadas:

- território validado;
- endereços filtrados espacialmente;
- áreas de trabalho propostas;
- quadras urbanas geradas quando possível;
- áreas rurais e pontos isolados identificados;
- endereços associados às áreas de trabalho;
- pendências apresentadas para revisão;
- banco inicial publicado;
- aplicação pronta para uso.

## Modos iniciais

### Congregação territorial

O onboarding deve priorizar:

- divisão do território em quadras e outras áreas de trabalho;
- associação dos endereços às áreas;
- identificação e configuração de prédios e condomínios;
- importação da base inicial sem depender de planilhas específicas da instalação original.

### Congregação de idioma

O onboarding deve acrescentar:

- importação de endereços de idioma já conhecidos;
- reconciliação desses registros com os endereços do CNEFE;
- armazenamento do idioma e do histórico em entidade separada do endereço;
- controle visual do censo por quadra ou área;
- manutenção de cartões e revisitas sem duplicar o cadastro geográfico.

### Território rural

O sistema não deve pressupor que toda unidade de trabalho seja uma quadra urbana.

Devem ser suportadas unidades como:

- quadra urbana;
- área rural;
- povoado ou localidade;
- rota;
- trecho de estrada;
- condomínio;
- ponto isolado.

## Princípios

1. **A aplicação estável continua funcionando durante a evolução.**
2. **Toda geração geográfica produz propostas, não alterações definitivas.**
3. **A revisão humana é obrigatória para resultados ambíguos.**
4. **O pipeline geoespacial é substituível.** Turf, Shapely, GeoPandas, OSMnx ou outras ferramentas são detalhes de implementação.
5. **Dados específicos da congregação não pertencem às migrations de schema.**
6. **CNEFE é uma semente inicial, não a fonte permanente da verdade.**
7. **Novos endereços e correções feitos no campo devem ser preservados.**
8. **O instalador deve reduzir suporte técnico, não apenas documentar comandos.**
9. **Processamento pesado deve ocorrer localmente ou em um worker especializado, sem sobrecarregar a aplicação operacional.**
10. **Nenhum agente ou pipeline grava milhares de registros sem pré-visualização e confirmação.**

## Critério de sucesso de longo prazo

Uma pessoa com familiaridade básica com computador deve conseguir:

1. criar as contas necessárias;
2. abrir o instalador;
3. fornecer KML e CSVs;
4. revisar o mapa gerado;
5. configurar os dados específicos do seu modo de operação;
6. publicar a instância;
7. começar a usar o Territory Helper sem editar código-fonte.
