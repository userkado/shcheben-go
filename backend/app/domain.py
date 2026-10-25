"""Бизнес-логика: расчёт, заказы, статусы, долги, прайс, тарифы."""

import json
import uuid
from datetime import datetime

from fastapi import HTTPException

from . import db

STATUS_ORDER = ["NEW", "ASSIGNED", "AT_CRUSHER", "LOADED", "EN_ROUTE", "DELIVERED"]
PAYMENTS = ("CASH", "CARD")

DRIVER_ACTIONS = {
    "toCrusher": ("ASSIGNED", "AT_CRUSHER", "Водитель приехал на дробилку."),
    "onRoute": ("LOADED", "EN_ROUTE", "Машина загружена, выехала к клиенту."),
    "delivered": ("EN_ROUTE", "DELIVERED", "Груз выгружен у клиента."),
}


def fail(message: str, code: int = 400) -> None:
    raise HTTPException(status_code=code, detail=message)


def money_text(value: int) -> str:
    return f"{int(value):,}".replace(",", " ")


def _rows(conn, sql: str, args=()) -> list[dict]:
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def _one(conn, sql: str, args=()) -> dict | None:
    row = conn.execute(sql, args).fetchone()
    return dict(row) if row else None


def _as_int(value, field: str) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        fail(f"Поле «{field}» должно быть числом")
    if number < 0:
        fail(f"Поле «{field}» не может быть отрицательным")
    return number


def _as_float(value, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        fail(f"Поле «{field}» должно быть числом")
    if number < 0:
        fail(f"Поле «{field}» не может быть отрицательным")
    return number


# ---------------------------------------------------------------- справочники


def materials(conn) -> list[dict]:
    return _rows(conn, "SELECT id, name, note FROM materials ORDER BY sort, id")


def trucks(conn) -> list[dict]:
    return _rows(conn, "SELECT id, name, capacity FROM trucks ORDER BY sort, id")


def zones(conn) -> list[dict]:
    return _rows(conn, "SELECT id, name, km FROM zones ORDER BY sort, id")


def drivers(conn) -> list[dict]:
    return _rows(
        conn,
        "SELECT id, name, phone, truck_id AS truckId, plate FROM drivers ORDER BY sort, id",
    )


def crushers(conn) -> list[dict]:
    return _rows(conn, "SELECT id, name, address FROM crushers ORDER BY sort, id")


def price_map(conn) -> dict[str, dict]:
    rows = _rows(
        conn,
        "SELECT p.material_id AS id, m.name, p.base, p.markup, p.updated_at "
        "FROM prices p JOIN materials m ON m.id = p.material_id",
    )
    return {
        r["id"]: {
            "id": r["id"],
            "name": r["name"],
            "base": r["base"],
            "markup": r["markup"],
            "client": r["base"] + r["markup"],
            "updatedAt": r["updated_at"],
        }
        for r in rows
    }


def tariff_map(conn) -> dict[str, dict]:
    rows = _rows(
        conn,
        "SELECT t.truck_id AS id, t.min_sum, t.included_km, t.per_km, t.updated_at "
        "FROM tariffs t",
    )
    return {
        r["id"]: {
            "id": r["id"],
            "minSum": r["min_sum"],
            "includedKm": r["included_km"],
            "perKm": r["per_km"],
            "updatedAt": r["updated_at"],
        }
        for r in rows
    }


# ---------------------------------------------------------------- расчёт


def delivery_sum(tariff: dict, km: float) -> tuple[int, str]:
    extra_km = max(0.0, km - tariff["includedKm"])
    total = int(round(tariff["minSum"] + extra_km * tariff["perKm"]))
    if extra_km <= 0:
        note = f"минималка {money_text(tariff['minSum'])} до {tariff['includedKm']:g} км"
    else:
        note = (
            f"{money_text(tariff['minSum'])} за {tariff['includedKm']:g} км"
            f" + {extra_km:g} км × {money_text(tariff['perKm'])}"
        )
    return total, note


def _calc(
    zone: dict,
    truck: dict,
    tariff: dict,
    prices: dict[str, dict],
    qty: dict,
    address: str = "",
    landmark: str = "",
) -> dict:
    items = []
    for material_id, raw in (qty or {}).items():
        if material_id not in prices:
            fail(f"Неизвестный материал: {material_id}")
        try:
            count = float(raw or 0)
        except (TypeError, ValueError):
            fail("Количество должно быть числом")
        if count < 0:
            fail("Количество не может быть отрицательным")
        if abs(count * 2 - round(count * 2)) > 1e-9:
            fail("Количество задаётся шагом 0,5 чумича")
        count = round(count * 2) / 2
        if count == 0:
            continue
        price = prices[material_id]
        items.append(
            {
                "id": material_id,
                "name": price["name"],
                "qty": count,
                "basePrice": price["base"],
                "price": price["client"],
            }
        )
    if not items:
        fail("Выберите хотя бы один материал")
    items.sort(key=lambda i: i["name"])

    total_qty = sum(i["qty"] for i in items)
    if total_qty > truck["capacity"] + 1e-9:
        fail(
            f"Не помещается в {truck['name']}: максимум "
            f"{truck['capacity']:g} чумичей, выбрано {total_qty:g}"
        )

    material_sum = int(round(sum(i["qty"] * i["price"] for i in items)))
    material_base_sum = int(round(sum(i["qty"] * i["basePrice"] for i in items)))
    ship, note = delivery_sum(tariff, zone["km"])
    return {
        "zoneId": zone["id"],
        "zoneName": zone["name"],
        "km": zone["km"],
        "address": (address or "").strip(),
        "landmark": (landmark or "").strip(),
        "truckId": truck["id"],
        "truckName": truck["name"],
        "capacity": truck["capacity"],
        "items": items,
        "materialSum": material_sum,
        "materialBaseSum": material_base_sum,
        "deliverySum": ship,
        "deliveryNote": note,
        "total": material_sum + ship,
        "tariff": {
            "minSum": tariff["minSum"],
            "includedKm": tariff["includedKm"],
            "perKm": tariff["perKm"],
        },
    }


def _pick(conn, table: str, key: str, message: str) -> dict:
    row = _one(conn, f"SELECT * FROM {table} WHERE id = ?", (key,))
    if not row:
        fail(message, 404)
    return row


def calc_preview(conn, zone_id: str, truck_id: str, qty: dict, address="", landmark="") -> dict:
    zone = _pick(conn, "zones", zone_id, "Район не найден")
    truck = _pick(conn, "trucks", truck_id, "Машина не найдена")
    tariff = tariff_map(conn).get(truck_id)
    if not tariff:
        fail("Тариф доставки для машины не задан", 409)
    return _calc(zone, truck, tariff, price_map(conn), qty, address, landmark)


def create_quote(conn, zone_id: str, truck_id: str, qty: dict, address="", landmark="") -> dict:
    data = calc_preview(conn, zone_id, truck_id, qty, address, landmark)
    quote_id = "q_" + uuid.uuid4().hex[:16]
    ts = db.now_iso()
    conn.execute(
        "INSERT INTO quotes(id, created_at, zone_id, zone_name, km, truck_id, truck_name, "
        "capacity, address, landmark, material_sum, material_base_sum, delivery_sum, total, "
        "tariff_min, tariff_included_km, tariff_per_km, delivery_note) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            quote_id,
            ts,
            data["zoneId"],
            data["zoneName"],
            data["km"],
            data["truckId"],
            data["truckName"],
            data["capacity"],
            data["address"],
            data["landmark"],
            data["materialSum"],
            data["materialBaseSum"],
            data["deliverySum"],
            data["total"],
            data["tariff"]["minSum"],
            data["tariff"]["includedKm"],
            data["tariff"]["perKm"],
            data["deliveryNote"],
        ),
    )
    for item in data["items"]:
        conn.execute(
            "INSERT INTO quote_items(quote_id, material_id, name, qty, base_price, price) "
            "VALUES(?,?,?,?,?,?)",
            (
                quote_id,
                item["id"],
                item["name"],
                item["qty"],
                item["basePrice"],
                item["price"],
            ),
        )
    data["id"] = quote_id
    data["lockedAt"] = ts
    return data


def get_quote(conn, quote_id: str) -> dict:
    row = _one(conn, "SELECT * FROM quotes WHERE id = ?", (quote_id,))
    if not row:
        fail("Расчёт не найден", 404)
    items = _rows(
        conn,
        "SELECT material_id AS id, name, qty, base_price AS basePrice, price "
        "FROM quote_items WHERE quote_id = ? ORDER BY name",
        (quote_id,),
    )
    return {
        "id": row["id"],
        "zoneId": row["zone_id"],
        "zoneName": row["zone_name"],
        "km": row["km"],
        "address": row["address"],
        "landmark": row["landmark"],
        "truckId": row["truck_id"],
        "truckName": row["truck_name"],
        "capacity": row["capacity"],
        "items": items,
        "materialSum": row["material_sum"],
        "materialBaseSum": row["material_base_sum"],
        "deliverySum": row["delivery_sum"],
        "deliveryNote": row["delivery_note"],
        "total": row["total"],
        "tariff": {
            "minSum": row["tariff_min"],
            "includedKm": row["tariff_included_km"],
            "perKm": row["tariff_per_km"],
        },
        "lockedAt": row["created_at"],
    }


# ---------------------------------------------------------------- заказы


def _order_no(conn, year: int) -> str:
    key = f"order:{year}"
    row = _one(conn, "SELECT value FROM seq WHERE name = ?", (key,))
    value = (row["value"] if row else 0) + 1
    conn.execute(
        "INSERT INTO seq(name, value) VALUES(?, ?) "
        "ON CONFLICT(name) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    return f"ЩГ-{year}-{value:04d}"


def order_dict(conn, row: dict) -> dict:
    no = row["no"]
    items = _rows(
        conn,
        "SELECT material_id AS id, name, qty, base_price AS basePrice, price "
        "FROM order_items WHERE no = ? ORDER BY name",
        (no,),
    )
    events = _rows(conn, "SELECT at, text FROM order_events WHERE no = ? ORDER BY id", (no,))
    return {
        "id": no,
        "no": no,
        "createdAt": row["created_at"],
        "lockedAt": row["locked_at"],
        "client": {"name": row["client_name"], "phone": row["client_phone"]},
        "zoneId": row["zone_id"],
        "zoneName": row["zone_name"],
        "km": row["km"],
        "address": row["address"],
        "landmark": row["landmark"],
        "truckId": row["truck_id"],
        "truckName": row["truck_name"],
        "capacity": row["capacity"],
        "items": items,
        "materialSum": row["material_sum"],
        "materialBaseSum": row["material_base_sum"],
        "deliverySum": row["delivery_sum"],
        "deliveryNote": row["delivery_note"],
        "total": row["total"],
        "tariff": {
            "minSum": row["tariff_min"],
            "includedKm": row["tariff_included_km"],
            "perKm": row["tariff_per_km"],
        },
        "payment": row["payment"],
        "status": row["status"],
        "driverId": row["driver_id"],
        "crusherId": row["crusher_id"],
        "paid": bool(row["paid"]),
        "debt": row["debt"],
        "debtToCrusherId": row["debt_to_crusher_id"],
        "debtPaid": bool(row["debt_paid"]),
        "history": events,
    }


def get_order(conn, no: str) -> dict:
    row = _one(conn, "SELECT * FROM orders WHERE no = ?", (no,))
    if not row:
        fail("Заказ не найден", 404)
    return order_dict(conn, row)


def list_orders(conn) -> list[dict]:
    rows = _rows(conn, "SELECT * FROM orders ORDER BY created_at DESC, no DESC")
    return [order_dict(conn, r) for r in rows]


def _event(conn, no: str, text: str) -> None:
    conn.execute(
        "INSERT INTO order_events(no, at, text) VALUES(?,?,?)", (no, db.now_iso(), text)
    )


def create_order(conn, quote_id: str, client_name: str, client_phone: str, payment: str) -> dict:
    quote = get_quote(conn, quote_id)
    if _one(conn, "SELECT no FROM orders WHERE quote_id = ?", (quote_id,)):
        fail("Этот расчёт уже оформлен в заказ", 409)
    payment = (payment or "").upper()
    if payment not in PAYMENTS:
        fail("Способ оплаты: наличные водителю или карта")
    name = (client_name or "").strip()
    phone = (client_phone or "").strip()
    if not name:
        fail("Укажите имя клиента")
    if len(phone) < 5:
        fail("Укажите телефон клиента")

    now = db.now_iso()
    no = _order_no(conn, datetime.now().year)
    paid = 1 if payment == "CARD" else 0
    conn.execute(
        "INSERT INTO orders(no, quote_id, created_at, locked_at, client_name, client_phone, "
        "zone_id, zone_name, km, address, landmark, truck_id, truck_name, capacity, "
        "material_sum, material_base_sum, delivery_sum, total, tariff_min, tariff_included_km, "
        "tariff_per_km, delivery_note, payment, status, paid) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            no,
            quote_id,
            now,
            quote["lockedAt"],
            name,
            phone,
            quote["zoneId"],
            quote["zoneName"],
            quote["km"],
            quote["address"],
            quote["landmark"],
            quote["truckId"],
            quote["truckName"],
            quote["capacity"],
            quote["materialSum"],
            quote["materialBaseSum"],
            quote["deliverySum"],
            quote["total"],
            quote["tariff"]["minSum"],
            quote["tariff"]["includedKm"],
            quote["tariff"]["perKm"],
            quote["deliveryNote"],
            payment,
            "NEW",
            paid,
        ),
    )
    for item in quote["items"]:
        conn.execute(
            "INSERT INTO order_items(no, material_id, name, qty, base_price, price) "
            "VALUES(?,?,?,?,?,?)",
            (no, item["id"], item["name"], item["qty"], item["basePrice"], item["price"]),
        )
    _event(conn, no, "Заказ оформлен. Сумма зафиксирована.")
    _event(
        conn,
        no,
        "Оплата картой в приложении (демо-подтверждение)."
        if payment == "CARD"
        else "Оплата наличными водителю при выгрузке.",
    )
    return get_order(conn, no)


def assign(conn, no: str, driver_id: str, crusher_id: str) -> dict:
    order = _one(conn, "SELECT * FROM orders WHERE no = ?", (no,))
    if not order:
        fail("Заказ не найден", 404)
    if order["status"] != "NEW":
        fail("Заказ уже назначен или выполняется", 409)
    driver = _pick(conn, "drivers", driver_id, "Водитель не найден")
    crusher = _pick(conn, "crushers", crusher_id, "Дробилка не найдена")
    if driver["truck_id"] != order["truck_id"]:
        fail("У водителя другая машина — назначьте водителя с нужным типом")
    debt = order["material_base_sum"] if order["payment"] == "CASH" else 0
    conn.execute(
        "UPDATE orders SET status = 'ASSIGNED', driver_id = ?, crusher_id = ?, "
        "debt = ?, debt_to_crusher_id = ?, debt_paid = 0 WHERE no = ?",
        (driver_id, crusher_id, debt, crusher_id if debt else None, no),
    )
    _event(conn, no, f"Диспетчер назначил водителя {driver['name']} и {crusher['name']}.")
    if debt:
        _event(
            conn,
            no,
            f"Долг за материал {money_text(debt)} записан на водителя перед {crusher['name']}.",
        )
    return get_order(conn, no)


def driver_action(conn, no: str, action: str, driver_id: str | None = None) -> dict:
    order = _one(conn, "SELECT * FROM orders WHERE no = ?", (no,))
    if not order:
        fail("Заказ не найден", 404)
    if driver_id and order["driver_id"] and driver_id != order["driver_id"]:
        fail("Заказ назначен другому водителю", 403)
    rule = DRIVER_ACTIONS.get(action)
    if not rule:
        fail("Неизвестное действие водителя")
    source, target, text = rule
    if order["status"] != source:
        fail("Действие не подходит к текущему статусу заказа", 409)
    conn.execute("UPDATE orders SET status = ? WHERE no = ?", (target, no))
    if action == "delivered" and order["payment"] == "CASH":
        conn.execute("UPDATE orders SET paid = 1 WHERE no = ?", (no,))
    _event(conn, no, text)
    if action == "delivered" and order["payment"] == "CASH":
        _event(conn, no, "Клиент оплатил наличными водителю. Долг перед дробилкой остаётся.")
    return get_order(conn, no)


def crusher_confirm(conn, no: str, crusher_id: str | None = None) -> dict:
    order = _one(conn, "SELECT * FROM orders WHERE no = ?", (no,))
    if not order:
        fail("Заказ не найден", 404)
    if crusher_id and order["crusher_id"] and crusher_id != order["crusher_id"]:
        fail("Заказ направлен на другую дробилку", 403)
    if order["status"] != "AT_CRUSHER":
        fail("Отгрузку можно подтвердить только когда водитель на дробилке", 409)
    conn.execute("UPDATE orders SET status = 'LOADED' WHERE no = ?", (no,))
    _event(conn, no, "Дробилка подтвердила отгрузку материала.")
    return get_order(conn, no)


def mark_paid(conn, no: str) -> dict:
    order = _one(conn, "SELECT * FROM orders WHERE no = ?", (no,))
    if not order:
        fail("Заказ не найден", 404)
    if not order["paid"]:
        conn.execute("UPDATE orders SET paid = 1 WHERE no = ?", (no,))
        _event(conn, no, "Оплата отмечена диспетчером.")
    return get_order(conn, no)


def pay_debt(conn, no: str) -> dict:
    order = _one(conn, "SELECT * FROM orders WHERE no = ?", (no,))
    if not order:
        fail("Заказ не найден", 404)
    if order["debt"] <= 0:
        fail("По заказу нет долга перед дробилкой", 409)
    if order["debt_paid"]:
        fail("Долг уже погашен", 409)
    conn.execute("UPDATE orders SET debt_paid = 1 WHERE no = ?", (no,))
    _event(conn, no, "Долг перед дробилкой погашен.")
    return get_order(conn, no)


# ---------------------------------------------------------------- прайс и тарифы


def update_prices(conn, items: list[dict], author: str = "владелец") -> dict:
    if not items:
        fail("Нет цен для сохранения")
    current = price_map(conn)
    ts = db.now_iso()
    changed = 0
    for item in items:
        material_id = item.get("id")
        if material_id not in current:
            fail(f"Неизвестный материал: {material_id}")
        base = _as_int(item.get("base"), "цена дробилки")
        markup = _as_int(item.get("markup", 0), "наценка")
        old = current[material_id]
        if base == old["base"] and markup == old["markup"]:
            continue
        conn.execute(
            "UPDATE prices SET base = ?, markup = ?, updated_at = ? WHERE material_id = ?",
            (base, markup, ts, material_id),
        )
        conn.execute(
            "INSERT INTO price_history(at, material_id, old_price, new_price, old_markup, "
            "new_markup, author) VALUES(?,?,?,?,?,?,?)",
            (ts, material_id, old["base"], base, old["markup"], markup, author),
        )
        changed += 1
    return {"changed": changed, "prices": price_map(conn)}


def update_tariffs(conn, items: list[dict], author: str = "владелец") -> dict:
    if not items:
        fail("Нет тарифов для сохранения")
    current = tariff_map(conn)
    ts = db.now_iso()
    changed = 0
    for item in items:
        truck_id = item.get("id")
        if truck_id not in current:
            fail(f"Неизвестная машина: {truck_id}")
        min_sum = _as_int(item.get("minSum"), "минималка")
        included = _as_float(item.get("includedKm"), "километры в минималке")
        per_km = _as_int(item.get("perKm"), "сум за 1 км")
        old = current[truck_id]
        if (
            min_sum == old["minSum"]
            and abs(included - old["includedKm"]) < 1e-9
            and per_km == old["perKm"]
        ):
            continue
        conn.execute(
            "UPDATE tariffs SET min_sum = ?, included_km = ?, per_km = ?, updated_at = ? "
            "WHERE truck_id = ?",
            (min_sum, included, per_km, ts, truck_id),
        )
        conn.execute(
            "INSERT INTO tariff_history(at, truck_id, old_json, new_json, author) "
            "VALUES(?,?,?,?,?)",
            (
                ts,
                truck_id,
                json.dumps(
                    {
                        "minSum": old["minSum"],
                        "includedKm": old["includedKm"],
                        "perKm": old["perKm"],
                    },
                    ensure_ascii=False,
                ),
                json.dumps(
                    {"minSum": min_sum, "includedKm": included, "perKm": per_km},
                    ensure_ascii=False,
                ),
                author,
            ),
        )
        changed += 1
    return {"changed": changed, "tariffs": tariff_map(conn)}


# ---------------------------------------------------------------- сводки


def stats(conn) -> dict:
    orders = _rows(conn, "SELECT * FROM orders")
    active = [o for o in orders if o["status"] != "DELIVERED"]
    return {
        "count": len(orders),
        "active": len(active),
        "delivered": len([o for o in orders if o["status"] == "DELIVERED"]),
        "revenue": sum(o["total"] for o in orders),
        "material": sum(o["material_sum"] for o in orders),
        "delivery": sum(o["delivery_sum"] for o in orders),
        "unpaid": sum(o["total"] for o in orders if not o["paid"]),
        "debt": sum(o["debt"] for o in orders if o["debt"] and not o["debt_paid"]),
        "cash": len([o for o in orders if o["payment"] == "CASH"]),
        "card": len([o for o in orders if o["payment"] == "CARD"]),
    }


def clients(conn) -> list[dict]:
    rows = _rows(
        conn,
        "SELECT client_name AS name, client_phone AS phone, COUNT(*) AS orders, "
        "SUM(total) AS total, MAX(created_at) AS last FROM orders "
        "GROUP BY client_phone, client_name ORDER BY last DESC",
    )
    return rows


def report(conn) -> dict:
    by_material: dict[str, float] = {}
    by_truck: dict[str, int] = {}
    by_status: dict[str, int] = {}
    for order in _rows(conn, "SELECT * FROM orders"):
        by_truck[order["truck_name"]] = by_truck.get(order["truck_name"], 0) + 1
        by_status[order["status"]] = by_status.get(order["status"], 0) + 1
    for item in _rows(conn, "SELECT name, qty FROM order_items"):
        by_material[item["name"]] = by_material.get(item["name"], 0) + item["qty"]
    return {"byMaterial": by_material, "byTruck": by_truck, "byStatus": by_status}


def examples(conn) -> dict:
    prices = price_map(conn)
    tariffs = tariff_map(conn)
    zone = {"id": "ex", "name": "Пример", "km": 16}
    truck = {"id": "kamaz", "name": "Камаз", "capacity": 3}
    tariff = tariffs["kamaz"]
    price_example = _calc(zone, truck, tariff, prices, {"shps": 2, "scheben": 1})
    delivery = {}
    for truck_row in trucks(conn):
        tariff_row = tariffs.get(truck_row["id"])
        if not tariff_row:
            continue
        delivery[truck_row["id"]] = {
            str(km): delivery_sum(tariff_row, km)[0] for km in (8, 16, 28)
        }
    return {"price": price_example, "delivery": delivery}


def price_history(conn, limit: int = 10) -> list[dict]:
    rows = _rows(
        conn,
        "SELECT h.at, m.name, h.old_price, h.new_price, h.old_markup, h.new_markup "
        "FROM price_history h JOIN materials m ON m.id = h.material_id "
        "ORDER BY h.id DESC LIMIT ?",
        (limit,),
    )
    return [
        {
            "at": r["at"],
            "name": r["name"],
            "oldPrice": r["old_price"],
            "price": r["new_price"],
            "oldMarkup": r["old_markup"],
            "markup": r["new_markup"],
        }
        for r in rows
    ]


def tariff_history(conn, limit: int = 10) -> list[dict]:
    rows = _rows(conn, "SELECT * FROM tariff_history ORDER BY id DESC LIMIT ?", (limit,))
    return [
        {
            "at": r["at"],
            "truckId": r["truck_id"],
            "old": json.loads(r["old_json"]),
            "new": json.loads(r["new_json"]),
        }
        for r in rows
    ]


def bootstrap(conn) -> dict:
    prices = price_map(conn)
    tariffs = tariff_map(conn)
    return {
        "materials": materials(conn),
        "trucks": trucks(conn),
        "zones": zones(conn),
        "drivers": drivers(conn),
        "crushers": crushers(conn),
        "prices": prices,
        "tariffs": tariffs,
        "orders": list_orders(conn),
        "stats": stats(conn),
        "clients": clients(conn),
        "report": report(conn),
        "examples": examples(conn),
        "priceHistory": price_history(conn),
        "tariffHistory": tariff_history(conn),
        "serverTime": db.now_iso(),
    }


def reset_demo(conn) -> dict:
    for table in ("order_events", "order_items", "orders", "quote_items", "quotes"):
        conn.execute(f"DELETE FROM {table}")
    conn.execute("DELETE FROM price_history")
    conn.execute("DELETE FROM tariff_history")
    conn.execute("DELETE FROM seq")
    ts = db.now_iso()
    for material_id, base, markup in db.DEFAULT_PRICES:
        conn.execute(
            "UPDATE prices SET base = ?, markup = ?, updated_at = ? WHERE material_id = ?",
            (base, markup, ts, material_id),
        )
    for truck_id, min_sum, included, per_km in db.DEFAULT_TARIFFS:
        conn.execute(
            "UPDATE tariffs SET min_sum = ?, included_km = ?, per_km = ?, updated_at = ? "
            "WHERE truck_id = ?",
            (min_sum, included, per_km, ts, truck_id),
        )
    return {"ok": True}
