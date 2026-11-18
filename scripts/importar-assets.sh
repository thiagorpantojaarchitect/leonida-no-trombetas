#!/usr/bin/env bash
# Copia fotos, texturas e modelos de uma pasta de site já montada para jogo/public.
# Uso: scripts/importar-assets.sh /caminho/para/site
source "$(dirname "$0")/comum.sh"
ORIGEM="${1:?Informe a pasta do site (a que tem fotos/, tex/ e modelos/)}"
for d in fotos tex modelos; do [ -d "$ORIGEM/$d" ] || { echo "Não achei $ORIGEM/$d"; exit 1; }; mkdir -p "$RAIZ/jogo/public/$d"; cp -R "$ORIGEM/$d/." "$RAIZ/jogo/public/$d/"; done
find "$RAIZ/jogo/public" -name "*.glb" -delete 2>/dev/null || true
du -sh "$RAIZ/jogo/public"
