#!/usr/bin/env bash
# Compila o jogo, testa e envia para o bucket do site. Depois limpa o cache do CloudFront.
source "$(dirname "$0")/comum.sh"; conferir_conta
cd "$RAIZ/jogo"; [ -d node_modules ] || npm ci --silent
[ -d public/modelos ] || { echo "Faltam os modelos em jogo/public (rode scripts/importar-assets.sh)."; exit 1; }
npm test
BUCKET="${BUCKET_SITE:-$(cd "$RAIZ/infra" && terraform output -raw bucket_site)}"
DIST="${DISTRIBUICAO_ID:-$(cd "$RAIZ/infra" && terraform output -raw distribuicao_id)}"
# Arquivos pesados (modelos, texturas, fotos): cache de 1 dia. Página e código: sempre revalidam.
aws s3 sync dist "s3://$BUCKET" --delete --exclude "index.html" --exclude "game.js" --exclude "config.js" --exclude "LEIAME.txt" --cache-control "public,max-age=86400"
aws s3 cp dist "s3://$BUCKET" --recursive --exclude "*" --include "index.html" --include "game.js" --include "config.js" --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/game.js" "/config.js" "/" --query Invalidation.Id --output text
echo "Site publicado em s3://$BUCKET"
