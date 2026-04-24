#!/usr/bin/env bats
# Tests for close-branch Step 2: dirty-main gate.
#
# Step 2 checks the main checkout for uncommitted tracked changes before
# ff-merging the feature branch. Untracked files (lines starting with ??) must
# not trip the gate because they don't threaten a fast-forward merge.

setup() {
  REPO_DIR="$(cd "$(mktemp -d)" && pwd -P)"
  git -C "$REPO_DIR" init -b main
  git -C "$REPO_DIR" config user.email "test@test.com"
  git -C "$REPO_DIR" config user.name "Test"
  touch "$REPO_DIR/tracked.txt"
  git -C "$REPO_DIR" add tracked.txt
  git -C "$REPO_DIR" commit -m "init"
}

teardown() {
  rm -rf "$REPO_DIR"
}

@test "step2 gate passes when main has only untracked files (clean tracked state)" {
  touch "$REPO_DIR/untracked.txt"

  run git -C "$REPO_DIR" status --short --untracked-files=no
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

@test "step2 gate fails when main has uncommitted tracked changes" {
  echo "dirty" > "$REPO_DIR/tracked.txt"

  run git -C "$REPO_DIR" status --short --untracked-files=no
  [ "$status" -eq 0 ]
  if [ -z "$output" ]; then
    echo "Expected non-empty output for dirty tracked file, got empty" >&2
    return 1
  fi
}

@test "bare git status --short would incorrectly flag untracked files (regression guard)" {
  touch "$REPO_DIR/untracked.txt"

  run git -C "$REPO_DIR" status --short
  [ "$status" -eq 0 ]
  if [ -z "$output" ]; then
    echo "Expected bare git status --short to emit output for untracked file, got empty" >&2
    return 1
  fi
}
