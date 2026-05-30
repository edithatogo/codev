#!/bin/sh
# Forge concept: issue-list (GitHub via gh CLI)
# Input (all optional):
#   CODEV_ISSUE_STATE  — open|closed|all (default: open)
#   CODEV_ISSUE_FIELDS — extra comma-separated --json fields appended to the
#                        defaults (e.g. "body" for the backlog-search path)
# Output: JSON [{number, title, url, labels, createdAt, author, assignees[, ...extra]}]
FIELDS="number,title,url,labels,createdAt,author,assignees"
if [ -n "$CODEV_ISSUE_FIELDS" ]; then
  FIELDS="$FIELDS,$CODEV_ISSUE_FIELDS"
fi
exec gh issue list --limit 200 --state "${CODEV_ISSUE_STATE:-open}" --json "$FIELDS"
