# bash completion for ein-llc 0.2.2. Generated from src/manifest.mjs; do not edit.
_ein_llc() {
  local cur cmd flags
  cur="${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "help version schema capabilities compare-states ein-route compliance assess prepare task status doctor claim checkout" -- "$cur")); return
  fi
  if [ "$COMP_CWORD" -eq 2 ] && [[ "$cur" != -* ]]; then
    case "${COMP_WORDS[1]}" in
    compliance) COMPREPLY=($(compgen -W "deadlines" -- "$cur")); return ;;
    task) COMPREPLY=($(compgen -W "show resume cancel" -- "$cur")); return ;;
    esac
  fi
  cmd="${COMP_WORDS[1]}"
  if [ "$COMP_CWORD" -ge 2 ] && [[ "${COMP_WORDS[2]}" != -* ]]; then cmd="${COMP_WORDS[1]} ${COMP_WORDS[2]}"; fi
  flags=""
  case "$cmd" in
    "help") flags="" ;;
    "version") flags="" ;;
    "schema") flags="" ;;
    "capabilities") flags="--offline" ;;
    "compare-states") flags="" ;;
    "ein-route") flags="--has-ssn-or-itin --principal-business-in-us" ;;
    "compliance deadlines") flags="--entity-type --owner-residency --formation-state --formation-date --reportable-transactions --part-v-transactions --format" ;;
    "assess") flags="--dry-run --yes --confirm-effect --input --task-file" ;;
    "prepare") flags="--yes --confirm-effect --task-file --intended-email" ;;
    "task show") flags="--task-file" ;;
    "task resume") flags="--yes --confirm-effect --task-file --intended-email" ;;
    "task cancel") flags="--task-file" ;;
    "status") flags="--application-id" ;;
    "doctor") flags="--task-file" ;;
    "claim") flags="--task-file" ;;
    "checkout") flags="--task-file" ;;
  esac
  COMPREPLY=($(compgen -W "$flags --origin --timeout-ms --max-response-bytes --retries --correlation-id --json --help" -- "$cur"))
}
complete -F _ein_llc ein-llc
