#!/usr/bin/env bash
# Descents as theorems — mechanism proofs for every dungeon law.
# (solution/ablation duels arrive once the scripted descent is authored)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-chromium}"
run() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --virtual-time-budget=120000 --dump-dom \
    "file://$DIR/index.html?verify=$1" 2>/dev/null | grep -o 'VERIFY:{[^<]*' | head -1
}
for m in solution solution-slow ablate-food ablate-drink ablate-torch ablate-torch-runes ablate-runes null mech-darkness mech-hunger mech-torch mech-glow mech-door mech-key mech-zo mech-fireball mech-mend mech-xp mech-screamer mech-pit mech-plate mech-teleport mech-rest; do
  run "$m"
done
