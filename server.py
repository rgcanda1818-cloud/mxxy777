from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import time
from email.message import EmailMessage
from threading import BoundedSemaphore
from datetime import date, datetime, timezone
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
DATABASE_DIR = Path(os.environ.get("NORTHGATE_DATA_DIR", str(Path.home() / ".northgate"))).expanduser().resolve()
DATABASE = DATABASE_DIR / "northgate.sqlite3"
LEGACY_DATABASE = ROOT / "northgate.sqlite3"
try:
    DATABASE.relative_to(ROOT)
except ValueError:
    pass
else:
    raise RuntimeError("NORTHGATE_DATA_DIR must be outside the website directory.")
HOST = os.environ.get("NORTHGATE_HOST", "127.0.0.1")
PORT = int(os.environ.get("NORTHGATE_PORT", os.environ.get("PORT", "8080")))
MAX_CONCURRENT_REQUESTS = max(8, int(os.environ.get("NORTHGATE_MAX_CONCURRENT_REQUESTS", "64")))
SESSION_COOKIE = "northgate_session"
SESSION_SECONDS = 60 * 60 * 24 * 14
LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 30 * 60
PASSWORD_ITERATIONS = 310_000
MAX_BODY_BYTES = 2_000_000
SHIPPING_CENTS = 1299
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PRODUCT_CATEGORIES = {
    "Home essentials",
    "Electronics",
    "Fashion",
    "Beauty",
    "Kitchen",
    "Office",
    "Fitness",
}
PRODUCT_STATUSES = {"active", "draft", "archived"}
PRODUCT_IMAGE_LIMIT = 5
MAX_PRODUCT_IMAGE_BYTES = 250_000
ORDER_STATUS_TRANSITIONS = {
    "Processing": {"Shipped", "Cancelled"},
    "Shipped": {"Delivered"},
    "Delivered": set(),
    "Cancelled": set(),
}


class AdminRequiredError(Exception):
    pass


class EmailDeliveryError(Exception):
    pass


try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None
    dict_row = None
    DATABASE_INTEGRITY_ERRORS = (sqlite3.IntegrityError,)
else:
    DATABASE_INTEGRITY_ERRORS = (sqlite3.IntegrityError, psycopg.IntegrityError)


PRODUCTS = {
    product_id: (name, image, price_cents)
    for product_id, name, image, price_cents in [
        ("wireless-earbuds-pro", "Wireless Earbuds Pro", "photo-1546868871-7041f2a55e12", 7999),
        ("smartwatch-max", "SmartWatch Max", "photo-1523275335684-37898b6baf30", 14900),
        ("modern-laptop-air-13", "Modern Laptop Air 13", "photo-1583394838336-acd977736f90", 89999),
        ("desk-air-purifier", "Desk Air Purifier", "photo-1521572267360-ee0c2909d518", 6499),
        ("studio-wireless-headphones", "Studio Wireless Headphones", "photo-1505740420928-5e560c06d30e", 8999),
        ("compact-air-fryer", "Compact Air Fryer", "photo-1556911220-bff31c812dba", 5999),
        ("weekender-travel-bag", "Weekender Travel Bag", "photo-1548036328-c9fa89d128fa", 4799),
        ("smart-desk-lamp-pro", "Smart Desk Lamp Pro", "photo-1507473885765-e6ed057f782c", 3999),
        ("daily-hydration-serum-set", "Daily Hydration Serum Set", "photo-1608248543803-ba4f8c70ae0b", 2799),
        ("adjustable-dumbbell-set", "Adjustable Dumbbell Set", "photo-1517836357463-d25dfeac3438", 6999),
        ("portable-bluetooth-speaker", "Portable Bluetooth Speaker", "photo-1608043152269-423dbba4e7e1", 4299),
        ("artisan-pour-over-kit", "Artisan Pour-Over Kit", "photo-1495474472287-4d71bcdd2085", 2899),
        ("pocket-instant-camera", "Pocket Instant Camera", "photo-1516035069371-29a1b244cc32", 8999),
        ("commuter-rolltop-backpack", "Commuter Rolltop Backpack", "photo-1553062407-98eeb64c6a62", 7200),
        ("ceramic-planter-trio", "Ceramic Planter Trio", "photo-1485955900006-10f4d324d411", 3450),
        ("performance-yoga-mat", "Performance Yoga Mat", "photo-1599447421416-3414500d18a5", 3900),
        ("hardcover-daily-journal", "Hardcover Daily Journal", "photo-1494438639946-1ebd1d20bf85", 1800),
        ("relaxed-linen-shirt", "Relaxed Linen Shirt", "photo-1490481651871-ab68de25d43d", 4999),
        ("glass-meal-prep-set", "Glass Meal Prep Set", "photo-1546069901-ba9599a7e63c", 3299),
        ("botanical-hand-cream-trio", "Botanical Hand Cream Trio", "photo-1608571423902-eed4a5ad8108", 2100),
        ("wireless-folding-keyboard", "Wireless Folding Keyboard", "photo-1516321318423-f06f85e504b3", 4495),
        ("sculptural-ceramic-vase", "Sculptural Ceramic Vase", "photo-1578749556568-bc2c40e68b61", 2850),
        ("linen-cushion-set", "Linen Cushion Set", "photo-1584100936595-c0654b55a2e2", 3299),
        ("ceramic-table-lamp", "Ceramic Table Lamp", "photo-1507473885765-e6ed057f782c", 4800),
        ("wireless-noise-canceling-headphones", "Wireless Noise-Canceling Headphones", "photo-1505740420928-5e560c06d30e", 12999),
        ("compact-bluetooth-speaker", "Compact Bluetooth Speaker", "photo-1608043152269-423dbba4e7e1", 5450),
        ("everyday-canvas-sneakers", "Everyday Canvas Sneakers", "photo-1542291026-7eec264c27ff", 6800),
        ("classic-crossbody-bag", "Classic Crossbody Bag", "photo-1548036328-c9fa89d128fa", 4295),
        ("hydrating-face-serum", "Hydrating Face Serum", "photo-1608248543803-ba4f8c70ae0b", 2400),
        ("daily-glow-skin-set", "Daily Glow Skin Set", "photo-1556229010-6c3f2c9ca5f8", 3850),
        ("pour-over-coffee-set", "Pour-Over Coffee Set", "photo-1495474472287-4d71bcdd2085", 3699),
        ("stainless-steel-cookware", "Stainless Steel Cookware", "photo-1556911220-bff31c812dba", 8900),
        ("adjustable-desk-organizer", "Adjustable Desk Organizer", "photo-1498050108023-c5249f4df085", 2999),
        ("ergonomic-wireless-mouse", "Ergonomic Wireless Mouse", "photo-1527864550417-7fd91fc51a46", 3995),
        ("insulated-steel-water-bottle", "Insulated Steel Water Bottle", "photo-1602143407151-7111542de6e8", 2200),
        ("resistance-band-training-set", "Resistance Band Training Set", "photo-1517836357463-d25dfeac3438", 2750),
    ]
}
PRODUCT_SEED_CATEGORIES = {
    **dict.fromkeys(
        [
            "desk-air-purifier",
            "ceramic-planter-trio",
            "sculptural-ceramic-vase",
            "linen-cushion-set",
            "ceramic-table-lamp",
        ],
        "Home essentials",
    ),
    **dict.fromkeys(
        [
            "wireless-earbuds-pro",
            "smartwatch-max",
            "modern-laptop-air-13",
            "studio-wireless-headphones",
            "portable-bluetooth-speaker",
            "compact-bluetooth-speaker",
            "pocket-instant-camera",
            "wireless-folding-keyboard",
            "wireless-noise-canceling-headphones",
        ],
        "Electronics",
    ),
    **dict.fromkeys(
        [
            "weekender-travel-bag",
            "commuter-rolltop-backpack",
            "relaxed-linen-shirt",
            "everyday-canvas-sneakers",
            "classic-crossbody-bag",
        ],
        "Fashion",
    ),
    **dict.fromkeys(
        ["daily-hydration-serum-set", "botanical-hand-cream-trio", "hydrating-face-serum", "daily-glow-skin-set"],
        "Beauty",
    ),
    **dict.fromkeys(
        [
            "compact-air-fryer",
            "artisan-pour-over-kit",
            "glass-meal-prep-set",
            "pour-over-coffee-set",
            "stainless-steel-cookware",
        ],
        "Kitchen",
    ),
    **dict.fromkeys(
        ["smart-desk-lamp-pro", "hardcover-daily-journal", "adjustable-desk-organizer", "ergonomic-wireless-mouse"],
        "Office",
    ),
    **dict.fromkeys(["adjustable-dumbbell-set", "performance-yoga-mat", "insulated-steel-water-bottle", "resistance-band-training-set"], "Fitness"),
}


class DatabaseConnection:
    def __init__(self, connection, postgres: bool):
        self.connection = connection
        self.postgres = postgres

    def __enter__(self):
        self.connection.__enter__()
        return self

    def __exit__(self, exception_type, exception, traceback):
        try:
            return self.connection.__exit__(exception_type, exception, traceback)
        finally:
            self.connection.close()

    def execute(self, statement: str, parameters=()):
        if not self.postgres:
            return self.connection.execute(statement, parameters)

        statement = self._postgres_statement(statement)
        return self.connection.execute(statement.replace("?", "%s"), parameters)

    def executemany(self, statement: str, parameter_rows):
        if not self.postgres:
            return self.connection.executemany(statement, parameter_rows)
        statement = self._postgres_statement(statement)
        return self.connection.executemany(statement.replace("?", "%s"), parameter_rows)

    @staticmethod
    def _postgres_statement(statement: str) -> str:
        if re.match(r"^\s*PRAGMA\b", statement, re.IGNORECASE):
            return ""
        statement = re.sub(
            r"\bemail\s*=\s*\?",
            "LOWER(email) = LOWER(?)",
            statement,
            flags=re.IGNORECASE,
        )
        statement = re.sub(r"\s+COLLATE\s+NOCASE\b", "", statement, flags=re.IGNORECASE)
        ignored_conflicts = bool(re.match(r"\s*INSERT\s+OR\s+IGNORE\s+INTO\b", statement, re.IGNORECASE))
        if ignored_conflicts:
            statement = re.sub(
                r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\b",
                "INSERT INTO",
                statement,
                flags=re.IGNORECASE,
            )
            statement = statement.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
        statement = re.sub(r"\bINTEGER\s+PRIMARY\s+KEY\b", "SERIAL PRIMARY KEY", statement, flags=re.IGNORECASE)
        return re.sub(r"\bBLOB\b", "BYTEA", statement, flags=re.IGNORECASE)

    def executescript(self, script: str) -> None:
        if not self.postgres:
            self.connection.executescript(script)
            return
        for statement in script.split(";"):
            if statement.strip():
                self.execute(statement)


def connect_db():
    if DATABASE_URL:
        if psycopg is None:
            raise RuntimeError("DATABASE_URL is set but psycopg is not installed. Install requirements.txt.")
        return DatabaseConnection(
            psycopg.connect(DATABASE_URL, connect_timeout=10, row_factory=dict_row),
            postgres=True,
        )

    connection = sqlite3.connect(DATABASE, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return DatabaseConnection(connection, postgres=False)


def migrate_legacy_database() -> None:
    legacy_files = (
        Path(f"{LEGACY_DATABASE}-wal"),
        Path(f"{LEGACY_DATABASE}-shm"),
        LEGACY_DATABASE,
    )
    if DATABASE.exists():
        if any(path.exists() for path in legacy_files):
            raise RuntimeError(
                f"Both private and website-folder databases exist. Keep the private database at {DATABASE} "
                "and move the legacy database files out of the website folder before restarting."
            )
        return
    if not LEGACY_DATABASE.exists():
        return

    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    temporary_database = DATABASE_DIR / f".northgate-migration-{os.getpid()}.sqlite3"
    try:
        source = sqlite3.connect(LEGACY_DATABASE, timeout=10)
        try:
            destination = sqlite3.connect(temporary_database, timeout=10)
            try:
                source.backup(destination)
            finally:
                destination.close()
        finally:
            source.close()
        os.replace(temporary_database, DATABASE)
    except Exception as error:
        if temporary_database.exists():
            temporary_database.unlink()
        raise RuntimeError(f"Could not safely migrate the existing Northgate database to {DATABASE}.") from error

    for path in legacy_files:
        if path.exists():
            try:
                path.unlink()
            except OSError as error:
                raise RuntimeError(f"Could not remove the migrated database file {path}.") from error


def initialize_database() -> None:
    if not DATABASE_URL:
        DATABASE_DIR.mkdir(parents=True, exist_ok=True)
        migrate_legacy_database()
    with connect_db() as connection:
        connection.executescript(
            """
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                email TEXT NOT NULL,
                username TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
                seller_enabled INTEGER NOT NULL DEFAULT 0,
                email_verified INTEGER NOT NULL DEFAULT 0,
                phone TEXT NOT NULL DEFAULT '',
                gender TEXT NOT NULL DEFAULT '',
                birth_day TEXT NOT NULL DEFAULT '',
                birth_month TEXT NOT NULL DEFAULT '',
                birth_year TEXT NOT NULL DEFAULT '',
                avatar_image TEXT NOT NULL DEFAULT '',
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
            CREATE TABLE IF NOT EXISTS login_attempts (
                email_hash TEXT PRIMARY KEY,
                failed_attempts INTEGER NOT NULL DEFAULT 0,
                locked_until INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS email_verifications (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                code_salt BLOB NOT NULL,
                code_hash BLOB NOT NULL,
                expires_at INTEGER NOT NULL,
                last_sent_at INTEGER NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS addresses (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                label TEXT NOT NULL DEFAULT 'Home',
                recipient TEXT NOT NULL,
                phone TEXT NOT NULL,
                street TEXT NOT NULL,
                city TEXT NOT NULL,
                postal_code TEXT NOT NULL,
                country TEXT NOT NULL DEFAULT 'Philippines',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS addresses_user_id ON addresses(user_id);
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                delivery_email TEXT NOT NULL,
                phone TEXT NOT NULL,
                street TEXT NOT NULL,
                city TEXT NOT NULL,
                postal_code TEXT NOT NULL,
                payment_method TEXT NOT NULL,
                subtotal_cents INTEGER NOT NULL,
                shipping_cents INTEGER NOT NULL,
                total_cents INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS orders_user_date ON orders(user_id, created_at DESC);
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY,
                order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                image TEXT NOT NULL,
                unit_price_cents INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                variant_id TEXT,
                variant_sku TEXT NOT NULL DEFAULT '',
                variant_size TEXT NOT NULL DEFAULT '',
                variant_color TEXT NOT NULL DEFAULT '',
                seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL
            );
            """
        )
        connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (LOWER(email))")
        if DATABASE_URL:
            user_columns = {
                row["column_name"]
                for row in connection.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
                )
            }
        else:
            user_columns = {row["name"] for row in connection.execute("PRAGMA table_info(users)")}
        if "role" not in user_columns:
            connection.execute(
                "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin'))"
            )
        if "seller_enabled" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN seller_enabled INTEGER NOT NULL DEFAULT 0")
        if "email_verified" not in user_columns:
            connection.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1")
        connection.execute(
            """CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                image TEXT NOT NULL,
                price_cents INTEGER NOT NULL,
                active INTEGER NOT NULL DEFAULT 1,
                category TEXT NOT NULL DEFAULT 'Fashion',
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                archived_from_status TEXT NOT NULL DEFAULT 'active',
                owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                low_stock_threshold INTEGER NOT NULL DEFAULT 5,
                stock INTEGER,
                created_at TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT ''
            )"""
        )
        if DATABASE_URL:
            product_columns = {
                row["column_name"]
                for row in connection.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'products'"
                )
            }
        else:
            product_columns = {row["name"] for row in connection.execute("PRAGMA table_info(products)")}
        product_migrations = {
            "category": "TEXT NOT NULL DEFAULT 'Fashion'",
            "description": "TEXT NOT NULL DEFAULT ''",
            "status": "TEXT NOT NULL DEFAULT 'active'",
            "archived_from_status": "TEXT NOT NULL DEFAULT 'active'",
            "owner_id": "INTEGER REFERENCES users(id) ON DELETE SET NULL",
            "low_stock_threshold": "INTEGER NOT NULL DEFAULT 5",
            "stock": "INTEGER",
            "created_at": "TEXT NOT NULL DEFAULT ''",
            "updated_at": "TEXT NOT NULL DEFAULT ''",
        }
        for column, definition in product_migrations.items():
            if column not in product_columns:
                connection.execute(f"ALTER TABLE products ADD COLUMN {column} {definition}")
        if DATABASE_URL:
            order_item_columns = {
                row["column_name"]
                for row in connection.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'order_items'"
                )
            }
        else:
            order_item_columns = {row["name"] for row in connection.execute("PRAGMA table_info(order_items)")}
        for column, definition in {
            "variant_id": "TEXT",
            "variant_sku": "TEXT NOT NULL DEFAULT ''",
            "variant_size": "TEXT NOT NULL DEFAULT ''",
            "variant_color": "TEXT NOT NULL DEFAULT ''",
            "seller_id": "INTEGER REFERENCES users(id) ON DELETE SET NULL",
        }.items():
            if column not in order_item_columns:
                connection.execute(f"ALTER TABLE order_items ADD COLUMN {column} {definition}")
        connection.execute(
            """UPDATE order_items
               SET seller_id = (SELECT owner_id FROM products WHERE products.id = order_items.product_id)
               WHERE seller_id IS NULL
                 AND EXISTS (SELECT 1 FROM products WHERE products.id = order_items.product_id)"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS product_images (
                id INTEGER PRIMARY KEY,
                product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                path TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                is_main INTEGER NOT NULL DEFAULT 0,
                UNIQUE(product_id, path)
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS product_variants (
                id TEXT PRIMARY KEY,
                product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                size TEXT NOT NULL DEFAULT '',
                color TEXT NOT NULL DEFAULT '',
                stock INTEGER NOT NULL DEFAULT 0,
                sku TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(product_id, sku)
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS product_reviews (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
                comment TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, product_id)
            )"""
        )
        connection.execute("CREATE INDEX IF NOT EXISTS product_reviews_product_date ON product_reviews(product_id, created_at DESC)")
        connection.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_lower ON product_variants (LOWER(sku))"
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS product_activity (
                id INTEGER PRIMARY KEY,
                product_id TEXT NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                actor_email TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        connection.execute("CREATE INDEX IF NOT EXISTS products_status_created ON products(status, created_at DESC)")
        connection.execute("CREATE INDEX IF NOT EXISTS product_variants_product ON product_variants(product_id)")
        connection.execute("CREATE INDEX IF NOT EXISTS product_activity_product ON product_activity(product_id, created_at DESC)")
        connection.executemany(
            "INSERT OR IGNORE INTO products (id, name, image, price_cents) VALUES (?, ?, ?, ?)",
            [(product_id, name, image, price) for product_id, (name, image, price) in PRODUCTS.items()],
        )
        seeded_at = now_iso()
        for product_id, category in PRODUCT_SEED_CATEGORIES.items():
            connection.execute(
                """UPDATE products SET category=?, created_at=CASE WHEN created_at='' THEN ? ELSE created_at END,
                   updated_at=CASE WHEN updated_at='' THEN ? ELSE updated_at END,
                   status=CASE WHEN active=0 THEN 'archived' ELSE status END
                   WHERE id=?""",
                (category, seeded_at, seeded_at, product_id),
            )
        connection.executemany(
            """INSERT OR IGNORE INTO product_images (product_id, path, position, is_main)
               VALUES (?, ?, 0, 1)""",
            [(product_id, image) for product_id, (_, image, _) in PRODUCTS.items()],
        )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_whole_number(value, error_message: str) -> int:
    if isinstance(value, bool):
        raise ValueError(error_message)
    if isinstance(value, int):
        return value
    if isinstance(value, str) and re.fullmatch(r"\d+", value.strip()):
        return int(value)
    raise ValueError(error_message)


def password_digest(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)


def send_verification_email(email: str, code: str) -> None:
    username = os.environ.get("NORTHGATE_SMTP_USERNAME", "").strip()
    password = os.environ.get("NORTHGATE_SMTP_PASSWORD", "")
    sender = os.environ.get("NORTHGATE_SMTP_FROM", username).strip()
    if not username or not password or not sender:
        raise EmailDeliveryError(
            "Email verification is not configured. Set NORTHGATE_SMTP_USERNAME and "
            "NORTHGATE_SMTP_PASSWORD to a Gmail address and its App Password, then restart Northgate."
        )

    message = EmailMessage()
    message["Subject"] = "Your Northgate verification code"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        f"Your Northgate verification code is {code}.\n\n"
        "It expires in 10 minutes. If you did not request this code, you can ignore this email."
    )
    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(username, password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        raise EmailDeliveryError(
            "Gmail could not send the verification email. Check the Gmail address and App Password, then try again."
        ) from error


class NorthgateHandler(SimpleHTTPRequestHandler):
    server_version = "NorthgateLocal/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        elif urlsplit(self.path).path in ("/admin.html", "/seller.html"):
            self.send_header("Cache-Control", "no-store")
        elif urlsplit(self.path).path.endswith((".css", ".js")):
            self.send_header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def _send_json(self, payload: dict, status: int = 200, extra_headers: list[tuple[str, str]] | None = None) -> None:
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        for name, value in extra_headers or []:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(encoded)

    def _read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid request length.") from error
        if length < 0 or length > MAX_BODY_BYTES:
            raise ValueError("Request is too large.")
        try:
            value = json.loads(self.rfile.read(length) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValueError("Request body must be valid JSON.") from error
        if not isinstance(value, dict):
            raise ValueError("Request body must be a JSON object.")
        return value

    def _send_error(self, message: str, status: int = 400) -> None:
        self._send_json({"error": message}, status)

    def _check_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        return urlsplit(origin).netloc.lower() == self.headers.get("Host", "").lower()

    def _session_token(self) -> str | None:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            return None
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else None

    def _current_user(self, connection: sqlite3.Connection) -> sqlite3.Row | None:
        token = self._session_token()
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        row = connection.execute(
            """SELECT users.* FROM sessions
               JOIN users ON users.id = sessions.user_id
               WHERE sessions.token_hash = ? AND sessions.expires_at > ?""",
            (token_hash, int(time.time())),
        ).fetchone()
        if row is None:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        return row

    def _require_user(self, connection: sqlite3.Connection) -> sqlite3.Row:
        user = self._current_user(connection)
        if user is None:
            raise PermissionError("Please sign in to continue.")
        return user

    def _require_admin(self, connection: sqlite3.Connection) -> sqlite3.Row:
        user = self._require_user(connection)
        if user["role"] != "admin":
            raise AdminRequiredError("Administrator access is required.")
        return user

    def _require_seller(self, connection: sqlite3.Connection) -> sqlite3.Row:
        user = self._require_user(connection)
        if user["role"] == "admin" or not user["seller_enabled"]:
            raise AdminRequiredError("Seller access is required.")
        return user

    def _require_product_manager(self, connection: sqlite3.Connection) -> sqlite3.Row:
        user = self._require_user(connection)
        if user["role"] != "admin" and not user["seller_enabled"]:
            raise AdminRequiredError("Seller or administrator access is required.")
        return user

    def _dashboard_api_path(self, path: str) -> str:
        for role in ("admin", "seller"):
            source = f"/api/{role}/"
            target = "/api/admin/"
            is_manager_path = path.startswith(f"/api/{role}/products/") or path == f"/api/{role}/products"
            is_image_path = path == f"/api/{role}/product-images"
            if not (is_manager_path or is_image_path):
                continue
            with connect_db() as connection:
                if role == "admin":
                    self._require_admin(connection)
                else:
                    self._require_seller(connection)
            return path.replace(source, target, 1)
        return path

    def _guard_dashboard_page(self, path: str) -> bool:
        page_roles = {"/admin.html": "admin", "/seller.html": "seller"}
        required_role = page_roles.get(path)
        if required_role is None:
            return False

        with connect_db() as connection:
            user = self._current_user(connection)

        if user is None:
            destination = f"{required_role}-login.html"
        elif required_role == "admin" and user["role"] != "admin":
            destination = "seller.html" if user["seller_enabled"] else "admin-login.html"
        elif required_role == "seller" and (user["role"] == "admin" or not user["seller_enabled"]):
            destination = "admin.html" if user["role"] == "admin" else "seller-login.html"
        else:
            return False

        self.send_response(303)
        self.send_header("Location", destination)
        self.send_header("Content-Length", "0")
        self.end_headers()
        return True

    @staticmethod
    def _product_json(connection: sqlite3.Connection, row: sqlite3.Row, public: bool = False) -> dict:
        images = connection.execute(
            "SELECT path, is_main FROM product_images WHERE product_id=? ORDER BY position, id",
            (row["id"],),
        ).fetchall()
        variants = connection.execute(
            "SELECT id, size, color, stock, sku FROM product_variants WHERE product_id=? ORDER BY size, color, sku",
            (row["id"],),
        ).fetchall()
        activity = connection.execute(
            """SELECT actor_email, action, details, created_at FROM product_activity
               WHERE product_id=? ORDER BY id DESC LIMIT 10""",
            (row["id"],),
        ).fetchall()
        product = {
            "id": row["id"],
            "name": row["name"],
            "image": row["image"],
            "images": [{"path": image["path"], "isMain": bool(image["is_main"])} for image in images],
            "price": row["price_cents"] / 100,
            "category": row["category"],
            "description": row["description"],
            "status": row["status"],
            "lowStockThreshold": row["low_stock_threshold"],
            "stock": row["stock"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "variants": [
                {
                    "id": variant["id"],
                    "size": variant["size"],
                    "color": variant["color"],
                    "stock": variant["stock"],
                    "sku": variant["sku"],
                }
                for variant in variants
            ],
        }
        review_summary = connection.execute(
            "SELECT ROUND(AVG(rating), 1) AS rating, COUNT(*) AS count FROM product_reviews WHERE product_id=?",
            (row["id"],),
        ).fetchone()
        product["reviewCount"] = review_summary["count"]
        if review_summary["count"]:
            product["rating"] = float(review_summary["rating"])
            product["reviews"] = [
                {
                    "rating": review["rating"],
                    "comment": review["comment"],
                    "createdAt": review["created_at"],
                }
                for review in connection.execute(
                    """SELECT rating, comment, created_at FROM product_reviews
                       WHERE product_id=? ORDER BY created_at DESC LIMIT 5""",
                    (row["id"],),
                ).fetchall()
            ]
        if not public:
            product.update(
                ownerId=row["owner_id"],
                archivedFromStatus=row["archived_from_status"],
                activity=[
                {
                    "actorEmail": event["actor_email"],
                    "action": event["action"],
                    "details": event["details"],
                    "createdAt": event["created_at"],
                }
                for event in activity
                ],
            )
        return product

    def _product_for_manager(self, connection: sqlite3.Connection, product_id: str, user: sqlite3.Row):
        query = "SELECT * FROM products WHERE id=?"
        parameters = [product_id]
        if user["role"] != "admin":
            query += " AND owner_id=?"
            parameters.append(user["id"])
        return connection.execute(query, parameters).fetchone()

    @staticmethod
    def _record_product_activity(
        connection: sqlite3.Connection,
        product_id: str,
        user: sqlite3.Row,
        action: str,
        details: str,
    ) -> None:
        connection.execute(
            """INSERT INTO product_activity (product_id, user_id, actor_email, action, details, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (product_id, user["id"], user["email"], action, details[:500], now_iso()),
        )

    @staticmethod
    def _validated_product(data: dict) -> dict:
        name = data.get("name")
        category = data.get("category")
        description = data.get("description", "")
        status = data.get("status", "draft")
        image_paths = data.get("images")
        variants = data.get("variants", [])
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
            raise ValueError("Product name must be between 1 and 120 characters.")
        if not isinstance(category, str) or category not in PRODUCT_CATEGORIES:
            raise ValueError("Choose a valid product category.")
        if not isinstance(description, str) or len(description.strip()) > 4000:
            raise ValueError("Product description must be 4,000 characters or fewer.")
        if not isinstance(status, str) or status not in PRODUCT_STATUSES:
            raise ValueError("Choose Active, Draft, or Archived status.")
        try:
            price = round(float(data.get("price")), 2)
            threshold = parse_whole_number(data.get("lowStockThreshold", 5), "Stock threshold must be a whole number.")
            stock_value = data.get("stock", 0)
            stock = None if stock_value is None or stock_value == "" else parse_whole_number(
                stock_value,
                "Product stock must be a whole number.",
            )
        except (TypeError, ValueError, OverflowError) as error:
            raise ValueError("Enter a valid product price and low-stock threshold.") from error
        if (
            not 0 < price <= 1_000_000
            or not 0 <= threshold <= 1_000_000
            or (stock is not None and not 0 <= stock <= 1_000_000)
        ):
            raise ValueError("Price must be greater than zero and the stock threshold cannot be negative.")
        if not isinstance(image_paths, list) or not 1 <= len(image_paths) <= PRODUCT_IMAGE_LIMIT:
            raise ValueError("Add between 1 and 5 product photos.")
        cleaned_images = []
        for path in image_paths:
            if not isinstance(path, str) or len(path) > 2048:
                raise ValueError("Each product photo must have a valid image path.")
            path = path.strip()
            if not (
                re.fullmatch(r"photo-[A-Za-z0-9-]+", path)
                or re.fullmatch(r"/product-images/[A-Za-z0-9._-]+", path)
                or re.fullmatch(r"https://[^\s<>]+", path)
            ):
                raise ValueError("Use a valid HTTPS image URL or an uploaded product photo.")
            if path not in cleaned_images:
                cleaned_images.append(path)
        if not cleaned_images:
            raise ValueError("Add at least one product photo.")
        if not isinstance(variants, list) or len(variants) > 100:
            raise ValueError("A product can have up to 100 variants.")
        cleaned_variants = []
        seen_skus = set()
        for variant in variants:
            if not isinstance(variant, dict):
                raise ValueError("Each product variant must be an object.")
            size = str(variant.get("size", "")).strip()[:40]
            color = str(variant.get("color", "")).strip()[:40]
            sku = str(variant.get("sku", "")).strip()[:80]
            if not sku or sku.lower() in seen_skus:
                raise ValueError("Each variant needs a unique SKU.")
            try:
                stock = parse_whole_number(variant.get("stock"), "Variant stock must be a whole number.")
            except ValueError as error:
                raise ValueError("Variant stock must be a whole number.") from error
            if stock < 0 or stock > 1_000_000:
                raise ValueError("Variant stock must be between 0 and 1,000,000.")
            seen_skus.add(sku.lower())
            cleaned_variants.append({"size": size, "color": color, "sku": sku, "stock": stock})
        return {
            "name": name.strip(),
            "category": category,
            "description": description.strip(),
            "price_cents": int(round(price * 100)),
            "status": status,
            "images": cleaned_images,
            "image": cleaned_images[0],
            "low_stock_threshold": threshold,
            "stock": stock if not cleaned_variants else None,
            "variants": cleaned_variants,
        }

    @staticmethod
    def _account_json(user: sqlite3.Row) -> dict:
        return {
            "id": user["id"],
            "email": user["email"],
            "displayName": user["username"],
            "username": user["username"],
            "name": user["full_name"],
            "phone": user["phone"],
            "gender": user["gender"],
            "dateOfBirth": {
                "day": user["birth_day"],
                "month": user["birth_month"],
                "year": user["birth_year"],
            },
            "avatarImage": user["avatar_image"],
            "createdAt": user["created_at"],
            "isAdmin": user["role"] == "admin",
            "isSeller": user["role"] != "admin" and bool(user["seller_enabled"]),
        }

    def _new_session(self, connection: sqlite3.Connection, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (token_hash, user_id, int(time.time()) + SESSION_SECONDS),
        )
        return token

    @staticmethod
    def _create_verification_challenge(connection: sqlite3.Connection, user_id: int) -> str:
        code = f"{secrets.randbelow(1_000_000):06d}"
        salt = secrets.token_bytes(16)
        connection.execute("DELETE FROM email_verifications WHERE user_id=?", (user_id,))
        connection.execute(
            """INSERT INTO email_verifications
               (user_id, code_salt, code_hash, expires_at, last_sent_at, attempts)
               VALUES (?, ?, ?, ?, ?, 0)""",
            (
                user_id,
                salt,
                password_digest(code, salt),
                int(time.time()) + 600,
                int(time.time()),
            ),
        )
        return code

    @staticmethod
    def _send_verification_code(email: str, code: str) -> None:
        try:
            send_verification_email(email, code)
        except EmailDeliveryError:
            with connect_db() as connection:
                connection.execute(
                    """UPDATE email_verifications SET last_sent_at=0
                       WHERE user_id=(SELECT id FROM users WHERE email=? COLLATE NOCASE)""",
                    (email,),
                )
            raise

    def _cookie_header(self, token: str, max_age: int = SESSION_SECONDS) -> tuple[str, str]:
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
        return (
            "Set-Cookie",
            f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{secure}",
        )

    def _clear_cookie_header(self) -> tuple[str, str]:
        return ("Set-Cookie", f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")

    def _address_json(self, row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "label": row["label"],
            "recipient": row["recipient"],
            "phone": row["phone"],
            "street": row["street"],
            "city": row["city"],
            "postalCode": row["postal_code"],
            "country": row["country"],
            "isDefault": bool(row["is_default"]),
        }

    def _order_json(
        self,
        connection: sqlite3.Connection,
        row: sqlite3.Row,
        seller_id: int | None = None,
        include_customer_reviews: bool = False,
    ) -> dict:
        item_query = """SELECT order_items.product_id, order_items.product_name, order_items.image,
                               order_items.unit_price_cents, order_items.quantity, order_items.variant_id,
                               order_items.variant_sku, order_items.variant_size, order_items.variant_color
                        FROM order_items"""
        parameters: tuple = (row["id"],)
        if seller_id is None:
            item_query += " WHERE order_items.order_id = ?"
        else:
            item_query += " WHERE order_items.order_id = ? AND order_items.seller_id = ?"
            parameters = (row["id"], seller_id)
        items = connection.execute(item_query + " ORDER BY order_items.id", parameters).fetchall()
        seller_total = sum(item["unit_price_cents"] * item["quantity"] for item in items) / 100
        order_items = []
        for item in items:
            order_item = {
                "id": item["product_id"],
                "name": item["product_name"],
                "image": item["image"],
                "price": item["unit_price_cents"] / 100,
                "quantity": item["quantity"],
                "variantId": item["variant_id"],
                "variantSku": item["variant_sku"],
                "size": item["variant_size"],
                "color": item["variant_color"],
            }
            if include_customer_reviews:
                review = connection.execute(
                    "SELECT rating, comment, created_at FROM product_reviews WHERE user_id=? AND product_id=?",
                    (row["user_id"], item["product_id"]),
                ).fetchone()
                order_item["review"] = (
                    {
                        "rating": review["rating"],
                        "comment": review["comment"],
                        "createdAt": review["created_at"],
                    }
                    if review
                    else None
                )
            order_items.append(order_item)
        return {
            "id": row["id"],
            "createdAt": row["created_at"],
            "status": row["status"],
            "customerEmail": row["delivery_email"],
            "customerName": row["customer_name"],
            "phone": row["phone"],
            "address": {
                "street": row["street"],
                "city": row["city"],
                "postalCode": row["postal_code"],
            },
            "paymentMethod": row["payment_method"],
            "items": order_items,
            "subtotal": seller_total if seller_id is not None else row["subtotal_cents"] / 100,
            "shipping": 0 if seller_id is not None else row["shipping_cents"] / 100,
            "total": seller_total if seller_id is not None else row["total_cents"] / 100,
        }

    def _handle_api_get(self, path: str) -> bool:
        with connect_db() as connection:
            if path == "/api/health":
                connection.execute("SELECT 1")
                self._send_json(
                    {
                        "ok": True,
                        "sellerRegistration": True,
                        "emailOtp": True,
                        "sellerOrders": True,
                        "productReviews": True,
                    }
                )
                return True
            if path == "/api/session":
                user = self._current_user(connection)
                self._send_json({"account": self._account_json(user) if user else None})
                return True
            if path == "/api/admin/orders":
                self._require_admin(connection)
                rows = connection.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall()
                self._send_json({"orders": [self._order_json(connection, row) for row in rows]})
                return True
            if path == "/api/seller/orders":
                seller = self._require_seller(connection)
                rows = connection.execute(
                    """SELECT DISTINCT orders.*
                       FROM orders
                       JOIN order_items ON order_items.order_id = orders.id
                       WHERE order_items.seller_id = ?
                       ORDER BY orders.created_at DESC""",
                    (seller["id"],),
                ).fetchall()
                self._send_json(
                    {
                        "orders": [
                            self._order_json(connection, row, seller_id=seller["id"])
                            for row in rows
                        ]
                    }
                )
                return True
            if path == "/api/admin/users":
                self._require_admin(connection)
                rows = connection.execute(
                    """SELECT id, username, full_name, email, role, seller_enabled,
                              email_verified, created_at
                       FROM users ORDER BY created_at DESC, id DESC"""
                ).fetchall()
                self._send_json(
                    {
                        "users": [
                            {
                                "username": row["username"],
                                "name": row["full_name"],
                                "email": row["email"],
                                "role": "seller" if row["seller_enabled"] and row["role"] != "admin" else row["role"],
                                "emailVerified": bool(row["email_verified"]),
                                "createdAt": row["created_at"],
                            }
                            for row in rows
                        ]
                    }
                )
                return True
            if path == "/api/products":
                rows = connection.execute(
                    "SELECT * FROM products WHERE status='active' AND active=1 ORDER BY created_at DESC, name"
                ).fetchall()
                self._send_json({"products": [self._product_json(connection, row, public=True) for row in rows]})
                return True
            if path == "/api/admin/products":
                user = self._require_product_manager(connection)
                query = "SELECT * FROM products"
                parameters = []
                if user["role"] != "admin":
                    query += " WHERE owner_id=?"
                    parameters.append(user["id"])
                query += " ORDER BY updated_at DESC, name"
                rows = connection.execute(query, parameters).fetchall()
                products = [self._product_json(connection, row) for row in rows]
                self._send_json({"products": products})
                return True
            if path == "/api/addresses":
                user = self._require_user(connection)
                rows = connection.execute(
                    "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC",
                    (user["id"],),
                ).fetchall()
                self._send_json({"addresses": [self._address_json(row) for row in rows]})
                return True
            if path == "/api/orders":
                user = self._require_user(connection)
                rows = connection.execute(
                    "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
                    (user["id"],),
                ).fetchall()
                self._send_json(
                    {"orders": [self._order_json(connection, row, include_customer_reviews=True) for row in rows]}
                )
                return True
        return False

    def _handle_api_post(self, path: str, data: dict) -> bool:
        if not self._check_origin():
            self._send_error("Cross-site request rejected.", 403)
            return True

        if path in ("/api/register", "/api/seller/register"):
            email = str(data.get("email", "")).strip().lower()
            password = str(data.get("password", ""))
            name = str(data.get("name", "")).strip()
            if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254:
                self._send_error("Enter a valid email address.")
                return True
            if len(password) < 8 or len(password) > 128:
                self._send_error("Password must be between 8 and 128 characters.")
                return True
            if not name or len(name) > 80:
                self._send_error("Enter a name no longer than 80 characters.")
                return True

            salt = secrets.token_bytes(16)
            with connect_db() as connection:
                try:
                    cursor = connection.execute(
                        """INSERT INTO users (
                               email, username, full_name, seller_enabled, password_salt, password_hash, created_at
                           ) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id""",
                        (
                            email,
                            name,
                            name,
                            int(path == "/api/seller/register"),
                            salt,
                            password_digest(password, salt),
                            now_iso(),
                        ),
                    )
                except DATABASE_INTEGRITY_ERRORS:
                    self._send_error("An account with that email already exists. Sign in instead.", 409)
                    return True
                user_id = cursor.fetchone()["id"]
                code = self._create_verification_challenge(connection, user_id)

            try:
                self._send_verification_code(email, code)
            except EmailDeliveryError as error:
                print(f"Northgate could not send a signup verification email: {error}", flush=True)
                self._send_json(
                    {"error": str(error), "verificationRequired": True, "email": email},
                    503,
                )
                return True
            self._send_json({"verificationRequired": True, "email": email}, 202)
            return True

        if path == "/api/verify-email":
            email = str(data.get("email", "")).strip().lower()
            code = str(data.get("code", "")).strip()
            if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254 or not re.fullmatch(r"\d{6}", code):
                self._send_error("Enter the email address and six-digit verification code.")
                return True

            with connect_db() as connection:
                row = connection.execute(
                    """SELECT users.*, email_verifications.code_salt, email_verifications.code_hash,
                              email_verifications.expires_at, email_verifications.attempts
                       FROM users JOIN email_verifications ON email_verifications.user_id=users.id
                       WHERE users.email=? COLLATE NOCASE AND users.email_verified=0""",
                    (email,),
                ).fetchone()
                if row is None:
                    self._send_error("That verification code is invalid or has expired.", 400)
                    return True
                if row["expires_at"] <= int(time.time()):
                    connection.execute("DELETE FROM email_verifications WHERE user_id=?", (row["id"],))
                    self._send_error("That verification code has expired. Request a new code.", 410)
                    return True
                if row["attempts"] >= 5:
                    self._send_error("Too many incorrect codes. Request a new verification code.", 429)
                    return True

                actual_hash = password_digest(code, bytes(row["code_salt"]))
                if not hmac.compare_digest(actual_hash, bytes(row["code_hash"])):
                    attempts = row["attempts"] + 1
                    connection.execute(
                        "UPDATE email_verifications SET attempts=? WHERE user_id=?",
                        (attempts, row["id"]),
                    )
                    if attempts >= 5:
                        self._send_error("Too many incorrect codes. Request a new verification code.", 429)
                    else:
                        self._send_error("That verification code is incorrect.")
                    return True

                connection.execute("UPDATE users SET email_verified=1 WHERE id=?", (row["id"],))
                connection.execute("DELETE FROM email_verifications WHERE user_id=?", (row["id"],))
                user = connection.execute("SELECT * FROM users WHERE id=?", (row["id"],)).fetchone()
                token = self._new_session(connection, user["id"])
            self._send_json({"account": self._account_json(user)}, 200, [self._cookie_header(token)])
            return True

        if path == "/api/verify-email/resend":
            email = str(data.get("email", "")).strip().lower()
            if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254:
                self._send_error("Enter a valid email address.")
                return True
            with connect_db() as connection:
                user = connection.execute(
                    "SELECT id, email, email_verified FROM users WHERE email=? COLLATE NOCASE",
                    (email,),
                ).fetchone()
                if user is None:
                    self._send_error("No account is waiting for verification with that email.", 404)
                    return True
                if user["email_verified"]:
                    self._send_error("This email is already verified. Sign in instead.", 409)
                    return True
                challenge = connection.execute(
                    "SELECT last_sent_at FROM email_verifications WHERE user_id=?",
                    (user["id"],),
                ).fetchone()
                now = int(time.time())
                if challenge and now < challenge["last_sent_at"] + 60:
                    self._send_error("Wait a minute before requesting another verification code.", 429)
                    return True
                code = self._create_verification_challenge(connection, user["id"])
                email = user["email"]
            try:
                self._send_verification_code(email, code)
            except EmailDeliveryError as error:
                print(f"Northgate could not resend a signup verification email: {error}", flush=True)
                self._send_error(str(error), 503)
                return True
            self._send_json({"verificationRequired": True, "email": email})
            return True

        if path == "/api/admin/product-images":
            with connect_db() as connection:
                self._require_product_manager(connection)
            files = data.get("files")
            if not isinstance(files, list) or not 1 <= len(files) <= PRODUCT_IMAGE_LIMIT:
                self._send_error("Upload between 1 and 5 product photos at a time.")
                return True
            image_data = []
            for item in files:
                if not isinstance(item, dict):
                    self._send_error("Each uploaded photo must be a JPEG, PNG, or WebP image.")
                    return True
                mime = item.get("type")
                extension = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(mime)
                encoded = item.get("data")
                if not extension or not isinstance(encoded, str):
                    self._send_error("Product photos must be JPEG, PNG, or WebP files.")
                    return True
                try:
                    image_bytes = base64.b64decode(encoded, validate=True)
                except (ValueError, base64.binascii.Error):
                    self._send_error("An uploaded product photo is not valid base64 image data.")
                    return True
                if len(image_bytes) > MAX_PRODUCT_IMAGE_BYTES:
                    self._send_error("Each product photo must be 250 KB or smaller.")
                    return True
                valid_header = (
                    (mime == "image/jpeg" and image_bytes.startswith(b"\xff\xd8\xff"))
                    or (mime == "image/png" and image_bytes.startswith(b"\x89PNG\r\n\x1a\n"))
                    or (
                        mime == "image/webp"
                        and len(image_bytes) >= 12
                        and image_bytes[:4] == b"RIFF"
                        and image_bytes[8:12] == b"WEBP"
                    )
                )
                if not valid_header:
                    self._send_error("The uploaded photo contents do not match its image type.")
                    return True
                image_data.append((extension, image_bytes))
            saved_paths = []
            image_directory = ROOT / "product-images"
            image_directory.mkdir(exist_ok=True)
            for extension, image_bytes in image_data:
                filename = f"{secrets.token_hex(16)}{extension}"
                (image_directory / filename).write_bytes(image_bytes)
                saved_paths.append(f"/product-images/{filename}")
            self._send_json({"images": saved_paths}, 201)
            return True

        if path == "/api/admin/products":
            with connect_db() as connection:
                user = self._require_product_manager(connection)
                product = self._validated_product(data)
                for variant in product["variants"]:
                    if connection.execute(
                        "SELECT 1 FROM product_variants WHERE LOWER(sku)=LOWER(?)",
                        (variant["sku"],),
                    ).fetchone():
                        self._send_error(f"SKU {variant['sku']} is already assigned to a product.", 409)
                        return True
                product_id = re.sub(r"[^a-z0-9-]+", "-", product["name"].lower()).strip("-")[:60] or "product"
                product_id = f"{product_id}-{secrets.token_hex(4)}"
                created_at = now_iso()
                connection.execute(
                    """INSERT INTO products
                       (id, name, image, price_cents, active, category, description, status, owner_id,
                        low_stock_threshold, stock, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        product_id,
                        product["name"],
                        product["image"],
                        product["price_cents"],
                        int(product["status"] == "active"),
                        product["category"],
                        product["description"],
                        product["status"],
                        user["id"],
                        product["low_stock_threshold"],
                        product["stock"],
                        created_at,
                        created_at,
                    ),
                )
                connection.executemany(
                    """INSERT INTO product_images (product_id, path, position, is_main)
                       VALUES (?, ?, ?, ?)""",
                    [
                        (product_id, image, index, int(index == 0))
                        for index, image in enumerate(product["images"])
                    ],
                )
                connection.executemany(
                    """INSERT INTO product_variants (id, product_id, size, color, stock, sku, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    [
                        (secrets.token_hex(12), product_id, variant["size"], variant["color"], variant["stock"], variant["sku"], created_at)
                        for variant in product["variants"]
                    ],
                )
                self._record_product_activity(connection, product_id, user, "created", "Product created.")
                row = connection.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
                result = self._product_json(connection, row)
            self._send_json({"product": result}, 201)
            return True

        if path == "/api/admin/products/bulk":
            with connect_db() as connection:
                user = self._require_product_manager(connection)
                product_ids = data.get("productIds")
                action = data.get("action")
                if not isinstance(product_ids, list) or not 1 <= len(product_ids) <= 100:
                    self._send_error("Select between 1 and 100 products.")
                    return True
                product_ids = list(dict.fromkeys(str(product_id) for product_id in product_ids))
                if action == "status":
                    status = data.get("status")
                    if not isinstance(status, str) or status not in PRODUCT_STATUSES:
                        self._send_error("Choose Active, Draft, or Archived status.")
                        return True
                elif action == "category":
                    status = data.get("category")
                    if not isinstance(status, str) or status not in PRODUCT_CATEGORIES:
                        self._send_error("Choose a valid product category.")
                        return True
                elif action == "stock":
                    try:
                        stock = parse_whole_number(data.get("stock"), "Variant stock must be a whole number.")
                    except ValueError:
                        self._send_error("Variant stock must be a whole number.")
                        return True
                    if stock < 0 or stock > 1_000_000:
                        self._send_error("Variant stock must be between 0 and 1,000,000.")
                        return True
                elif action != "archive":
                    self._send_error("Choose a valid bulk action.")
                    return True

                rows = [self._product_for_manager(connection, product_id, user) for product_id in product_ids]
                if any(row is None for row in rows):
                    self._send_error("One or more products are unavailable or outside your seller account.", 404)
                    return True
                for row in rows:
                    if action == "category":
                        connection.execute(
                            "UPDATE products SET category=?, updated_at=? WHERE id=?",
                            (status, now_iso(), row["id"]),
                        )
                        details = f"Category changed to {status}."
                    elif action == "stock":
                        variants_updated = connection.execute(
                            "UPDATE product_variants SET stock=? WHERE product_id=?",
                            (stock, row["id"]),
                        ).rowcount
                        if not variants_updated:
                            connection.execute("UPDATE products SET stock=? WHERE id=?", (stock, row["id"]))
                        connection.execute(
                            "UPDATE products SET updated_at=? WHERE id=?",
                            (now_iso(), row["id"]),
                        )
                        details = f"Stock changed to {stock}."
                    else:
                        next_status = "archived" if action == "archive" else status
                        connection.execute(
                            """UPDATE products SET
                               archived_from_status=CASE
                                 WHEN ?='archived' AND status<>'archived' THEN status
                                 WHEN ?<>'archived' THEN 'active'
                                 ELSE archived_from_status END,
                               status=?, active=?, updated_at=? WHERE id=?""",
                            (
                                next_status,
                                next_status,
                                next_status,
                                int(next_status == "active"),
                                now_iso(),
                                row["id"],
                            ),
                        )
                        details = f"Status changed from {row['status']} to {next_status}."
                    self._record_product_activity(connection, row["id"], user, "bulk update", details)
            self._send_json({"ok": True, "updated": len(product_ids)})
            return True

        if path in ("/api/login", "/api/admin/login", "/api/seller/login"):
            email = str(data.get("email", "")).strip().lower()
            password = str(data.get("password", ""))
            if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254:
                self._send_error("Enter a valid email address.")
                return True
            if len(password) < 8 or len(password) > 128:
                self._send_error("Password must be between 8 and 128 characters.")
                return True

            email_hash = hashlib.sha256(email.encode("utf-8")).hexdigest()
            now = int(time.time())
            login_error = None
            login_status = 401
            with connect_db() as connection:
                attempt = connection.execute(
                    "SELECT locked_until FROM login_attempts WHERE email_hash = ?",
                    (email_hash,),
                ).fetchone()
                if attempt and attempt["locked_until"] > now:
                    retry_after = attempt["locked_until"] - now
                    login_status = 429
                    login_error = (
                        f"Too many failed sign-in attempts. Try again in "
                        f"{(retry_after + 59) // 60} minutes."
                    )
                elif attempt and attempt["locked_until"]:
                    connection.execute("DELETE FROM login_attempts WHERE email_hash = ?", (email_hash,))

                if login_error:
                    user = None
                else:
                    user = connection.execute(
                        "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
                        (email,),
                    ).fetchone()
                if login_error:
                    token = None
                elif user is None:
                    login_error = "Email or password is incorrect."
                    token = None
                elif not hmac.compare_digest(
                    password_digest(password, user["password_salt"]), user["password_hash"]
                ):
                    lock_until = now + LOGIN_LOCKOUT_SECONDS
                    connection.execute(
                        """INSERT INTO login_attempts (email_hash, failed_attempts, locked_until)
                           VALUES (?, 1, 0)
                           ON CONFLICT(email_hash) DO UPDATE SET
                             failed_attempts = login_attempts.failed_attempts + 1,
                             locked_until = CASE
                               WHEN login_attempts.failed_attempts + 1 >= ? THEN ?
                               ELSE login_attempts.locked_until
                             END""",
                        (email_hash, LOGIN_MAX_ATTEMPTS, lock_until),
                    )
                    attempt = connection.execute(
                        "SELECT failed_attempts, locked_until FROM login_attempts WHERE email_hash = ?",
                        (email_hash,),
                    ).fetchone()
                    if attempt["locked_until"] > now:
                        retry_after = attempt["locked_until"] - now
                        login_status = 429
                        login_error = (
                            f"Too many failed sign-in attempts. Try again in "
                            f"{(retry_after + 59) // 60} minutes."
                        )
                    else:
                        login_error = "Email or password is incorrect."
                    token = None
                else:
                    connection.execute("DELETE FROM login_attempts WHERE email_hash = ?", (email_hash,))
                    if not user["email_verified"]:
                        login_status = 403
                        login_error = "Verify your email address with the code we sent before signing in."
                        token = None
                    elif path == "/api/admin/login" and user["role"] != "admin":
                        login_status = 403
                        login_error = "This account does not have administrator access."
                        token = None
                    elif path == "/api/seller/login" and (
                        user["role"] == "admin" or not user["seller_enabled"]
                    ):
                        login_status = 403
                        login_error = "This account does not have seller access."
                        token = None
                    else:
                        token = self._new_session(connection, user["id"])

            if login_error:
                headers = [("Retry-After", str(retry_after))] if login_status == 429 else None
                self._send_json({"error": login_error}, login_status, headers)
                return True
            self._send_json({"account": self._account_json(user)}, 200, [self._cookie_header(token)])
            return True

        if path == "/api/logout":
            token = self._session_token()
            if token:
                token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
                with connect_db() as connection:
                    connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
            self._send_json({"ok": True}, 200, [self._clear_cookie_header()])
            return True

        if path == "/api/addresses":
            try:
                with connect_db() as connection:
                    user = self._require_user(connection)
                    address_id = data.get("id")
                    values = (
                        str(data.get("label", "Home")).strip()[:40] or "Home",
                        str(data.get("recipient", "")).strip()[:80],
                        str(data.get("phone", "")).strip()[:40],
                        str(data.get("street", "")).strip()[:200],
                        str(data.get("city", "")).strip()[:100],
                        str(data.get("postalCode", "")).strip()[:20],
                        str(data.get("country", "Philippines")).strip()[:80] or "Philippines",
                        int(bool(data.get("isDefault", True))),
                    )
                    if not all(values[index] for index in (1, 2, 3, 4, 5)):
                        self._send_error("Fill in recipient, phone, street, city, and postal code.")
                        return True
                    if values[7]:
                        connection.execute("UPDATE addresses SET is_default = 0 WHERE user_id = ?", (user["id"],))
                    if address_id:
                        connection.execute(
                            """UPDATE addresses SET label=?, recipient=?, phone=?, street=?, city=?, postal_code=?, country=?, is_default=?
                               WHERE id=? AND user_id=?""",
                            (*values, int(address_id), user["id"]),
                        )
                    else:
                        connection.execute(
                            """INSERT INTO addresses (label, recipient, phone, street, city, postal_code, country, is_default, user_id, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (*values, user["id"], now_iso()),
                        )
                    rows = connection.execute(
                        "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC",
                        (user["id"],),
                    ).fetchall()
                self._send_json({"addresses": [self._address_json(row) for row in rows]})
            except PermissionError as error:
                self._send_error(str(error), 401)
            return True

        if path == "/api/product-reviews":
            try:
                with connect_db() as connection:
                    user = self._require_user(connection)
                    order_id = str(data.get("orderId", "")).strip()[:40]
                    product_id = str(data.get("productId", "")).strip()[:160]
                    comment_value = data.get("comment")
                    comment = comment_value.strip() if isinstance(comment_value, str) else ""
                    raw_rating = data.get("rating")
                    if isinstance(raw_rating, bool) or not (
                        isinstance(raw_rating, int)
                        or isinstance(raw_rating, str) and re.fullmatch(r"[1-5]", raw_rating)
                    ):
                        rating = 0
                    else:
                        rating = int(raw_rating)
                    if not 1 <= rating <= 5:
                        self._send_error("Choose a rating from 1 to 5 stars.")
                        return True
                    if not comment or len(comment) > 1000:
                        self._send_error("Write a review of 1 to 1,000 characters.")
                        return True
                    eligible = connection.execute(
                        """SELECT 1 FROM orders
                           JOIN order_items ON order_items.order_id=orders.id
                           WHERE orders.id=? AND orders.user_id=? AND orders.status='Delivered'
                             AND order_items.product_id=? LIMIT 1""",
                        (order_id, user["id"], product_id),
                    ).fetchone()
                    if eligible is None:
                        self._send_error("You can review this product after your order is delivered.", 403)
                        return True
                    connection.execute(
                        """INSERT INTO product_reviews (id, user_id, product_id, rating, comment, created_at)
                           VALUES (?, ?, ?, ?, ?, ?)
                           ON CONFLICT(user_id, product_id) DO UPDATE SET
                             rating=excluded.rating, comment=excluded.comment, created_at=excluded.created_at""",
                        (secrets.token_hex(12), user["id"], product_id, rating, comment, now_iso()),
                    )
                    self._send_json({"ok": True})
            except PermissionError as error:
                self._send_error(str(error), 401)
            return True

        if path == "/api/orders":
            try:
                user = None
                with connect_db() as connection:
                    user = self._require_user(connection)
                    items = data.get("items")
                    if not isinstance(items, list) or not items or len(items) > 50:
                        self._send_error("Your cart is empty or contains too many items.")
                        return True
                    payment = str(data.get("paymentMethod", ""))
                    if payment not in ("cod", "transfer"):
                        self._send_error("Choose a valid demo payment method.")
                        return True
                    address = data.get("address") if isinstance(data.get("address"), dict) else {}
                    customer_name = str(data.get("customerName", "")).strip()[:80]
                    delivery_email = str(data.get("deliveryEmail", "")).strip().lower()[:254]
                    phone = str(data.get("phone", "")).strip()[:40]
                    street = str(address.get("street", "")).strip()[:200]
                    city = str(address.get("city", "")).strip()[:100]
                    postal_code = str(address.get("postalCode", "")).strip()[:20]
                    if not customer_name or not EMAIL_PATTERN.fullmatch(delivery_email) or not phone or not street or not city or not postal_code:
                        self._send_error("Complete all contact and delivery fields before placing the order.")
                        return True

                    priced_items = []
                    subtotal_cents = 0
                    for submitted_item in items:
                        if not isinstance(submitted_item, dict):
                            self._send_error("An item in the cart is invalid.")
                            return True
                        product_id = str(submitted_item.get("id", ""))
                        try:
                            quantity = int(submitted_item.get("quantity", 0))
                        except (TypeError, ValueError):
                            quantity = 0
                        product = connection.execute(
                            """SELECT id, name, image, price_cents, stock, owner_id FROM products
                               WHERE id = ? AND active = 1 AND status='active'""",
                            (product_id,),
                        ).fetchone()
                        if product is None or quantity < 1 or quantity > 99:
                            self._send_error("A cart item is unavailable or has an invalid quantity.")
                            return True
                        variants = connection.execute(
                            "SELECT id, size, color, stock, sku FROM product_variants WHERE product_id=?",
                            (product_id,),
                        ).fetchall()
                        variant = None
                        if variants:
                            variant_id = str(submitted_item.get("variantId", ""))
                            variant = next((item for item in variants if item["id"] == variant_id), None)
                            if variant is None or variant["stock"] < quantity:
                                self._send_error("Choose an available size and color, or reduce the quantity.")
                                return True
                        elif submitted_item.get("variantId"):
                            self._send_error("This product no longer has the selected variant.")
                            return True
                        elif product["stock"] is not None and product["stock"] < quantity:
                            self._send_error("There is not enough stock to fulfill this quantity.")
                            return True
                        line_total = product["price_cents"] * quantity
                        subtotal_cents += line_total
                        priced_items.append((product, variant, quantity))

                    shipping_cents = SHIPPING_CENTS if subtotal_cents else 0
                    order_id = f"NG-{secrets.token_hex(4).upper()}"
                    created_at = now_iso()
                    connection.execute(
                        """INSERT INTO orders (id, user_id, created_at, status, customer_name, delivery_email, phone, street, city, postal_code, payment_method, subtotal_cents, shipping_cents, total_cents)
                           VALUES (?, ?, ?, 'Processing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (order_id, user["id"], created_at, customer_name, delivery_email, phone, street, city, postal_code, payment, subtotal_cents, shipping_cents, subtotal_cents + shipping_cents),
                    )
                    for _, variant, quantity in priced_items:
                        if variant:
                            cursor = connection.execute(
                                "UPDATE product_variants SET stock=stock-? WHERE id=? AND stock>=?",
                                (quantity, variant["id"], quantity),
                            )
                            if cursor.rowcount != 1:
                                raise ValueError("Stock changed while you were checking out. Review your cart and try again.")
                            self._record_product_activity(
                                connection,
                                product["id"],
                                user,
                                "stock sold",
                                f"{quantity} unit(s) reserved for order {order_id} from variant {variant['sku']}.",
                            )
                    for product, variant, quantity in priced_items:
                        if variant is None and product["stock"] is not None:
                            cursor = connection.execute(
                                "UPDATE products SET stock=stock-? WHERE id=? AND stock>=?",
                                (quantity, product["id"], quantity),
                            )
                            if cursor.rowcount != 1:
                                raise ValueError("Stock changed while you were checking out. Review your cart and try again.")
                            self._record_product_activity(
                                connection,
                                product["id"],
                                user,
                                "stock sold",
                                f"{quantity} unit(s) reserved for order {order_id}.",
                            )
                    connection.executemany(
                        """INSERT INTO order_items
                           (order_id, product_id, product_name, image, unit_price_cents, quantity,
                            variant_id, variant_sku, variant_size, variant_color, seller_id)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        [
                            (
                                order_id,
                                product["id"],
                                product["name"],
                                product["image"],
                                product["price_cents"],
                                quantity,
                                variant["id"] if variant else None,
                                variant["sku"] if variant else "",
                                variant["size"] if variant else "",
                                variant["color"] if variant else "",
                                product["owner_id"],
                            )
                            for product, variant, quantity in priced_items
                        ],
                    )
                    address_row = connection.execute(
                        """SELECT id FROM addresses WHERE user_id=? AND street=? AND city=? AND postal_code=? AND recipient=? LIMIT 1""",
                        (user["id"], street, city, postal_code, customer_name),
                    ).fetchone()
                    connection.execute("UPDATE addresses SET is_default = 0 WHERE user_id = ?", (user["id"],))
                    if address_row:
                        connection.execute("UPDATE addresses SET phone=?, is_default=1 WHERE id=?", (phone, address_row["id"]))
                    else:
                        connection.execute(
                            """INSERT INTO addresses (user_id, label, recipient, phone, street, city, postal_code, country, is_default, created_at)
                               VALUES (?, 'Home', ?, ?, ?, ?, ?, ?, 1, ?)""",
                            (user["id"], customer_name, phone, street, city, postal_code, str(address.get("country", "Philippines"))[:80], created_at),
                        )
                    order_row = connection.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
                    order_json = self._order_json(connection, order_row)
                self._send_json({"order": order_json}, 201)
            except PermissionError as error:
                self._send_error(str(error), 401)
            return True

        return False

    def _handle_api_put(self, path: str, data: dict) -> bool:
        if not self._check_origin():
            self._send_error("Cross-site request rejected.", 403)
            return True
        product_stock = re.fullmatch(r"/api/admin/products/([^/]+)/stock", path)
        if product_stock:
            product_id = unquote(product_stock.group(1))
            with connect_db() as connection:
                user = self._require_product_manager(connection)
                product = self._product_for_manager(connection, product_id, user)
                if product is None:
                    self._send_error("Product not found.", 404)
                    return True
                if connection.execute(
                    "SELECT 1 FROM product_variants WHERE product_id=? LIMIT 1",
                    (product_id,),
                ).fetchone():
                    self._send_error("Update stock on each product variant instead.", 409)
                    return True
                try:
                    stock = parse_whole_number(data.get("stock"), "Product stock must be a whole number.")
                except ValueError as error:
                    self._send_error(str(error))
                    return True
                if stock > 1_000_000:
                    self._send_error("Product stock must be between 0 and 1,000,000.")
                    return True
                connection.execute(
                    "UPDATE products SET stock=?, updated_at=? WHERE id=?",
                    (stock, now_iso(), product_id),
                )
                self._record_product_activity(
                    connection,
                    product_id,
                    user,
                    "stock updated",
                    f"Product stock changed from {product['stock'] if product['stock'] is not None else 'untracked'} to {stock}.",
                )
            self._send_json({"ok": True, "stock": stock})
            return True

        stock_update = re.fullmatch(r"/api/admin/products/([^/]+)/stock/([^/]+)", path)
        if stock_update:
            with connect_db() as connection:
                user = self._require_product_manager(connection)
                product_id, variant_id = (unquote(value) for value in stock_update.groups())
                product = self._product_for_manager(connection, product_id, user)
                if product is None:
                    self._send_error("Product not found.", 404)
                    return True
                try:
                    stock = parse_whole_number(data.get("stock"), "Variant stock must be a whole number.")
                except ValueError:
                    self._send_error("Stock must be a whole number.")
                    return True
                if stock < 0 or stock > 1_000_000:
                    self._send_error("Stock must be between 0 and 1,000,000.")
                    return True
                variant = connection.execute(
                    "SELECT * FROM product_variants WHERE id=? AND product_id=?",
                    (variant_id, product_id),
                ).fetchone()
                if variant is None:
                    self._send_error("Product variant not found.", 404)
                    return True
                connection.execute("UPDATE product_variants SET stock=? WHERE id=?", (stock, variant_id))
                connection.execute("UPDATE products SET updated_at=? WHERE id=?", (now_iso(), product_id))
                self._record_product_activity(
                    connection,
                    product_id,
                    user,
                    "stock updated",
                    f"Stock for {variant['sku']} changed from {variant['stock']} to {stock}.",
                )
            self._send_json({"ok": True, "stock": stock})
            return True

        product_status = re.fullmatch(r"/api/admin/products/([^/]+)/status", path)
        if product_status:
            product_id = unquote(product_status.group(1))
            status = data.get("status")
            if not isinstance(status, str) or (status not in PRODUCT_STATUSES and status != "restore"):
                self._send_error("Choose Active, Draft, or Archived status.")
                return True
            with connect_db() as connection:
                user = self._require_product_manager(connection)
                product = self._product_for_manager(connection, product_id, user)
                if product is None:
                    self._send_error("Product not found.", 404)
                    return True
                if status == "restore":
                    if product["status"] != "archived":
                        self._send_error("Only archived products can be restored.", 409)
                        return True
                    next_status = product["archived_from_status"]
                else:
                    next_status = status
                connection.execute(
                    """UPDATE products SET
                       archived_from_status=CASE
                         WHEN ?='archived' AND status<>'archived' THEN status
                         WHEN ?<>'archived' THEN 'active'
                         ELSE archived_from_status END,
                       status=?, active=?, updated_at=? WHERE id=?""",
                    (
                        next_status,
                        next_status,
                        next_status,
                        int(next_status == "active"),
                        now_iso(),
                        product_id,
                    ),
                )
                self._record_product_activity(
                    connection,
                    product_id,
                    user,
                    "status changed",
                    f"Status changed from {product['status']} to {next_status}.",
                )
                updated = connection.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
                result = self._product_json(connection, updated)
            self._send_json({"product": result})
            return True

        product_update = re.fullmatch(r"/api/admin/products/([^/]+)", path)
        if product_update:
            product_id = unquote(product_update.group(1))
            with connect_db() as connection:
                user = self._require_product_manager(connection)
                current = self._product_for_manager(connection, product_id, user)
                if current is None:
                    self._send_error("Product not found.", 404)
                    return True
                product = self._validated_product(data)
                current_snapshot = self._product_json(connection, current)
                for variant in product["variants"]:
                    existing_sku = connection.execute(
                        "SELECT 1 FROM product_variants WHERE LOWER(sku)=LOWER(?) AND product_id<>?",
                        (variant["sku"], product_id),
                    ).fetchone()
                    if existing_sku:
                        self._send_error(f"SKU {variant['sku']} is already assigned to another product.", 409)
                        return True
                changes = []
                if current["name"] != product["name"]:
                    changes.append("Name updated.")
                if current["price_cents"] != product["price_cents"]:
                    changes.append(
                        f"Price changed from ${current['price_cents'] / 100:.2f} to ${product['price_cents'] / 100:.2f}."
                    )
                if current["category"] != product["category"]:
                    changes.append(f"Category changed to {product['category']}.")
                if current["status"] != product["status"]:
                    changes.append(f"Status changed from {current['status']} to {product['status']}.")
                if current["description"] != product["description"]:
                    changes.append("Description updated.")
                if current_snapshot["stock"] != product["stock"]:
                    changes.append(
                        f"Product stock changed from {current_snapshot['stock'] if current_snapshot['stock'] is not None else 'untracked'} to {product['stock']}."
                    )
                if [item["path"] for item in current_snapshot["images"]] != product["images"]:
                    changes.append("Product photos updated.")
                old_variants = sorted(
                    (item["size"], item["color"], item["sku"], item["stock"])
                    for item in current_snapshot["variants"]
                )
                new_variants = sorted(
                    (item["size"], item["color"], item["sku"], item["stock"])
                    for item in product["variants"]
                )
                if old_variants != new_variants:
                    changes.append("Product variants or stock updated.")
                connection.execute(
                    """UPDATE products SET name=?, image=?, price_cents=?, active=?, category=?, description=?,
                       status=?, archived_from_status=CASE
                         WHEN ?='archived' AND status<>'archived' THEN status
                         WHEN ?<>'archived' THEN 'active'
                         ELSE archived_from_status END,
                       low_stock_threshold=?, stock=?, updated_at=? WHERE id=?""",
                    (
                        product["name"],
                        product["image"],
                        product["price_cents"],
                        int(product["status"] == "active"),
                        product["category"],
                        product["description"],
                        product["status"],
                        product["status"],
                        product["status"],
                        product["low_stock_threshold"],
                        product["stock"],
                        now_iso(),
                        product_id,
                    ),
                )
                connection.execute("DELETE FROM product_images WHERE product_id=?", (product_id,))
                connection.executemany(
                    """INSERT INTO product_images (product_id, path, position, is_main)
                       VALUES (?, ?, ?, ?)""",
                    [
                        (product_id, image, index, int(index == 0))
                        for index, image in enumerate(product["images"])
                    ],
                )
                current_variants = {
                    row["sku"].lower(): row
                    for row in connection.execute(
                        "SELECT id, sku FROM product_variants WHERE product_id=?",
                        (product_id,),
                    ).fetchall()
                }
                next_skus = {variant["sku"].lower() for variant in product["variants"]}
                for sku, variant in current_variants.items():
                    if sku not in next_skus:
                        connection.execute("DELETE FROM product_variants WHERE id=?", (variant["id"],))
                for variant in product["variants"]:
                    existing = current_variants.get(variant["sku"].lower())
                    if existing:
                        connection.execute(
                            "UPDATE product_variants SET size=?, color=?, stock=? WHERE id=?",
                            (variant["size"], variant["color"], variant["stock"], existing["id"]),
                        )
                    else:
                        connection.execute(
                            """INSERT INTO product_variants
                               (id, product_id, size, color, stock, sku, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?)""",
                            (
                                secrets.token_hex(12),
                                product_id,
                                variant["size"],
                                variant["color"],
                                variant["stock"],
                                variant["sku"],
                                now_iso(),
                            ),
                        )
                if changes:
                    self._record_product_activity(connection, product_id, user, "updated", " ".join(changes))
                updated = connection.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
                result = self._product_json(connection, updated)
            self._send_json({"product": result})
            return True

        admin_order = re.fullmatch(r"/api/admin/orders/([^/]+)/status", path)
        if admin_order:
            with connect_db() as connection:
                self._require_admin(connection)
            order_id = unquote(admin_order.group(1))
            next_status = data.get("status")
            if not isinstance(next_status, str) or next_status not in ORDER_STATUS_TRANSITIONS:
                self._send_error("Choose a valid order status.")
                return True
            with connect_db() as connection:
                self._require_admin(connection)
                current = connection.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
                if current is None:
                    self._send_error("Order not found.", 404)
                    return True
                if next_status not in ORDER_STATUS_TRANSITIONS[current["status"]]:
                    self._send_error(
                        f"An order with status {current['status']} cannot be changed to {next_status}.",
                        409,
                    )
                    return True
                cursor = connection.execute(
                    "UPDATE orders SET status=? WHERE id=? AND status=?",
                    (next_status, order_id, current["status"]),
                )
                if cursor.rowcount != 1:
                    self._send_error("This order was updated by another administrator. Refresh and try again.", 409)
                    return True
                updated = connection.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
                order = self._order_json(connection, updated)
            self._send_json({"order": order})
            return True
        if path == "/api/profile":
            try:
                with connect_db() as connection:
                    user = self._require_user(connection)
                    username = str(data.get("username", "")).strip()[:32]
                    full_name = str(data.get("name", "")).strip()[:80]
                    email = str(data.get("email", "")).strip().lower()
                    phone = str(data.get("phone", "")).strip()[:40]
                    gender = str(data.get("gender", "")).strip()
                    if gender not in ("", "male", "female", "other"):
                        self._send_error("Choose a valid gender option.")
                        return True
                    dob = data.get("dateOfBirth") if isinstance(data.get("dateOfBirth"), dict) else {}
                    day, month, year = (str(dob.get(key, "")).strip() for key in ("day", "month", "year"))
                    if any((day, month, year)):
                        try:
                            month_number = datetime.strptime(month, "%B").month
                            date(int(year), month_number, int(day))
                        except (TypeError, ValueError):
                            self._send_error("Enter a valid date of birth.")
                            return True
                    avatar = str(data.get("avatarImage", ""))
                    if avatar and (len(avatar) > 1_400_000 or not re.fullmatch(r"data:image/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}", avatar)):
                        self._send_error("Profile images must be a JPEG or PNG no larger than 1 MB.")
                        return True
                    if not username or not full_name or not EMAIL_PATTERN.fullmatch(email):
                        self._send_error("Enter a username, name, and valid email address.")
                        return True
                    try:
                        connection.execute(
                            """UPDATE users SET username=?, full_name=?, email=?, phone=?, gender=?, birth_day=?, birth_month=?, birth_year=?, avatar_image=? WHERE id=?""",
                            (username, full_name, email, phone, gender, day, month, year, avatar, user["id"]),
                        )
                    except DATABASE_INTEGRITY_ERRORS:
                        self._send_error("That email address is already used by another account.", 409)
                        return True
                    updated = connection.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
                self._send_json({"account": self._account_json(updated)})
            except PermissionError as error:
                self._send_error(str(error), 401)
            return True
        if path == "/api/change-password":
            try:
                with connect_db() as connection:
                    user = self._require_user(connection)
                    current = str(data.get("currentPassword", ""))
                    new_password = str(data.get("newPassword", ""))
                    if not hmac.compare_digest(password_digest(current, user["password_salt"]), user["password_hash"]):
                        self._send_error("Current password is incorrect.", 400)
                        return True
                    if len(new_password) < 8 or len(new_password) > 128:
                        self._send_error("New password must be between 8 and 128 characters.")
                        return True
                    salt = secrets.token_bytes(16)
                    connection.execute(
                        "UPDATE users SET password_salt=?, password_hash=? WHERE id=?",
                        (salt, password_digest(new_password, salt), user["id"]),
                    )
                    connection.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
                    token = self._new_session(connection, user["id"])
                self._send_json({"ok": True}, extra_headers=[self._cookie_header(token)])
            except PermissionError as error:
                self._send_error(str(error), 401)
            return True
        return False

    def _handle_api_delete(self, path: str) -> bool:
        if not self._check_origin():
            self._send_error("Cross-site request rejected.", 403)
            return True
        with connect_db() as connection:
            try:
                user = self._require_user(connection)
            except PermissionError as error:
                self._send_error(str(error), 401)
                return True
            if path.startswith("/api/orders/"):
                order_id = unquote(path.removeprefix("/api/orders/"))
                cursor = connection.execute(
                    "DELETE FROM orders WHERE id=? AND user_id=? AND status='Processing'",
                    (order_id, user["id"]),
                )
                if cursor.rowcount == 0:
                    self._send_error("This order can no longer be cancelled.", 409)
                else:
                    self._send_json({"ok": True})
                return True
            if path.startswith("/api/addresses/"):
                address_id = path.removeprefix("/api/addresses/")
                cursor = connection.execute("DELETE FROM addresses WHERE id=? AND user_id=?", (address_id, user["id"]))
                if cursor.rowcount == 0:
                    self._send_error("Address not found.", 404)
                else:
                    self._send_json({"ok": True})
                return True
        return False

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if self._guard_dashboard_page(path):
            return
        if path.startswith("/api/"):
            try:
                path = self._dashboard_api_path(path)
                if self._handle_api_get(path):
                    return
                self._send_error("API route not found.", 404)
            except AdminRequiredError as error:
                self._send_error(str(error), 403)
            except PermissionError as error:
                self._send_error(str(error), 401)
            except Exception:
                self._send_error("The request could not be completed.", 500)
            return
        super().do_GET()

    def _handle_write(self, method: str) -> None:
        path = urlsplit(self.path).path
        if not path.startswith("/api/"):
            self._send_error("API route not found.", 404)
            return
        try:
            path = self._dashboard_api_path(path)
            data = self._read_json() if method in ("POST", "PUT") else {}
            handled = (
                self._handle_api_post(path, data)
                if method == "POST"
                else self._handle_api_put(path, data)
                if method == "PUT"
                else self._handle_api_delete(path)
            )
            if not handled:
                self._send_error("API route not found.", 404)
        except ValueError as error:
            self._send_error(str(error))
        except AdminRequiredError as error:
            self._send_error(str(error), 403)
        except PermissionError as error:
            self._send_error(str(error), 401)
        except Exception:
            self._send_error("The request could not be completed.", 500)

    def do_POST(self) -> None:
        self._handle_write("POST")

    def do_PUT(self) -> None:
        self._handle_write("PUT")

    def do_DELETE(self) -> None:
        self._handle_write("DELETE")


class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True

    def __init__(self, server_address, request_handler, max_workers: int):
        self._request_slots = BoundedSemaphore(max_workers)
        super().__init__(server_address, request_handler)

    def process_request(self, request, client_address) -> None:
        if not self._request_slots.acquire(blocking=False):
            try:
                request.sendall(
                    b"HTTP/1.1 503 Service Unavailable\r\n"
                    b"Content-Length: 0\r\n"
                    b"Connection: close\r\n"
                    b"Retry-After: 2\r\n\r\n"
                )
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._request_slots.release()
            raise

    def process_request_thread(self, request, client_address) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Northgate storefront server.")
    parser.add_argument(
        "--promote-admin",
        metavar="EMAIL",
        help="promote an existing account to administrator, then exit",
    )
    parser.add_argument(
        "--promote-seller",
        metavar="EMAIL",
        help="enable seller access for an existing account, then exit",
    )
    arguments = parser.parse_args()
    initialize_database()
    if arguments.promote_admin:
        email = arguments.promote_admin.strip().lower()
        if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254:
            parser.error("--promote-admin requires a valid account email address.")
        with connect_db() as connection:
            cursor = connection.execute("UPDATE users SET role='admin' WHERE email=? COLLATE NOCASE", (email,))
            if cursor.rowcount != 1:
                parser.error("No account with that email exists. Create the account first, then promote it.")
        print(f"Administrator access granted to {email}.")
        return
    if arguments.promote_seller:
        email = arguments.promote_seller.strip().lower()
        if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254:
            parser.error("--promote-seller requires a valid account email address.")
        with connect_db() as connection:
            cursor = connection.execute(
                "UPDATE users SET seller_enabled=1 WHERE email=? COLLATE NOCASE AND role!='admin'",
                (email,),
            )
            if cursor.rowcount != 1:
                parser.error(f"No non-administrator account found for {email}.")
        print(f"Seller access granted to {email}.")
        return
    display_host = "127.0.0.1" if HOST in ("0.0.0.0", "::") else HOST
    print(f"Starting Northgate server on {display_host}:{PORT}", flush=True)
    server = BoundedThreadingHTTPServer((HOST, PORT), NorthgateHandler, MAX_CONCURRENT_REQUESTS)
    print(f"Northgate local app running at http://{display_host}:{PORT}", flush=True)
    if HOST in ("0.0.0.0", "::"):
        print("Network access is enabled by NORTHGATE_HOST; use HTTPS for non-local production deployments.")
    print(f"Database: {'PostgreSQL' if DATABASE_URL else DATABASE}")
    print(f"Maximum concurrent requests: {MAX_CONCURRENT_REQUESTS}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Northgate local app.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()