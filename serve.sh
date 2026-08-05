#!/usr/bin/env bash
#
# Serve the harness on a *.fctest.test hostname so the attribution cookie can be
# scoped to .fctest.test. Requires a one-time /etc/hosts entry — see
# docs/local-domain-setup.md.
#
# Usage:  ./serve.sh [port]        (default 8000)

set -euo pipefail

PORT="${1:-8000}"
HOST="www.fctest.test"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! grep -qE "^[^#]*\b${HOST//./\\.}\b" /etc/hosts 2>/dev/null; then
  cat <<EOF

  ⚠  ${HOST} is not mapped in /etc/hosts.

     Without it the hostname does not resolve, the harness will not load,
     and the .fctest.test cookie cannot be set.

     Add the mapping once:

       echo '127.0.0.1 www.fctest.test testmerchant.fctest.test' | sudo tee -a /etc/hosts

     Then re-run this script.

EOF
  exit 1
fi

echo
echo "  Serving ${DIR}"
echo "  Landing page:  http://${HOST}:${PORT}/"
echo "  Cookie domain: .fctest.test"
echo "  Ctrl-C to stop."
echo

cd "$DIR"
exec python3 -m http.server "$PORT"
