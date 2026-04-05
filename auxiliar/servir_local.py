"""
Servidor local simples para abrir o Stock Guide com suporte ao data/fiis.json.

Uso:
  py -3 auxiliar/servir_local.py

Depois abra:
  http://localhost:8000
"""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parent.parent
PORT = 8000


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)


def main():
    os.chdir(BASE_DIR)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Servidor ativo em http://localhost:{PORT}")
    print("Pressione Ctrl+C para encerrar.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
