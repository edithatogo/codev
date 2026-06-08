#!/bin/sh
# Forge concept: pr-list (GitLab via glab CLI — merge requests)
#
# GitLab exposes no GitHub-equivalent per-user review-request list or draft flag
# here, so both degrade to safe defaults to honor the PrListItem contract
# (forge-contracts.ts): reviewRequests -> [] (the VSCode sort silently skips the
# review-requested bucket when empty), isDraft -> false. The rest of glab's
# output is passed through unchanged.
exec glab mr list --output json \
  | jq '[.[] | . + {reviewRequests: [], isDraft: false}]'
