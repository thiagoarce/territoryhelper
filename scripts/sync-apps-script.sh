#!/usr/bin/env bash
# Sincroniza os arquivos do Apps Script da `main` para a branch `apps-script`.
# Roda automaticamente via .github/workflows/sync-apps-script.yml a cada
# push em main, e também pode ser chamado manualmente.
#
# Uso manual:
#   bash scripts/sync-apps-script.sh
set -euo pipefail

BRANCH_FONTE="main"
BRANCH_DESTINO="apps-script"

# Padrões que devem ir para a branch apps-script
ARQUIVOS=("*.gs" "*.html" "appsscript.json" "readme.md")

ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo ">> Branch atual: $ORIGINAL_BRANCH"

git fetch origin "$BRANCH_FONTE" "$BRANCH_DESTINO" 2>/dev/null || true

git checkout "$BRANCH_DESTINO" 2>/dev/null || git checkout -b "$BRANCH_DESTINO" "origin/$BRANCH_DESTINO"
git pull --rebase origin "$BRANCH_DESTINO" || true

# Copia os arquivos da main
for padrao in "${ARQUIVOS[@]}"; do
  git checkout "origin/$BRANCH_FONTE" -- $padrao 2>/dev/null || true
done

# Garante que NÃO existem coisas que possam quebrar a extensão
rm -rf tests .github CLAUDE.md scripts 2>/dev/null || true

if git diff --quiet && git diff --staged --quiet; then
  echo ">> Sem mudanças. apps-script já está em sincronia com main."
else
  git add -A
  git commit -m "sync from main: $(git rev-parse --short origin/$BRANCH_FONTE)" || true
  git push origin "$BRANCH_DESTINO" || true
  echo ">> apps-script atualizada e enviada."
fi

git checkout "$ORIGINAL_BRANCH" 2>/dev/null || true
