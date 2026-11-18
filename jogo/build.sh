#!/usr/bin/env bash
# Gera jogo/dist a partir de src/ (código) e public/ (fotos, texturas, modelos, config.js).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist dist-teste
cp -R public/. dist/
node src/teste_perfil.mjs 2>/dev/null
npx esbuild src/teste_fases.js --bundle --platform=node --outfile=dist-teste/fases.cjs --log-level=warning
npx esbuild src/main.js --bundle --minify --format=iife --outfile=dist/game.js --log-level=warning
python3 - <<'PY'
import time, os
url = os.environ.get('SITE_URL', 'https://d1nj59fexa9agq.cloudfront.net').rstrip('/')
css = open('src/fonts.css').read()
h = open('src/index.html').read().replace('/*FONTS*/', css).replace('__SITE_URL__', url)
open('dist/index.html', 'w').write(h.replace('<!--SCRIPT-->', '<script src="game.js?v=%d"></script>' % time.time()))
PY
echo "ok: jogo/dist gerado"
