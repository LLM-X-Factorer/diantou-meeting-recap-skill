#!/usr/bin/env bash

# This file is sourced by Bash or zsh. It deliberately does not change the
# caller's shell options and does not read keys from another local project.
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  MEETING_RECAP_ENV_SOURCE="${BASH_SOURCE[0]}"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  MEETING_RECAP_ENV_SOURCE="${(%):-%N}"
else
  MEETING_RECAP_ENV_SOURCE="$0"
fi

MEETING_RECAP_ROOT="$(cd "$(dirname "$MEETING_RECAP_ENV_SOURCE")/.." && pwd)"
export MEETING_RECAP_ROOT
export DSH_HOME="${DSH_HOME:-$MEETING_RECAP_ROOT/runtime/dsh-home}"

# Web sessions discover user skills from DSH_HOME. The symlink points back to
# the tracked Skill, while the runtime directory itself remains ignored.
mkdir -p "$DSH_HOME/skills" "$DSH_HOME/profiles/web"
ln -sfn \
  "$MEETING_RECAP_ROOT/.dsh/skills/meeting-recap" \
  "$DSH_HOME/skills/meeting-recap"
ln -sfn \
  "$MEETING_RECAP_ROOT/plugin" \
  "$DSH_HOME/profiles/web/meeting-recap-plugin"

printf 'MEETING_RECAP_ROOT=%s\nDSH_HOME=%s\n' "$MEETING_RECAP_ROOT" "$DSH_HOME"
