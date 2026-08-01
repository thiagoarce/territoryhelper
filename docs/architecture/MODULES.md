# Módulos da Plataforma

## Objetivo

Separar responsabilidades para que ingestão de dados, geoprocessamento, instalação e operação diária possam evoluir sem acoplamento excessivo.

## 1. CNEFE Transformation Engine

Responsável por:

- ler arquivos CNEFE suportados;
- reconhecer versão, esquema e dicionários;
- selecionar colunas úteis;
- traduzir códigos;
- preservar valores originais;
- gerar valores normalizados;
- validar coordenadas e campos mínimos;
- produzir registros normalizados e relatório de qualidade.

Não deve:

- conhecer Supabase;
- publicar diretamente no banco operacional;
- gerar quadras;
- decidir fluxo de interface.

## 2. Data Quality Engine

Responsável por funções reutilizáveis de:

- normalização de logradouros;
- normalização de números e complementos;
- comparação aproximada;
- detecção de duplicidades;
- classificação de confiança;
- preservação do valor original.

Esse módulo pode ser usado pelo CNEFE Transformation Engine, pela reconciliação de endereços de idioma e por importações futuras.

## 3. Territory Builder

Responsável por:

- validar KML;
- recortar dados pelo território;
- obter malha viária e outras referências geográficas;
- gerar propostas de áreas de trabalho;
- associar endereços às áreas;
- detectar pendências geográficas;
- produzir artefatos intermediários para revisão.

A tecnologia é substituível. Turf, GEOS, Shapely, GeoPandas, OSMnx ou PostGIS são detalhes de implementação.

## 4. Review Workspace

Responsável pela revisão humana antes da publicação.

Deve permitir:

- visualizar valores brutos e transformados;
- revisar códigos não reconhecidos;
- unir, dividir, excluir e redesenhar áreas;
- corrigir associações de endereços;
- confirmar prédios e condomínios;
- revisar endereços de idioma reconciliados;
- aprovar explicitamente o pacote final.

## 5. Installer

Responsável por orquestrar o fluxo completo:

1. verificar ambiente;
2. conectar Supabase;
3. aplicar a baseline separada e migrations posteriores ao seu marco;
4. receber arquivos;
5. executar os módulos especializados;
6. apresentar revisão;
7. publicar dados aprovados;
8. configurar deploy;
9. gerar relatório da instalação.

O Installer não deve duplicar regras de transformação ou geoprocessamento.

## 6. Territory Helper

Aplicação operacional usada diariamente.

Responsável por:

- autenticação;
- gestão de territórios e áreas;
- designações;
- trabalho de campo;
- prédios, unidades e cartas;
- campanhas;
- registros e histórico;
- manutenção dos dados após a instalação.

## 7. Adaptadores de infraestrutura

Devem isolar integrações com:

- Supabase;
- Cloudflare;
- OpenStreetMap/Overpass;
- armazenamento de arquivos;
- futuras fontes geográficas.

## Regra de dependência

A direção preferencial é:

```text
Installer -> módulos de domínio -> adaptadores
Territory Helper -> domínio operacional -> adaptadores
```

O domínio não deve depender diretamente da interface, do deploy ou de um provedor específico quando isso puder ser evitado.
