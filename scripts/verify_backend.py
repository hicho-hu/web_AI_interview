"""Validate this frontend against an isolated instance of an existing FastAPI checkout.

Run with that backend's virtualenv Python. Never changes backend source or its database.
"""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.request

sys.dont_write_bytecode = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("backend_directory", type=Path)
    parser.add_argument("--billing-only", action="store_true", help="只验证真实权益购买接口与页面")
    args = parser.parse_args()
    backend = args.backend_directory.resolve()
    workspace = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend))
    with tempfile.TemporaryDirectory(prefix="interview-web-e2e-") as directory:
        database_url = f"sqlite:///{directory}/test.db"
        env = {
            **os.environ,
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": str(backend),
            "ENVIRONMENT": "test",
            "DATABASE_URL": database_url,
            "REDIS_URL": "",
            "TASK_MODE": "eager",
            "PROVIDER_MODE": "mock",
            "STORAGE_BACKEND": "local",
            "STORAGE_PATH": f"{directory}/objects",
            "PUBLIC_BASE_URL": "http://127.0.0.1:8011",
            "API_PROXY_TARGET": "http://127.0.0.1:8011",
            "E2E_PORT": "5174",
            "ISOLATED_BACKEND": "1",
            "RATE_LIMIT_PER_MINUTE": "1000",
        }
        os.environ.update({k: env[k] for k in ("ENVIRONMENT", "DATABASE_URL", "REDIS_URL", "TASK_MODE", "PROVIDER_MODE", "STORAGE_BACKEND", "STORAGE_PATH", "PUBLIC_BASE_URL")})
        from alembic import command
        from alembic.config import Config
        config = Config()
        config.set_main_option("script_location", str(backend / "alembic"))
        config.attributes["database_url"] = database_url
        command.upgrade(config, "head")
        log = open(Path(directory) / "server.log", "w+")
        process = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8011", "--log-level", "warning"], cwd=workspace, env=env, stdout=log, stderr=log)
        try:
            for _ in range(80):
                if process.poll() is not None:
                    log.seek(0)
                    raise RuntimeError("Isolated backend exited: " + log.read()[-3000:])
                try:
                    with urllib.request.urlopen("http://127.0.0.1:8011/health/ready", timeout=1) as response:
                        if response.status == 200:
                            break
                except OSError:
                    time.sleep(.25)
            else:
                raise RuntimeError("Isolated backend was not ready")
            print("Isolated backend ready at :8011 (temporary SQLite, eager worker, mock AI).", flush=True)
            result = subprocess.run(["npm", "run", "test:e2e:billing:live" if args.billing_only else "test:e2e:live"], cwd=workspace, env=env)
            return result.returncode
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            log.close()


if __name__ == "__main__":
    sys.exit(main())
