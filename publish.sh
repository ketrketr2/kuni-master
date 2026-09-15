#!/usr/bin/env bash
# クニマスターを GitHub に公開して GitHub Pages を有効化する（1コマンド）
#   使い方:  bash publish.sh            # リポジトリ名 kuni-master
#            bash publish.sh mygame     # 別名で作る
# 必要なもの: gh (brew install gh) と git。初回は gh auth login が起動する。
set -euo pipefail
REPO="${1:-kuni-master}"
cd "$(dirname "$0")"
command -v gh >/dev/null 2>&1 || { echo "gh CLI がありません → brew install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login
[ -d .git ] || { git init -q; git branch -M main; }
git add -A
git commit -qm "クニマスター 公開" 2>/dev/null || true
if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin main
else
  gh repo create "$REPO" --public --source=. --remote=origin --push \
    --description "別々のスマホで同時に遊べる国名当てクイズ（早押し/出題バトル・サッカー図鑑76カ国・PWA）"
fi
OWNER="$(gh api user -q .login)"
# GitHub Pages を「GitHub Actions」ソースで有効化（既に有効ならそのまま）
gh api -X POST "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
  || gh api -X PUT "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || true
echo
echo "公開URL: https://$OWNER.github.io/$REPO/   （初回は Actions の完了まで1〜2分）"
echo "進捗:    https://github.com/$OWNER/$REPO/actions"
