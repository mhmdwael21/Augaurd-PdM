"""One-time helper: create the 'predictive_maintenance' database if it
doesn't already exist. Reads the connection details from .env so you
never type your password in the terminal.

Run once with:  .venv\\Scripts\\python.exe create_db.py
"""

import sys
from urllib.parse import urlparse

import psycopg2
from dotenv import load_dotenv
import os

load_dotenv()

url = os.getenv("DATABASE_URL", "")
if "REPLACE_ME" in url or not url:
    sys.exit(
        "\n[!] Please open the .env file and replace REPLACE_ME with your "
        "PostgreSQL password first, then run this again.\n"
    )

parsed = urlparse(url)
target_db = parsed.path.lstrip("/")  # e.g. 'predictive_maintenance'

# Connect to the default 'postgres' database to issue CREATE DATABASE.
try:
    conn = psycopg2.connect(
        dbname="postgres",
        user=parsed.username,
        password=parsed.password,
        host=parsed.hostname,
        port=parsed.port or 5432,
    )
except psycopg2.OperationalError as exc:
    sys.exit(
        f"\n[!] Could not connect to PostgreSQL.\n    {exc}\n"
        "    Check that the password in .env is correct.\n"
    )

conn.autocommit = True
with conn.cursor() as cur:
    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (target_db,))
    if cur.fetchone():
        print(f"[ok] Database '{target_db}' already exists — nothing to do.")
    else:
        cur.execute(f'CREATE DATABASE "{target_db}"')
        print(f"[ok] Created database '{target_db}'.")

conn.close()
print("[done] You can now start the server.")
