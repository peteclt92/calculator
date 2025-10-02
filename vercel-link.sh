#!/usr/bin/env sh
# Managed-By: Codex AGENTS.md v2025-10-01
# vercel-link.sh — safe, non-interactive
set -eu
PROJECT_SLUG=${1:?usage: vercel-link.sh <project-slug>}

command -v vercel >/dev/null 2>&1 || { echo "vercel-cli-missing"; exit 2; }
vercel whoami >/dev/null 2>&1 || { echo "vercel-cli-unauthenticated"; exit 3; }

vercel link --yes --project "$PROJECT_SLUG" >/dev/null

grep -qE '^\.env(\..*)?$' .gitignore 2>/dev/null || echo ".env*" >> .gitignore
vercel env pull .env.local --yes >/dev/null

echo "{"linked":true,"project":"$PROJECT_SLUG","env_file":".env.local"}"
