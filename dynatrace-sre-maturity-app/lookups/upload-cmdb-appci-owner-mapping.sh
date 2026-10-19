#!/usr/bin/env bash
# One-off upload of cmdb_appci_owner_mapping.csv to /lookups/dynatrace/cmdb_appci_owner_mapping.
# Usage: DT_ENV_URL=https://<env>.apps.dynatrace.com DT_PLATFORM_TOKEN=<token> ./upload-cmdb-appci-owner-mapping.sh
# Token needs storage:files:write (and storage:files:read to verify). Token is read from env, never hardcoded.
set -euo pipefail
: "${DT_ENV_URL:?set DT_ENV_URL}" "${DT_PLATFORM_TOKEN:?set DT_PLATFORM_TOKEN}"
DIR="$(cd "$(dirname "$0")" && pwd)"

# 11 comma-separated columns; header row skipped. applicationci is the lookup key.
# DPL pattern: LD:<col> ',' ... — SQ holds the single quote so the pattern stays readable.
SQ="'"
PARSE=""
for col in name applicationci operational_status business_criticality owned_by managed_by \
           u_maintained_by support_group managed_by.u_managing_director managed_by.u_vp; do
  PARSE+="LD:${col} ${SQ},${SQ} "
done
PARSE+="LD:managed_by.u_director"

REQUEST=$(jq -n --arg p "$PARSE" '{
  filePath: "/lookups/dynatrace/cmdb_appci_owner_mapping",
  displayName: "CMDB AppCI owner mapping",
  description: "One row per AppCI with owner, criticality, status and support group",
  lookupField: "applicationci",
  parsePattern: $p,
  skippedRecords: 1,
  autoFlatten: true,
  timezone: "UTC",
  locale: "en_US",
  overwrite: true
}')

curl -sS -f -X POST "$DT_ENV_URL/platform/storage/resource-store/v1/files/tabular/lookup:upload" \
  -H "Authorization: Bearer $DT_PLATFORM_TOKEN" \
  -F "request=$REQUEST;type=application/json" \
  -F "content=@$DIR/cmdb_appci_owner_mapping.csv;type=application/octet-stream"
echo
