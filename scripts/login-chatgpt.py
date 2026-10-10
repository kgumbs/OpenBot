"""User-run sign-in for the existing experimental LangChain ChatGPT provider.

The container publishes a relay because the OAuth callback listener is loopback-only.
Tokens remain in the mounted, git-ignored directory and are never printed.
"""
import os
import socket
import threading
from pathlib import Path

os.umask(0o077)

def pump(source, destination):
    try:
        while data := source.recv(65536):
            destination.sendall(data)
    except OSError:
        pass
    finally:
        for connection in (source, destination):
            try:
                connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            connection.close()

def relay():
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("0.0.0.0", 1456))
    listener.listen(8)
    while True:
        client, _ = listener.accept()
        try:
            upstream = socket.create_connection(("127.0.0.1", 1455), timeout=10)
        except OSError:
            client.close()
            continue
        threading.Thread(target=pump, args=(client, upstream), daemon=True).start()
        threading.Thread(target=pump, args=(upstream, client), daemon=True).start()

threading.Thread(target=relay, daemon=True).start()
from langchain_openai.chatgpt_oauth import login_chatgpt

destination = Path("/auth/chatgpt-auth.json")
login_chatgpt(store_path=destination, open_browser=False, port=1455, timeout=900)
destination.chmod(0o600)
print("ChatGPT sign-in saved locally. No credential was printed.")
