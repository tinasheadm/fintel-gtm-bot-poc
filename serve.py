#!/usr/bin/env python3
"""
Serve the harness on a *.fctest.test hostname so the attribution cookie can be
scoped to .fctest.test.

Cross-platform (macOS, Linux, Windows) — use this rather than serve.sh unless you
are on a Unix shell and prefer the shell script. Standard library only.

    python3 serve.py            # port 8000
    python3 serve.py 8080

Before it will serve, it checks that the test hostname actually resolves to this
machine, so nobody spends an afternoon testing a build whose cookies silently
vanish.

The .test TLD is reserved by RFC 6761 and can never be registered by anyone, so
there is no real site behind this name and no risk of a stray request escaping
to a third party. Without the hosts entry the name simply does not resolve.
"""

import http.server
import os
import platform
import socket
import socketserver
import sys

HOSTNAME = "www.fctest.test"
ALT_HOSTNAME = "testmerchant.fctest.test"
HOSTS_LINE = f"127.0.0.1 {HOSTNAME} {ALT_HOSTNAME}"
LOOPBACK = {"127.0.0.1", "::1"}

IS_WINDOWS = platform.system() == "Windows"
HOSTS_PATH = (
    r"C:\Windows\System32\drivers\etc\hosts" if IS_WINDOWS else "/etc/hosts"
)


def resolves_to_loopback(host):
    """(ok, detail) — does `host` point at this machine?"""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False, "does not resolve at all"
    addrs = sorted({i[4][0] for i in infos})
    if all(a in LOOPBACK for a in addrs):
        return True, ", ".join(addrs)
    return False, ", ".join(addrs)


def instructions():
    print(f"\n  {HOSTNAME} does not point at this machine.\n")
    print("  The attribution cookie is scoped to .fctest.test, and a browser only")
    print("  accepts a cookie scoped to a domain the page is really served from.")
    print("  Without this mapping the name does not resolve at all, and the")
    print("  .fctest.test cookie can never be set.\n")
    print(f"  Add this line to {HOSTS_PATH}:\n")
    print(f"      {HOSTS_LINE}\n")
    if IS_WINDOWS:
        print("  On Windows: open Notepad as Administrator, File > Open that path,")
        print("  add the line, save. Then run this script again.\n")
    else:
        print("  Quickest way:\n")
        print(f"      echo '{HOSTS_LINE}' | sudo tee -a {HOSTS_PATH}\n")
        print("  Then run this script again.\n")
    print("  If you added it and still see this message, something is bypassing the")
    print("  hosts file — usually DNS-over-HTTPS / 'Secure DNS' in the browser or a")
    print("  corporate DNS client. Turn secure DNS off for testing.\n")


def main():
    try:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    except ValueError:
        print(f"Not a port number: {sys.argv[1]}")
        return 2

    ok, detail = resolves_to_loopback(HOSTNAME)
    if not ok:
        print(f"\n  {HOSTNAME} -> {detail}")
        instructions()
        return 1

    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    handler = http.server.SimpleHTTPRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    try:
        httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    except OSError as e:
        print(f"\n  Cannot bind port {port}: {e}")
        print(f"  Something else is probably using it. Try: python3 serve.py {port + 1}\n")
        return 1

    print()
    print(f"  Serving       {os.getcwd()}")
    print(f"  Landing page  http://{HOSTNAME}:{port}/")
    print(f"  Cookie domain .fctest.test  ({HOSTNAME} -> {detail})")
    print("  Ctrl-C to stop.")
    print()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.\n")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
