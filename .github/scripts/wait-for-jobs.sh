#!/usr/bin/env bash
# Waits for jobs of this same workflow run to finish, and fails unless every
# one of them passed. Usage: wait-for-jobs.sh <job name>...
#
# The store build starts beside the checks instead of after them, and runs this
# before it submits, so a binary only reaches a store once the checks on its
# commit have passed. The checks take about two minutes and the build about
# twenty, so in practice they have long finished by the time this runs.
#
# Needs GH_TOKEN with `actions: read`. Reads the latest attempt of each job,
# so after "Re-run failed jobs" it waits for the re-run, not the old failure.
set -uo pipefail

[ "$#" -gt 0 ] || { echo "usage: $0 <job name>..." >&2; exit 2; }

timeout=${WAIT_TIMEOUT_SECONDS:-1800}
deadline=$(( $(date +%s) + timeout ))
url="repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/jobs?filter=latest&per_page=100"
command -v gh > /dev/null || { echo "::error::gh is not installed, so the checks cannot be read."; exit 1; }
api_failures=0

while :; do
  if jobs=$(gh api "$url" --jq '.jobs[] | [.name, .status, (.conclusion // "")] | @tsv'); then
    api_failures=0
  else
    # One failed call is not a failed check, so try again; five in a row
    # (about a minute) is not going to recover, so stop instead of holding
    # the runner until the deadline. Either way nothing is submitted.
    api_failures=$((api_failures + 1))
    if [ "$api_failures" -ge 5 ]; then
      echo "::error::Could not read this run's jobs from the GitHub API five times in a row."
      exit 1
    fi
    jobs=""
  fi

  waiting=()
  passed=()
  failed=0
  for name in "$@"; do
    line=$(awk -F'\t' -v n="$name" '$1 == n' <<< "$jobs" | head -n 1)
    if [ -z "$jobs" ]; then
      waiting+=("$name")
    elif [ -z "$line" ]; then
      echo "::error::This run has no job named \"$name\", so its result cannot be checked."
      failed=1
    else
      IFS=$'\t' read -r _ status conclusion <<< "$line"
      if [ "$status" != completed ]; then
        waiting+=("$name")
      elif [ "$conclusion" = success ]; then
        passed+=("$name")
      else
        echo "::error::$name did not pass ($conclusion)."
        failed=1
      fi
    fi
  done

  [ "$failed" -eq 0 ] || exit 1
  if [ "${#waiting[@]}" -eq 0 ]; then
    echo "Passed: ${passed[*]}."
    exit 0
  fi

  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::Still waiting for ${waiting[*]} after $timeout seconds."
    exit 1
  fi
  echo "Waiting for ${waiting[*]}..."
  sleep 15
done
