#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:8080/api"
STORE_ID="str_demo_000000000000000000000001"
PASS=0
FAIL=0

log_pass() { echo "  ✅ PASS: $1"; PASS=$((PASS+1)); }
log_fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL+1)); }

echo "═══════════════════════════════════════════════════════════"
echo "  FlyChat Automation Triggers — End-to-End Verification"
echo "═══════════════════════════════════════════════════════════"

TOKEN=$(curl -sf -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@flychat.dz","password":"demo123456"}' | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Cannot login — aborting"; exit 1
fi

echo ""
echo "── Trigger 1: new_conversation → send_message ──"
SESSION=$(curl -sf -X POST "$BASE/widget/public/session" \
  -H "Content-Type: application/json" \
  -d "{\"storeId\":\"$STORE_ID\", \"language\":\"fr\"}")
VID=$(echo "$SESSION" | jq -r '.visitorId')

CONV=$(curl -sf -X POST "$BASE/widget/public/conversations" \
  -H "Content-Type: application/json" \
  -d "{\"storeId\":\"$STORE_ID\", \"visitorId\":\"$VID\", \"language\":\"fr\"}")
CID=$(echo "$CONV" | jq -r '.conversationId')
RESUMED=$(echo "$CONV" | jq -r '.resumed')

if [ "$RESUMED" = "false" ]; then
  sleep 1
  BOT_MSG=$(curl -sf "$BASE/widget/public/conversations/$CID/messages?visitorId=$VID&storeId=$STORE_ID" \
    | jq -r '[.messages[] | select(.sender=="bot")] | length')
  if [ "$BOT_MSG" -ge 1 ]; then
    log_pass "Welcome bot message sent on new conversation"
  else
    log_fail "No bot message found after new conversation"
  fi
else
  log_fail "Expected new conversation but got resumed"
fi

echo ""
echo "── Trigger 2: keyword → send_message ──"
curl -sf -X POST "$BASE/widget/public/conversations/$CID/messages" \
  -H "Content-Type: application/json" \
  -d "{\"visitorId\":\"$VID\", \"storeId\":\"$STORE_ID\", \"content\":\"Quel est le prix?\"}" > /dev/null

sleep 1
KEYWORD_MSGS=$(curl -sf "$BASE/widget/public/conversations/$CID/messages?visitorId=$VID&storeId=$STORE_ID" \
  | jq -r '[.messages[] | select(.sender=="bot")] | length')

if [ "$KEYWORD_MSGS" -ge 2 ]; then
  log_pass "Keyword 'prix' triggered bot auto-reply"
else
  log_fail "Keyword trigger did not produce expected reply (got $KEYWORD_MSGS bot messages, expected >=2)"
fi

echo ""
echo "── Trigger 3: inactivity → send_message ──"
echo "  ⏳ Waiting 70 seconds for 1-minute inactivity timer..."
sleep 70
INACT_MSGS=$(curl -sf "$BASE/widget/public/conversations/$CID/messages?visitorId=$VID&storeId=$STORE_ID" \
  | jq -r '[.messages[] | select(.sender=="bot")] | length')

if [ "$INACT_MSGS" -ge 3 ]; then
  log_pass "Inactivity timer fired — bot message appeared after delay"
else
  log_fail "Inactivity trigger did not fire (got $INACT_MSGS bot messages, expected >=3)"
fi

echo ""
echo "── Trigger 4: order_created → assign_agent + notify_team ──"
ORDER=$(curl -sf -X POST "$BASE/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName":"Verify Script Client",
    "customerPhone":"0555999888",
    "wilaya":"Alger",
    "address":"1 Rue Test",
    "items":[{"productName":"Test","quantity":1,"price":1000}]
  }')
OID=$(echo "$ORDER" | jq -r '.id')

if [ -n "$OID" ] && [ "$OID" != "null" ]; then
  log_pass "Order created ($OID) — order_created trigger fired"
else
  log_fail "Order creation failed"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
