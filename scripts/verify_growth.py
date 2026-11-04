"""Exercise accounts, referrals, commissions and admin pages against an isolated real HTTP backend."""

import argparse
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("backend", type=Path)
    parser.add_argument("--admin-dir", type=Path)
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args()
    backend = args.backend.resolve()
    workspace = Path(__file__).resolve().parents[1]
    sys.dont_write_bytecode = True
    with tempfile.TemporaryDirectory(prefix="interview-growth-e2e-") as directory:
        env = {
            **os.environ,
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONPATH": str(backend),
            "ENVIRONMENT": "test",
            "DATABASE_URL": f"sqlite:///{directory}/test.db",
            "REDIS_URL": "",
            "TASK_MODE": "eager",
            "PROVIDER_MODE": "mock",
            "STORAGE_BACKEND": "local",
            "STORAGE_PATH": f"{directory}/objects",
            "PUBLIC_BASE_URL": "http://127.0.0.1:8011",
            "API_PROXY_TARGET": "http://127.0.0.1:8011",
            "WEB_BASE_URL": "http://127.0.0.1:5193",
            "MAIL_MODE": "preview",
            "E2E_PORT": "5193",
            "ISOLATED_BACKEND": "1",
            "LIVE_API": "1",
            "GROWTH_E2E": "1",
            "SHARED_TEST_BACKEND": "1",
            "FFPROBE_BIN": args.ffprobe,
            "RATE_LIMIT_PER_MINUTE": "10000",
        }
        os.environ.update(env)
        sys.path.insert(0, str(backend))
        from alembic import command
        from alembic.config import Config
        from app.core.config import Settings
        from app.main import create_app
        from app.modules.admin.auth import create_admin
        from fastapi.testclient import TestClient
        from tests.conftest import data, interview, login

        settings = Settings(_env_file=None)
        config = Config(str(backend / "alembic.ini"))
        config.set_main_option("script_location", str(backend / "alembic"))
        config.attributes["database_url"] = settings.database_url
        command.upgrade(config, "head")
        app = create_app(settings)
        with app.state.runtime.db.session() as db:
            create_admin(
                db, "admin", "运营管理员", "Admin-e2e-password-2026", "SUPER_ADMIN"
            )
            create_admin(
                db, "finance", "财务管理员", "Admin-e2e-password-2026", "FINANCE"
            )
        with TestClient(app) as client:
            headers, _ = login(client, "growth-seed-user")
            interview(client, headers)
            order = data(
                client.post(
                    "/api/v1/billing/orders",
                    headers={**headers, "Idempotency-Key": "seed-order"},
                    json={"product_code": "SINGLE"},
                )
            )
            data(
                client.post(
                    "/api/v1/billing/orders/" + order["id"] + "/dev-pay",
                    headers={**headers, "Idempotency-Key": "seed-pay"},
                )
            )
        with open(Path(directory) / "backend.log", "w+") as log:
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-B",
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8011",
                    "--log-level",
                    "warning",
                ],
                cwd=workspace,
                env=env,
                stdout=log,
                stderr=log,
            )
            try:
                for _ in range(80):
                    if process.poll() is not None:
                        raise RuntimeError("Isolated backend exited")
                    try:
                        with urllib.request.urlopen(
                            "http://127.0.0.1:8011/health/ready", timeout=1
                        ) as response:
                            if response.status == 200:
                                break
                    except OSError:
                        time.sleep(0.25)
                else:
                    raise RuntimeError("Isolated backend was not ready")
                print(
                    "Isolated account/growth backend ready (preview email, no real mail or payments).",
                    flush=True,
                )
                result = subprocess.run(
                    ["npm", "run", "test:e2e", "--", "tests/e2e/accounts-live.spec.ts"],
                    cwd=workspace,
                    check=False,
                    env=env,
                )
                if result.returncode:
                    return result.returncode
                if args.admin_dir:
                    result = subprocess.run(
                        ["npm", "run", "test:e2e"],
                        cwd=args.admin_dir.resolve(),
                        check=False,
                        env=env,
                    )
                return result.returncode
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
