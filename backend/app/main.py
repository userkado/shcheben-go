"""HTTP API и отдача интерфейса."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db, domain

APP_DIR = Path(__file__).resolve().parents[2] / "app"
VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="Щебень GO API", version=VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CalcPayload(BaseModel):
    zoneId: str
    truckId: str
    qty: dict[str, float] = Field(default_factory=dict)
    address: str = ""
    landmark: str = ""


class OrderPayload(BaseModel):
    quoteId: str
    clientName: str = ""
    clientPhone: str = ""
    payment: str = "CASH"


class AssignPayload(BaseModel):
    driverId: str
    crusherId: str


class DriverPayload(BaseModel):
    action: str
    driverId: str | None = None


class CrusherPayload(BaseModel):
    crusherId: str | None = None


class PriceItem(BaseModel):
    id: str
    base: int
    markup: int = 0


class PricesPayload(BaseModel):
    items: list[PriceItem]


class TariffItem(BaseModel):
    id: str
    minSum: int
    includedKm: float
    perKm: int


class TariffsPayload(BaseModel):
    items: list[TariffItem]


@app.get("/api/health")
def health():
    with db.read() as conn:
        meta = conn.execute(
            "SELECT value FROM meta WHERE key = 'schema_version'"
        ).fetchone()
    return {
        "ok": True,
        "version": VERSION,
        "schema": meta["value"] if meta else None,
        "db": str(db.DB_PATH),
    }


@app.get("/api/bootstrap")
def bootstrap():
    with db.read() as conn:
        return domain.bootstrap(conn)


@app.post("/api/calc")
def calc(payload: CalcPayload):
    with db.read() as conn:
        return domain.calc_preview(
            conn, payload.zoneId, payload.truckId, payload.qty, payload.address, payload.landmark
        )


@app.post("/api/quotes")
def create_quote(payload: CalcPayload):
    with db.write() as conn:
        return domain.create_quote(
            conn, payload.zoneId, payload.truckId, payload.qty, payload.address, payload.landmark
        )


@app.get("/api/quotes/{quote_id}")
def get_quote(quote_id: str):
    with db.read() as conn:
        return domain.get_quote(conn, quote_id)


@app.post("/api/orders", status_code=201)
def create_order(payload: OrderPayload):
    with db.write() as conn:
        return domain.create_order(
            conn, payload.quoteId, payload.clientName, payload.clientPhone, payload.payment
        )


@app.get("/api/orders")
def orders():
    with db.read() as conn:
        return domain.list_orders(conn)


@app.get("/api/orders/{no}")
def order(no: str):
    with db.read() as conn:
        return domain.get_order(conn, no)


@app.post("/api/orders/{no}/assign")
def assign(no: str, payload: AssignPayload):
    with db.write() as conn:
        return domain.assign(conn, no, payload.driverId, payload.crusherId)


@app.post("/api/orders/{no}/driver")
def driver(no: str, payload: DriverPayload):
    with db.write() as conn:
        return domain.driver_action(conn, no, payload.action, payload.driverId)


@app.post("/api/orders/{no}/crusher-confirm")
def crusher_confirm(no: str, payload: CrusherPayload | None = None):
    with db.write() as conn:
        return domain.crusher_confirm(conn, no, payload.crusherId if payload else None)


@app.post("/api/orders/{no}/paid")
def mark_paid(no: str):
    with db.write() as conn:
        return domain.mark_paid(conn, no)


@app.post("/api/orders/{no}/debt-paid")
def pay_debt(no: str):
    with db.write() as conn:
        return domain.pay_debt(conn, no)


@app.get("/api/admin/prices")
def prices():
    with db.read() as conn:
        return {"prices": domain.price_map(conn), "history": domain.price_history(conn)}


@app.put("/api/admin/prices")
def save_prices(payload: PricesPayload):
    with db.write() as conn:
        return domain.update_prices(conn, [i.model_dump() for i in payload.items])


@app.get("/api/admin/tariffs")
def tariffs():
    with db.read() as conn:
        return {"tariffs": domain.tariff_map(conn), "history": domain.tariff_history(conn)}


@app.put("/api/admin/tariffs")
def save_tariffs(payload: TariffsPayload):
    with db.write() as conn:
        return domain.update_tariffs(conn, [i.model_dump() for i in payload.items])


@app.get("/api/admin/clients")
def clients():
    with db.read() as conn:
        return domain.clients(conn)


@app.get("/api/admin/report")
def report():
    with db.read() as conn:
        return {
            "stats": domain.stats(conn),
            "report": domain.report(conn),
            "clients": domain.clients(conn),
        }


@app.post("/api/admin/reset-demo")
def reset_demo():
    with db.write() as conn:
        return domain.reset_demo(conn)


app.mount("/", StaticFiles(directory=APP_DIR, html=True), name="app")
