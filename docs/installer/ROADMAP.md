# Roadmap do Territory Installer

## Estratégia

A implementação será incremental. Cada fase deve produzir um resultado testável sem comprometer a aplicação estável.

Não iniciar pela automação completa. Primeiro estabelecer contratos, importação reprodutível e um caminho seguro para novas instalações.

## Fase 0 — Auditoria e baseline

Status: auditoria documental `001–090` concluída; baseline piloto aplicada e reaplicada com sucesso num Supabase vazio; pipeline local implementado. Permanecem pendentes a equivalência com o Power Query e o piloto acompanhado por outra congregação.

Objetivos:

- auditar migrations existentes;
- identificar migrations que misturam schema e dados específicos;
- mapear scripts atuais de importação;
- testar uma instalação vazia;
- definir baseline limpa para novas instâncias;
- documentar dependências e lacunas.

Limite da fase:

- `001–090` permanece como histórico legado da instância original;
- não criar `091`, `092` e seguintes neste branch para materializar achados da auditoria;
- transformar esses achados em requisitos e testes da baseline;
- usar um fluxo separado de manutenção quando a instância original precisar de patch incremental.

Critérios de aceite:

- banco vazio pode receber o schema sem dados da congregação original;
- migrations futuras continuam aplicáveis;
- instalação atual não é quebrada;
- relatório de auditoria aprovado.

## Fase 1 — Fundação do instalador

Objetivos:

- criar estrutura isolada para o instalador;
- implementar interface local mínima;
- verificar ambiente;
- coletar configuração não sensível;
- armazenar estado da sessão localmente;
- apresentar logs e erros amigáveis.

Critérios de aceite:

- instalador inicia sem modificar o app operacional;
- sessão pode ser retomada;
- nenhum segredo é versionado.

## Fase 2 — Supabase e schema

Objetivos:

- testar credenciais;
- validar PostGIS;
- aplicar a baseline separada e migrations posteriores ao seu marco;
- criar ou orientar o primeiro administrador;
- registrar versão instalada.

Critérios de aceite:

- projeto Supabase vazio torna-se uma instância válida;
- reexecução não duplica estrutura;
- falhas deixam diagnóstico claro;
- nenhuma instalação nova executa o histórico legado `001–090`.

## Fase 3 — KML e CNEFE

Objetivos:

- importar e validar KML;
- importar múltiplos CSVs;
- detectar versão/colunas;
- filtrar endereços dentro do território;
- produzir pacote intermediário e relatório.

Critérios de aceite:

- dados de teste conhecidos produzem contagens reproduzíveis;
- registros inválidos são relatados;
- nenhuma escrita definitiva ocorre antes da aprovação.

## Fase 4 — Áreas urbanas experimentais

Objetivos:

- obter/cachear dados OSM;
- preparar malha viária;
- polygonizar candidatos a quadra;
- associar endereços;
- atribuir confiança e pendências.

Critérios de aceite:

- pipeline é comparado em conjunto de teste real;
- resultados são exportáveis e visualizáveis;
- geometrias inválidas não são publicadas.

## Fase 5 — Editor de revisão

Objetivos:

- exibir território, áreas e endereços;
- aprovar, excluir e editar áreas;
- unir e dividir;
- tratar endereços sem área;
- validar antes da publicação.

Critérios de aceite:

- usuário corrige exceções sem editar GeoJSON manualmente;
- toda alteração é rastreável;
- resumo final corresponde aos dados publicados.

## Fase 6 — Prédios e condomínios

Objetivos:

- detectar candidatos;
- sugerir nomes com fonte e confiança;
- permitir nomeação manual;
- vincular blocos/unidades e entrada;
- não bloquear publicação por pendências opcionais.

Critérios de aceite:

- nenhum nome duvidoso é confirmado silenciosamente;
- dados existentes do app continuam compatíveis.

## Fase 7 — Congregações de idioma

Objetivos:

- importar cartões/endereço conhecidos;
- reconciliar com CNEFE;
- revisar ambiguidades;
- criar registros de idioma separados;
- controlar ciclos de censo por área.

Critérios de aceite:

- correspondências possuem método e confiança;
- conclusão de censo não apaga cartões;
- histórico é preservado.

## Fase 8 — Território rural

Objetivos:

- detectar áreas sem estrutura urbana;
- agrupar pontos por proximidade/localidade/acesso;
- criar rotas, áreas rurais e pontos isolados;
- permitir classificação manual.

Critérios de aceite:

- pipeline não cria quadras artificiais onde não existem;
- unidades rurais podem ser concluídas e historizadas;
- endereços isolados permanecem visíveis.

## Fase 9 — Publicação e deploy guiado

Objetivos:

- publicação transacional ou retomável;
- proteção contra duplicidade;
- geração de configuração Cloudflare;
- build e deploy automatizados quando seguro;
- teste pós-instalação.

Critérios de aceite:

- URL final abre e acessa o banco correto;
- segredos administrativos não chegam ao cliente;
- rollback ou procedimento de recuperação documentado.

## Fase 10 — Empacotamento e distribuição

Objetivos:

- avaliar executável desktop, Docker ou pacote autônomo;
- implementar atualização do instalador;
- criar tutorial curto e troubleshooting;
- testar com usuário que não desenvolveu o projeto.

Critério principal:

Uma nova congregação consegue instalar e preparar a própria base sem intervenção direta do mantenedor na maior parte do fluxo.

## Ordem imediata recomendada

1. Auditoria de migrations e scripts existentes.
2. Prova de instalação do schema em Supabase vazio.
3. Extrair importação CNEFE para um pipeline genérico.
4. Validar filtro KML + CNEFE com dados reais.
5. Só então escolher e prototipar a geração automática de áreas.
