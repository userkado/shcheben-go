"""SQLite: схема, подключение, начальные справочники."""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path(os.environ.get("SHCHEBEN_DB", ROOT / "data" / "shcheben_go.db"))
SCHEMA_VERSION = "1"

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trucks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capacity REAL NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    km REAL NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    truck_id TEXT NOT NULL REFERENCES trucks(id),
    plate TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS crushers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prices (
    material_id TEXT PRIMARY KEY REFERENCES materials(id),
    base INTEGER NOT NULL,
    markup INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tariffs (
    truck_id TEXT PRIMARY KEY REFERENCES trucks(id),
    min_sum INTEGER NOT NULL,
    included_km REAL NOT NULL DEFAULT 0,
    per_km INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    km REAL NOT NULL,
    truck_id TEXT NOT NULL,
    truck_name TEXT NOT NULL,
    capacity REAL NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    landmark TEXT NOT NULL DEFAULT '',
    material_sum INTEGER NOT NULL,
    material_base_sum INTEGER NOT NULL,
    delivery_sum INTEGER NOT NULL,
    total INTEGER NOT NULL,
    tariff_min INTEGER NOT NULL,
    tariff_included_km REAL NOT NULL,
    tariff_per_km INTEGER NOT NULL,
    delivery_note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quote_items (
    quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    material_id TEXT NOT NULL,
    name TEXT NOT NULL,
    qty REAL NOT NULL,
    base_price INTEGER NOT NULL,
    price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    no TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id),
    created_at TEXT NOT NULL,
    locked_at TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    km REAL NOT NULL,
    address TEXT NOT NULL,
    landmark TEXT NOT NULL DEFAULT '',
    truck_id TEXT NOT NULL,
    truck_name TEXT NOT NULL,
    capacity REAL NOT NULL,
    material_sum INTEGER NOT NULL,
    material_base_sum INTEGER NOT NULL,
    delivery_sum INTEGER NOT NULL,
    total INTEGER NOT NULL,
    tariff_min INTEGER NOT NULL,
    tariff_included_km REAL NOT NULL,
    tariff_per_km INTEGER NOT NULL,
    delivery_note TEXT NOT NULL,
    payment TEXT NOT NULL,
    status TEXT NOT NULL,
    driver_id TEXT REFERENCES drivers(id),
    crusher_id TEXT REFERENCES crushers(id),
    paid INTEGER NOT NULL DEFAULT 0,
    debt INTEGER NOT NULL DEFAULT 0,
    debt_to_crusher_id TEXT REFERENCES crushers(id),
    debt_paid INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS order_items (
    no TEXT NOT NULL REFERENCES orders(no) ON DELETE CASCADE,
    material_id TEXT NOT NULL,
    name TEXT NOT NULL,
    qty REAL NOT NULL,
    base_price INTEGER NOT NULL,
    price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no TEXT NOT NULL REFERENCES orders(no) ON DELETE CASCADE,
    at TEXT NOT NULL,
    text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    material_id TEXT NOT NULL,
    old_price INTEGER NOT NULL,
    new_price INTEGER NOT NULL,
    old_markup INTEGER NOT NULL,
    new_markup INTEGER NOT NULL,
    author TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tariff_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    truck_id TEXT NOT NULL,
    old_json TEXT NOT NULL,
    new_json TEXT NOT NULL,
    author TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seq (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_crusher ON orders(crusher_id);
CREATE INDEX IF NOT EXISTS idx_events_no ON order_events(no);
"""

MATERIALS = [
    ("zasypka", "Засыпка", "Планировка, подушка", 1),
    ("pesok", "Песок мытый", "Мытый песок", 2),
    ("shps", "ЩПС", "Щебёночно-песчаная смесь", 3),
    ("scheben", "Щебень", "Фракция по запросу", 4),
]

TRUCKS = [
    ("kamaz", "Камаз", 3, 1),
    ("zil", "ЗИЛ", 2, 2),
    ("howo", "Хова", 6, 3),
]

ZONES = [
    ("z1", "Центр", 8, 1),
    ("z2", "Куйлюк", 12, 2),
    ("z3", "Сергели", 16, 3),
    ("z4", "Янгиюль", 28, 4),
    ("z5", "Чирчик", 42, 5),
    ("z6", "Пскент", 55, 6),
]

DRIVERS = [
    ("d1", "Алишер", "+998 90 111 22 33", "kamaz", "01 A 123 BC", 1),
    ("d2", "Бахтиёр", "+998 90 222 33 44", "zil", "01 B 456 CD", 2),
    ("d3", "Шухрат", "+998 90 333 44 55", "howo", "01 C 789 EF", 3),
]

CRUSHERS = [
    ("k1", "Дробилка №1", "Промзона, выезд на Сергели", 1),
    ("k2", "Дробилка №2", "Трасса на Чирчик, 18 км", 2),
]

# Демонстрационные цены дробилки, сум за чумич. Владелец меняет в A05.
DEFAULT_PRICES = [
    ("zasypka", 400000, 0),
    ("pesok", 180000, 0),
    ("shps", 150000, 0),
    ("scheben", 90000, 0),
]

# Демонстрационный тариф доставки: минималка за included_km, далее за км.
# Владелец меняет в A06.
DEFAULT_TARIFFS = [
    ("kamaz", 50000, 10, 5000),
    ("zil", 40000, 10, 4000),
    ("howo", 70000, 10, 7000),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def read():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def write():
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with write() as conn:
        conn.executescript(SCHEMA)
        seeded = conn.execute("SELECT COUNT(*) AS c FROM materials").fetchone()["c"]
        if not seeded:
            _seed(conn)
        conn.execute(
            "INSERT INTO meta(key, value) VALUES('schema_version', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (SCHEMA_VERSION,),
        )


def _seed(conn: sqlite3.Connection) -> None:
    ts = now_iso()
    conn.executemany("INSERT INTO materials(id, name, note, sort) VALUES(?,?,?,?)", MATERIALS)
    conn.executemany("INSERT INTO trucks(id, name, capacity, sort) VALUES(?,?,?,?)", TRUCKS)
    conn.executemany("INSERT INTO zones(id, name, km, sort) VALUES(?,?,?,?)", ZONES)
    conn.executemany(
        "INSERT INTO drivers(id, name, phone, truck_id, plate, sort) VALUES(?,?,?,?,?,?)",
        DRIVERS,
    )
    conn.executemany(
        "INSERT INTO crushers(id, name, address, sort) VALUES(?,?,?,?)", CRUSHERS
    )
    conn.executemany(
        "INSERT INTO prices(material_id, base, markup, updated_at) VALUES(?,?,?,?)",
        [(m, base, markup, ts) for m, base, markup in DEFAULT_PRICES],
    )
    conn.executemany(
        "INSERT INTO tariffs(truck_id, min_sum, included_km, per_km, updated_at) "
        "VALUES(?,?,?,?,?)",
        [(t, mn, inc, km, ts) for t, mn, inc, km in DEFAULT_TARIFFS],
    )
