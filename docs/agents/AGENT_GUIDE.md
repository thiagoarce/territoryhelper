# Guia para Agentes

## Leitura obrigatória

Antes de alterar código relacionado ao Installer ou pipeline, leia:

1. `docs/README.md`;
2. `docs/vision/VISION.md`;
3. `docs/vision/PRINCIPLES.md`;
4. documentos de domínio relevantes;
5. documentos de pipeline relevantes;
6. `docs/architecture/MODULES.md`;
7. `docs/architecture/DATA_MODEL.md`;
8. ADRs aplicáveis;
9. README, migrations e código atual afetado.

## Regras

- Trabalhe somente no branch indicado pela tarefa.
- Preserve o comportamento atual da aplicação.
- Não crie migrations antes de auditar o schema existente.
- Não importe CNEFE diretamente para tabelas operacionais.
- Não sobrescreva correções humanas silenciosamente.
- Não trate idioma como atributo permanente do endereço.
- Não force território rural ao conceito de quadra urbana.
- Não grave alterações em massa sem pré-visualização e aprovação.
- Não escolha biblioteca GIS como decisão de domínio.
- Prefira módulos puros, testáveis e independentes de infraestrutura.
- Toda etapa de pipeline deve gerar relatório e artefato reproduzível.

## Forma de execução

1. Inspecione a implementação atual.
2. Resuma o que será reutilizado.
3. Identifique lacunas reais.
4. Proponha uma alteração pequena.
5. Implemente apenas o escopo solicitado.
6. Adicione testes ou fixtures quando aplicável.
7. Atualize a documentação quando uma regra mudar.
8. Registre nova decisão estrutural em ADR.

## Proibições

- Reescrita ampla sem necessidade demonstrada.
- Criação de tabelas duplicadas para conceitos já existentes.
- Uso de chaves privilegiadas no cliente.
- Commit de dados pessoais, CSVs reais ou credenciais.
- Dependência silenciosa de formato específico de uma congregação.
- Classificações automáticas apresentadas como certeza sem confiança e motivos.

## Critérios de conclusão

Uma tarefa só está concluída quando:

- o escopo está implementado;
- comportamento anterior relevante foi validado;
- erros são claros e acionáveis;
- o processo é seguro para reexecução quando aplicável;
- documentação e testes refletem o resultado;
- limitações conhecidas estão registradas.
