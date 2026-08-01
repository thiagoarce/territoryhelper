# Modelo Conceitual para Installer e Novos Modos

## Estado deste documento

Este documento orienta a evolução do modelo. Ele não autoriza renomear ou substituir imediatamente tabelas existentes. Toda mudança de schema deve partir de uma auditoria das migrations e consultas atuais.

## Princípio central

Separar:

- geografia relativamente estável;
- organização operacional;
- eventos e histórico;
- dados importados de fontes externas;
- dados confirmados ou corrigidos pelos usuários.

## Território

Representa o limite oficial recebido por KML.

Campos conceituais:

- identificador;
- nome;
- geometria;
- origem;
- hash do arquivo de origem;
- data de importação;
- metadados.

Uma instalação pode ter um ou mais componentes territoriais desconectados.

## Área de trabalho

Conceito genérico para uma unidade operacional exibida no mapa.

Tipos iniciais:

- `urban_block` — quadra urbana;
- `rural_area` — área rural;
- `route` — rota ou trecho;
- `locality` — povoado/localidade;
- `condominium` — área de condomínio quando usada operacionalmente;
- `isolated_point` — ponto isolado.

Campos conceituais:

- identificador;
- território;
- tipo;
- nome ou número;
- geometria;
- ativa;
- origem;
- confiança da geração;
- status de revisão;
- metadados.

### Compatibilidade

A tabela atual de quadras pode continuar como núcleo inicial. A generalização deve ser implementada apenas quando houver plano de migração e compatibilidade com o modo operacional existente.

## Endereço

Representa uma localização postal ou unidade visitável de origem geográfica.

Campos conceituais:

- identificador;
- identificador de origem CNEFE;
- logradouro;
- número;
- complemento;
- bairro/localidade;
- município;
- coordenada;
- origem;
- data de criação;
- data de atualização;
- flags de qualidade;
- área de trabalho principal, quando associada.

O banco operacional passa a ser a fonte da verdade após a importação. Endereços adicionados ou corrigidos por usuários não devem ser sobrescritos por sincronizações futuras.

## Local, prédio e condomínio

Representam agrupamentos operacionais de endereços ou unidades.

Campos conceituais:

- nome;
- tipo;
- endereço/entrada principal;
- geometria ou ponto da entrada;
- área de trabalho;
- origem do nome;
- nome confirmado;
- observações de acesso;
- status de revisão.

O sistema deve distinguir:

- candidato detectado automaticamente;
- local confirmado por usuário;
- registro marcado como “não é prédio”.

## Unidade

Representa apartamento, casa interna, sala, bloco/unidade ou outro destino dentro de um local agrupado.

A unidade pode estar vinculada a um endereço CNEFE, mas nem todo registro CNEFE corresponderá diretamente a uma unidade operacional.

## Ciclo de trabalho

Uma mesma área pode participar de diferentes ciclos:

- trabalho territorial regular;
- censo de idioma;
- campanha;
- revisão periódica;
- cartas.

O status de conclusão não deve ser um único campo global quando houver mais de um tipo de ciclo.

Campos conceituais:

- área;
- tipo do ciclo;
- início;
- conclusão;
- responsável;
- resultado resumido;
- próxima revisão;
- metadados.

O histórico deve ser append-only quando possível.

## Registro de idioma

Representa a informação de que uma pessoa, família ou unidade está relacionada a determinado idioma.

Não usar `endereco.estrangeiro = true`.

Campos conceituais:

- endereço ou unidade;
- idioma;
- status;
- data de identificação;
- última verificação;
- origem;
- confiança da reconciliação inicial;
- observações;
- ativo/inativo conforme regra de negócio.

Status possíveis devem ser definidos com quem usa o processo, evitando codificar prematuramente termos não confirmados.

## Importação

Cada execução do instalador deve possuir um registro de importação.

Campos conceituais:

- identificador;
- versão do pipeline;
- hashes das entradas;
- parâmetros;
- status;
- estatísticas;
- início e fim;
- usuário responsável;
- relatório;
- erro, quando houver.

## Proveniência

Entidades importadas devem guardar origem quando útil:

- `cnefe_2022`;
- `osm`;
- `user`;
- `legacy_import`;
- `generated`;
- outra fonte explicitamente identificada.

A proveniência não substitui confirmação humana. Um nome vindo do OSM pode continuar não confirmado.

## Reconciliação de endereços conhecidos

Para congregações de idioma, cada item importado deve produzir:

- correspondência exata;
- correspondência provável;
- múltiplos candidatos;
- nenhuma correspondência.

Guardar:

- registro de entrada original;
- endereço candidato;
- método de matching;
- score/confiança;
- decisão humana;
- data da decisão.

## Regras de integridade

1. Um endereço não pode ser associado automaticamente a mais de uma área principal sem gerar pendência.
2. Áreas não devem ultrapassar o território sem revisão explícita.
3. Geometrias inválidas não devem ser publicadas.
4. Identificadores CNEFE não devem ser duplicados na mesma importação.
5. Dados de usuário não devem ser apagados por nova importação.
6. Concluir uma área não deve apagar registros de idioma ou histórico anterior.
7. Nome sugerido de condomínio só se torna confirmado mediante ação explícita ou regra de confiança aprovada.
8. Credenciais e segredos não pertencem ao modelo persistido da aplicação.
