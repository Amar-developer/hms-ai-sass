#!/bin/sh
set -eu

repo_root="$(git rev-parse --show-toplevel)"
hooks_dir="$repo_root/.git/hooks"
source_dir="$repo_root/scripts/git-hooks"

if [ ! -d "$hooks_dir" ]; then
  echo "Git hooks directory not found: $hooks_dir"
  exit 1
fi

for hook in pre-commit pre-push commit-msg post-commit; do
  cp "$source_dir/$hook" "$hooks_dir/$hook"
  chmod +x "$hooks_dir/$hook"
  echo "Installed $hook"
done

echo "MedizinHub HMS Git hooks installed."
