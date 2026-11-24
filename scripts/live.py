"""Launch the private local app with an owner-readable, project-specific key."""
import getpass
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

PROJECT = Path(__file__).resolve().parents[1]
CONFIG = Path.home() / "Library" / "Application Support" / "Family Tree"
KEY = CONFIG / "openai.key"
ORIGIN = "http://127.0.0.1:3100"


def save_key():
    if not sys.stdin.isatty():
        sys.exit("Open Start Family Tree Live.command in Terminal to enter your key privately.")
    value = getpass.getpass("Paste the Family Tree OpenAI project key (input hidden): ").strip()
    if not re.fullmatch(r"sk-[A-Za-z0-9_-]{12,}", value):
        sys.exit("That does not look like an OpenAI project key. Nothing was saved.")
    CONFIG.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=CONFIG, delete=False) as handle:
        handle.write(value)
    os.replace(handle.name, KEY)
    return value


def main():
    if sys.argv[1:] == ["--status"]:
        print("Family Tree credential saved." if KEY.is_file() else "Family Tree credential needed.")
        return
    if sys.argv[1:] not in ([], ["--replace-key"]):
        sys.exit("Usage: live.py [--status | --replace-key]")
    node = shutil.which("node")
    if not node:
        local = Path("/private/tmp/family-tree-runtime/node-v22.23.5-darwin-arm64/bin/node")
        if local.is_file():
            node = str(local)
    if not node:
        sys.exit("Install Node.js 22.12 or newer, then run this launcher again.")
    os.chdir(PROJECT)
    os.umask(0o077)
    key = save_key() if "--replace-key" in sys.argv or not KEY.is_file() else KEY.read_text().strip()
    env = os.environ.copy()
    env["PATH"] = str(Path(node).parent) + os.pathsep + env["PATH"]
    if not (PROJECT / "node_modules" / ".bin" / "vite").exists():
        subprocess.run(["npm", "ci"], env=env, check=True)
    subprocess.run(["npm", "run", "build"], env=env, check=True)
    env.update(OPENAI_API_KEY=key, DEMO_MODE="false", NODE_ENV="development",
               STATIC_CLIENT="true", APP_ORIGIN=ORIGIN, PORT="3100", HOST="127.0.0.1",
               DATABASE_URL="", S3_BUCKET="", DATA_DIR=str(CONFIG / "postgres"),
               RECORDING_DIR=str(CONFIG / "recordings"))
    print(f"Open {ORIGIN} and create your private family account.", flush=True)
    os.execve(node, [node, "server/index.js"], env)


if __name__ == "__main__":
    main()
