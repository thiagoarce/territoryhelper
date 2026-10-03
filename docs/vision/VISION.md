# Visão do Territory Helper

## Missão

O Territory Helper é uma plataforma self-hosted para gerenciamento territorial de congregações das Testemunhas de Jeová.

Seu objetivo é transformar dados oficiais e arquivos territoriais em uma base operacional confiável, permitindo que cada congregação implante, mantenha e evolua sua própria instância com autonomia.

## Visão de produto

Uma congregação deve conseguir criar uma nova instância do Territory Helper utilizando apenas:

- o KML oficial do território;
- os arquivos CNEFE do IBGE dos municípios abrangidos;
- uma conta Supabase;
- uma conta Cloudflare;
- dados complementares específicos do seu modo de operação.

O sistema deve conduzir o restante do processo de forma guiada, reproduzível e revisável.

## O que a plataforma deve entregar

- transformação do CNEFE bruto em dados legíveis e operacionais;
- filtragem espacial dos endereços dentro do território;
- geração assistida de áreas de trabalho;
- identificação e configuração de prédios e condomínios;
- suporte a territórios urbanos, rurais e de idioma;
- revisão humana antes da publicação;
- configuração e publicação de uma instância funcional;
- manutenção contínua dos dados pelos usuários em campo.

## Módulos conceituais

### CNEFE Transformation Engine

Responsável por interpretar, selecionar, traduzir, normalizar e validar os arquivos CNEFE.

### Territory Builder

Responsável pelo processamento geográfico, geração de áreas de trabalho e associação espacial dos endereços.

### Installer

Responsável por orquestrar a preparação do banco, o pipeline de dados, a revisão e a publicação.

### Territory Helper

Aplicação operacional usada diariamente pela congregação.

## Modos de operação

A plataforma deve oferecer suporte a:

- congregações territoriais;
- congregações de idioma;
- territórios urbanos;
- territórios rurais;
- condomínios, prédios, localidades, rotas e pontos isolados.

As diferenças entre esses modos devem ficar concentradas na configuração e nos fluxos de trabalho, preservando um núcleo compartilhado.

## Modelo de implantação

O modelo inicial é single-tenant e self-hosted.

Cada congregação possui sua própria:

- aplicação;
- base PostgreSQL/PostGIS;
- autenticação;
- infraestrutura Supabase;
- implantação Cloudflare;
- configuração e dados territoriais.

Não existe banco compartilhado entre congregações nesta fase.

## Visão de longo prazo

O Territory Helper não deve ser apenas um aplicativo que exibe mapas.

Ele deve ser uma plataforma capaz de transformar dados públicos e conhecimento local em uma representação operacional do território, mantendo rastreabilidade, autonomia e controle humano sobre as decisões críticas.
