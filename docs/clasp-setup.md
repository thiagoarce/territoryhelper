# Setup do auto-deploy para o Apps Script

Configuração única para que cada push em `main` seja enviado automaticamente
para o seu projeto Apps Script real, sem precisar abrir a extensão do navegador.

## Pré-requisitos

- Node.js instalado em algum lugar (sua máquina, qualquer Mac/PC/Linux).
- Conta Google com acesso ao projeto Apps Script.
- Acesso de admin no repositório GitHub (para configurar secrets).

## Passo 1 — Pegar o Script ID

1. Abra o Apps Script editor do seu projeto.
2. A URL é assim:
   ```
   https://script.google.com/.../d/ABC123xyz_LONGOID/edit
   ```
3. Copie o trecho entre `/d/` e `/edit` — esse é o `scriptId`.
4. Cole no arquivo `.clasp.json` no lugar de `COLE_SEU_SCRIPT_ID_AQUI`.

## Passo 2 — Habilitar a API do Apps Script

1. Acesse https://script.google.com/home/usersettings
2. Ative **Google Apps Script API**.

## Passo 3 — Login local UMA vez para gerar credenciais

Numa máquina com Node, rode:

```bash
npm install -g @google/clasp
clasp login
```

Vai abrir o navegador, faça login com a mesma conta Google dona do projeto.
Após login, será criado um arquivo:

- Linux/Mac: `~/.clasprc.json`
- Windows: `C:\Users\<seu_user>\.clasprc.json`

Esse arquivo contém um **refresh token** que o GitHub Actions vai usar.

## Passo 4 — Configurar o secret no GitHub

1. Abra o conteúdo do `~/.clasprc.json` (copie tudo).
2. No GitHub, vá em: **Settings → Secrets and variables → Actions → New repository secret**.
3. Crie um secret com:
   - Nome: `CLASP_CREDENTIALS`
   - Valor: o JSON inteiro do `.clasprc.json`
4. Salve.

## Passo 5 — Testar

Disponha de duas formas:

**Manual (recomendado para o primeiro teste):**
1. Vá em **Actions → Deploy Apps Script → Run workflow → main**.
2. Aguarde ~30s.
3. Abra o Apps Script editor e veja se o código está lá.

**Automático:**
Faça qualquer commit que altere um `.gs` ou `.html` em `main`. O workflow
dispara sozinho.

## Manutenção

- O refresh token do Google geralmente dura indefinidamente, mas pode
  expirar se ficar 6+ meses sem uso, ou se você revogar acesso na conta.
- Se o workflow falhar com erro de autenticação, refaça o **Passo 3** e
  **Passo 4** (gerar novo `.clasprc.json` e atualizar o secret).

## Como saber se algo deu errado

- O passo "Verificar autenticação" do workflow detecta token expirado.
- Falha no `clasp push` aparece nos logs do GitHub Actions com detalhes.
- Para diagnosticar localmente:
  ```bash
  cd <repo>
  clasp status         # mostra o que seria enviado
  clasp push --dry-run # simula o push sem aplicar
  ```

## Reverter (se quiser parar de usar)

1. Delete o secret `CLASP_CREDENTIALS` no GitHub.
2. Delete `.github/workflows/deploy-apps-script.yml`.
3. Continue usando a extensão gas-github + branch `apps-script` normalmente.
