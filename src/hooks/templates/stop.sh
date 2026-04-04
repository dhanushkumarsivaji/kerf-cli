#!/bin/bash
# kerf stop hook — budget enforcement
# Checks budget via kerf and optionally blocks if over budget

KERF_BIN=$(which kerf 2>/dev/null || echo "npx kerf@latest")

# Check budget
BUDGET_CHECK=$($KERF_BIN budget show --json 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$BUDGET_CHECK" ]; then
  # No budget set or kerf not available, allow continuation
  exit 0
fi

PERCENT_USED=$(echo "$BUDGET_CHECK" | grep -o '"percentUsed"[[:space:]]*:[[:space:]]*[0-9.]*' | head -1 | sed 's/.*: *//')
IS_OVER=$(echo "$BUDGET_CHECK" | grep -o '"isOverBudget"[[:space:]]*:[[:space:]]*\(true\|false\)' | head -1 | sed 's/.*: *//')

if [ "$IS_OVER" = "true" ]; then
  # Over budget — output warning as reason (configurable: change exit code to block)
  echo '{"reason":"Budget exceeded. Run kerf budget show for details."}'
  # To hard-block, uncomment the next line:
  # exit 1
  exit 0
fi

# Check if approaching budget (80% threshold)
if [ -n "$PERCENT_USED" ]; then
  THRESHOLD=80
  OVER=$(echo "$PERCENT_USED > $THRESHOLD" | bc -l 2>/dev/null || echo "0")
  if [ "$OVER" = "1" ]; then
    echo "{\"reason\":\"Budget warning: ${PERCENT_USED}% used. Run kerf budget show for details.\"}"
  fi
fi

exit 0
