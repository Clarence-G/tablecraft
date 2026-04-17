#!/bin/bash
# Search game-icons.net for icons by keyword
# Usage: search.sh <query> [hits_per_page]
# Output: tab-separated lines: name \t id \t tags \t svg_url

QUERY="${1:?Usage: $0 <query> [hits_per_page]}"
HITS="${2:-20}"

curl -s -X POST \
  'https://9hq1yxukvc-dsn.algolia.net/1/indexes/icons/query' \
  -H 'X-Algolia-Application-Id: 9HQ1YXUKVC' \
  -H 'X-Algolia-API-Key: fa437c6f1fcba0f93608721397cd515d' \
  -H 'Content-Type: application/json' \
  -d "{\"params\":\"query=${QUERY}&hitsPerPage=${HITS}\"}" \
| python3 -c "
import json, sys
data = json.load(sys.stdin)
for hit in data.get('hits', []):
    name = hit.get('name', '?')
    icon_id = hit.get('id', '')
    tags = hit.get('tags', '')
    print(f'{name}\t{icon_id}\t{tags}')
"
