# Guia para Agentes — Territory Installer

## Antes de alterar código

Leia, nesta ordem:

1. `docs/installer/VISION.md`;
2. `docs/installer/INSTALLER_SPEC.md`;
3. `docs/installer/GEOPROCESSING_PIPELINE.md`;
4. `docs/installer/DATA_MODEL.md`;
5. `docs/installer/ROADMAP.md`;
6. README e migrations relevantes;
7. implementação atual afetada pela tarefa.

Não implemente com base apenas no título da tarefa.

## Regras de trabalho

1. Preserve o funcionamento da aplicação atual.
2. Não altere `main` diretamente.
3. Não misture dados específicos da congregação original com schema genérico.
4. Não reescreva migrations já aplicadas sem plano de compatibilidade.
5. Trate `supabase/migrations/001–090` como histórico legado. O caminho de novas instalações é `supabase/baseline/`.
6. Não crie `091`, `092` e seguintes neste branch para corrigir o legado; preserve o achado como requisito/teste da baseline, salvo tarefa explícita de manutenção da instância original.
7. Não introduza multi-tenancy; o modelo atual é single-tenant por instalação.
8. Não faça refatoração ampla sem necessidade demonstrada.
9. Não escolha biblioteca GIS por preferência. Registre os critérios e compare alternativas quando necessário.
10. Não grave resultados geográficos automáticos como definitivos sem revisão.
11. Não exponha service-role keys ou outros segredos ao cliente.
12. Não carregue uma cidade inteira no mapa operacional sem viewport, paginação ou estratégia de tiles.
13. Não represente idioma como propriedade permanente do imóvel.
14. Não force territórios rurais ao modelo de quadra urbana.
15. Preserve o trabalho operacional imediato de publicadores, com curadoria posterior.
16. Não reduza autorização contextual a papéis globais: designação pessoal ativa autoriza conclusão das quadras correspondentes.
17. Não apresente `404`, `405` ou erros internos crus ao usuário.

## Forma das tarefas

Cada tarefa deve declarar:

- objetivo;
- escopo permitido;
- arquivos ou módulos esperados;
- fora de escopo;
- critérios de aceite;
- testes necessários;
- riscos conhecidos.

Se houver ambiguidade que possa ser resolvida pela leitura do repositório, leia primeiro. Não peça ao usuário informações já presentes no código ou na documentação.

## Processo recomendado

### 1. Inspeção

- identifique implementação e contratos existentes;
- verifique migrations, tipos e chamadas relacionadas;
- documente acoplamentos que possam afetar a mudança.

### 2. Plano curto

Antes de editar, registre:

- abordagem;
- arquivos afetados;
- compatibilidade;
- testes.

### 3. Implementação incremental

- mantenha commits pequenos e intencionais;
- evite arquivos gigantes;
- prefira funções puras no pipeline;
- isole I/O, chamadas externas e transformação geométrica;
- produza artefatos intermediários inspecionáveis.

### 4. Validação

- execute os testes relevantes;
- valide tipos e build;
- para GIS, registre contagens e invariantes;
- compare resultados com fixture conhecida;
- verifique que não houve alteração acidental da aplicação operacional.

### 5. Relatório

Ao terminar, informe:

- o que mudou;
- por que mudou;
- o que foi validado;
- limitações;
- próxima etapa recomendada.

## Invariantes do pipeline

- nenhuma geometria inválida é publicada;
- áreas publicadas ficam dentro do território, salvo exceção revisada;
- um endereço recebe no máximo uma área principal automática;
- arquivos de entrada são identificados por hash;
- reexecuções não criam duplicação silenciosa;
- dados manuais existentes são preservados;
- resultados ambíguos geram pendência;
- toda sugestão de nome possui origem e confirmação separadas.

## Estratégia de protótipo GIS

Um protótipo deve:

- usar dados reais ou fixture derivada e anonimizada;
- medir qualidade, memória e tempo;
- exportar GeoJSON para inspeção;
- não alterar o banco de produção;
- comparar pelo menos uma alternativa quando a decisão tecnológica for estrutural.

## Critério para concluir uma fase

Não considere uma fase concluída apenas porque o caminho feliz funciona. Verifique:

- arquivos inválidos;
- KML com múltiplas partes;
- CSVs de municípios diferentes;
- coordenadas ausentes;
- endereços na borda;
- vias incompletas;
- áreas urbanas e rurais;
- retomada após falha;
- duplicidade de execução;
- mensagens compreensíveis ao usuário.

## Primeira tarefa de implementação sugerida

Auditar a instalação atual e produzir um relatório técnico sobre:

- migrations dependentes de dados específicos;
- capacidade de subir o schema do zero;
- scripts de importação existentes;
- formato real das entidades geográficas;
- caminho mínimo para uma baseline limpa.

Essa tarefa deve ser concluída antes da criação de novas tabelas ou de um instalador visual completo.

A auditoria documental de `001–090` já foi concluída. A próxima tarefa de banco é escrever os contratos de aceitação da baseline separada e, depois, sua sequência curta; não é continuar a numeração histórica.
