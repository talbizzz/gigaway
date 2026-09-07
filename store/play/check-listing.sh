#!/usr/bin/env bash
# Verifies the listing copy fits Play's character limits.
set -euo pipefail
md="$(dirname "$0")/listing.md"
python3 - "$md" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
blocks = re.findall(r'```\n(.*?)\n```', src, re.S)
limits = [('App name', 30), ('Short description', 80), ('Short description (alt)', 80), ('Full description', 4000)]
for (label, limit), body in zip(limits, blocks):
    n = len(body)
    print(f"{'OK ' if n <= limit else 'OVER'}  {label:<26} {n:>5} / {limit}")
PY
