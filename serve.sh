#!/usr/bin/env bash
#
# Serve the harness on a *.fctest.com hostname so the attribution cookie can be
# scoped to .fctest.com. Requires a one-time /etc/hosts entry — see
# docs/local-domain-setup.md.
#
# Usage:  ./serve.sh [port]        (default 8000)

set -euo pipefail

PORT="${1:-8000}"
HOST="www.fctest.com"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! grep -qE "^[^#]*\b${HOST//./\\.}\b" /etc/hosts 2>/dev/null; then
  cat <<EOF

  ⚠  ${HOST} is not mapped in /etc/hosts.

     Without it your browser resolves fctest.com to its real owner's servers,
     the harness will not load, and the .fctest.com cookie cannot be set.

     Add the mapping once:

       echo '127.0.0.1 www.fctest.com testmerchant.fctest.com' | sudo tee -a /etc/hosts

     Then re-run this script.

EOF
  exit 1
fi

echo
echo "  Serving ${DIR}"
echo "  Landing page:  http://${HOST}:${PORT}/"
echo "  Cookie domain: .fctest.com"
echo "  Ctrl-C to stop."
echo

cd "$DIR"
exec python3 -m http.server "$PORT"
