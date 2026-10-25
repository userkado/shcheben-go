"""Сквозные проверки API: расчёт, фиксация, статусы, долги, прайс, тарифы."""

from datetime import datetime


def calc(client, zone="z3", truck="kamaz", qty=None):
    return client.post(
        "/api/calc",
        json={
            "zoneId": zone,
            "truckId": truck,
            "qty": qty if qty is not None else {"shps": 2, "scheben": 1},
            "address": "Тестовая 5",
        },
    )


def quote(client, **kwargs):
    payload = {
        "zoneId": kwargs.get("zone", "z3"),
        "truckId": kwargs.get("truck", "kamaz"),
        "qty": kwargs.get("qty", {"shps": 2, "scheben": 1}),
        "address": "Тестовая 5",
        "landmark": "за магазином",
    }
    return client.post("/api/quotes", json=payload)


def make_order(client, payment="CASH", **kwargs):
    lock = quote(client, **kwargs)
    assert lock.status_code == 200, lock.text
    response = client.post(
        "/api/orders",
        json={
            "quoteId": lock.json()["id"],
            "clientName": "Тест Клиент",
            "clientPhone": "+998 90 000 00 01",
            "payment": payment,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def assign(client, no, driver="d1", crusher="k1"):
    return client.post(
        f"/api/orders/{no}/assign", json={"driverId": driver, "crusherId": crusher}
    )


def drive(client, no, action):
    return client.post(f"/api/orders/{no}/driver", json={"action": action})


def test_health_and_defaults(client):
    health = client.get("/api/health").json()
    assert health["ok"] is True
    assert health["schema"] == "1"

    data = client.get("/api/bootstrap").json()
    assert [m["id"] for m in data["materials"]] == ["zasypka", "pesok", "shps", "scheben"]
    assert data["prices"]["shps"] == {
        "id": "shps",
        "name": "ЩПС",
        "base": 150000,
        "markup": 0,
        "client": 150000,
        "updatedAt": data["prices"]["shps"]["updatedAt"],
    }
    assert data["tariffs"]["kamaz"] == {
        "id": "kamaz",
        "minSum": 50000,
        "includedKm": 10,
        "perKm": 5000,
        "updatedAt": data["tariffs"]["kamaz"]["updatedAt"],
    }
    assert data["orders"] == []
    assert data["examples"]["delivery"]["kamaz"] == {"8": 50000, "16": 80000, "28": 140000}
    assert data["examples"]["delivery"]["zil"] == {"8": 40000, "16": 64000, "28": 112000}
    assert data["examples"]["delivery"]["howo"] == {"8": 70000, "16": 112000, "28": 196000}


def test_calc_minimum_and_formula(client):
    km16 = calc(client).json()
    assert km16["materialSum"] == 390000
    assert km16["materialBaseSum"] == 390000
    assert km16["deliverySum"] == 80000
    assert km16["total"] == 470000
    assert "6 км × 5 000" in km16["deliveryNote"]

    short = calc(client, zone="z1", truck="zil", qty={"pesok": 2}).json()
    assert short["deliverySum"] == 40000
    assert "минималка" in short["deliveryNote"]
    assert short["total"] == 360000 + 40000

    long = calc(client, zone="z4", truck="howo", qty={"shps": 4, "scheben": 2}).json()
    assert long["deliverySum"] == 196000


def test_capacity_and_step_validation(client):
    over = calc(client, qty={"shps": 3.5})
    assert over.status_code == 400
    assert "Не помещается" in over.json()["detail"]

    exact = calc(client, qty={"shps": 3})
    assert exact.status_code == 200

    step = calc(client, qty={"shps": 0.3})
    assert step.status_code == 400

    empty = calc(client, qty={})
    assert empty.status_code == 400


def test_unknown_ids(client):
    assert calc(client, zone="zz").status_code == 404
    assert calc(client, truck="zz").status_code == 404


def test_price_change_does_not_touch_locked_quote_and_order(client):
    lock = quote(client)
    assert lock.status_code == 200
    quote_id = lock.json()["id"]
    assert lock.json()["total"] == 470000

    saved = client.put(
        "/api/admin/prices",
        json={"items": [{"id": "shps", "base": 160000, "markup": 10000}]},
    )
    assert saved.status_code == 200
    assert saved.json()["changed"] == 1
    assert saved.json()["prices"]["shps"]["client"] == 170000

    again = client.get(f"/api/quotes/{quote_id}").json()
    assert again["total"] == 470000
    assert again["items"][0]["price"] in (150000, 90000)

    order = client.post(
        "/api/orders",
        json={
            "quoteId": quote_id,
            "clientName": "Али",
            "clientPhone": "+998 90 111 11 11",
            "payment": "CARD",
        },
    ).json()
    assert order["total"] == 470000
    assert order["materialSum"] == 390000

    fresh = calc(client).json()
    fresh_shps = next(i for i in fresh["items"] if i["id"] == "shps")
    assert fresh_shps["price"] == 170000
    assert fresh_shps["basePrice"] == 160000
    assert fresh["materialSum"] == 2 * 170000 + 90000
    assert fresh["total"] == 510000

    history = client.get("/api/bootstrap").json()["priceHistory"]
    assert history[0]["name"] == "ЩПС"
    assert history[0]["oldPrice"] == 150000
    assert history[0]["price"] == 160000
    assert history[0]["markup"] == 10000


def test_cash_lifecycle_and_debt(client):
    order = make_order(client, payment="CASH")
    no = order["no"]
    assert no.startswith(f"ЩГ-{datetime.now().year}-")
    assert order["status"] == "NEW"
    assert order["paid"] is False
    assert order["debt"] == 0

    assigned = assign(client, no)
    assert assigned.status_code == 200, assigned.text
    assigned = assigned.json()
    assert assigned["status"] == "ASSIGNED"
    assert assigned["driverId"] == "d1"
    assert assigned["crusherId"] == "k1"
    assert assigned["debt"] == 390000
    assert assigned["debtToCrusherId"] == "k1"
    assert assigned["debtPaid"] is False

    assert client.post(f"/api/orders/{no}/paid").status_code == 200

    assert drive(client, no, "toCrusher").json()["status"] == "AT_CRUSHER"
    assert drive(client, no, "toCrusher").status_code == 409

    confirmed = client.post(f"/api/orders/{no}/crusher-confirm", json={})
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "LOADED"

    assert drive(client, no, "onRoute").json()["status"] == "EN_ROUTE"
    delivered = drive(client, no, "delivered").json()
    assert delivered["status"] == "DELIVERED"
    assert delivered["paid"] is True
    assert delivered["debt"] == 390000
    assert delivered["debtPaid"] is False

    paid_debt = client.post(f"/api/orders/{no}/debt-paid")
    assert paid_debt.status_code == 200
    assert paid_debt.json()["debtPaid"] is True
    assert client.post(f"/api/orders/{no}/debt-paid").status_code == 409

    stats = client.get("/api/bootstrap").json()["stats"]
    assert stats["debt"] == 0
    assert stats["delivered"] == 1


def test_card_has_no_crusher_debt(client):
    order = make_order(client, payment="CARD")
    assert order["paid"] is True
    assigned = assign(client, order["no"]).json()
    assert assigned["debt"] == 0
    assert assigned["debtToCrusherId"] is None
    delivered = drive(client, order["no"], "delivered")
    assert delivered.status_code == 409  # нельзя выгрузить до отгрузки


def test_wrong_driver_truck_and_repeat_assign(client):
    order = make_order(client, payment="CASH")
    no = order["no"]
    wrong = assign(client, no, driver="d2")
    assert wrong.status_code == 400
    assert "другая машина" in wrong.json()["detail"]
    assert assign(client, no).status_code == 200
    assert assign(client, no).status_code == 409


def test_quote_reuse_and_client_validation(client):
    lock = quote(client).json()
    first = client.post(
        "/api/orders",
        json={
            "quoteId": lock["id"],
            "clientName": "Клиент",
            "clientPhone": "+998 90 222 22 22",
            "payment": "CASH",
        },
    )
    assert first.status_code == 201
    second = client.post(
        "/api/orders",
        json={
            "quoteId": lock["id"],
            "clientName": "Клиент",
            "clientPhone": "+998 90 222 22 22",
            "payment": "CASH",
        },
    )
    assert second.status_code == 409

    missing = client.post(
        "/api/orders",
        json={
            "quoteId": "q_missing",
            "clientName": "Клиент",
            "clientPhone": "+998 90 222 22 22",
            "payment": "CASH",
        },
    )
    assert missing.status_code == 404

    lock2 = quote(client).json()
    no_name = client.post(
        "/api/orders",
        json={"quoteId": lock2["id"], "clientName": " ", "clientPhone": "12345", "payment": "CARD"},
    )
    assert no_name.status_code == 400
    no_phone = client.post(
        "/api/orders",
        json={"quoteId": lock2["id"], "clientName": "Имя", "clientPhone": "", "payment": "CARD"},
    )
    assert no_phone.status_code == 400
    bad_pay = client.post(
        "/api/orders",
        json={
            "quoteId": lock2["id"],
            "clientName": "Имя",
            "clientPhone": "+998 90 333 33 33",
            "payment": "BITCOIN",
        },
    )
    assert bad_pay.status_code == 400


def test_tariff_change_and_snapshot(client):
    order = make_order(client, payment="CASH")
    assert order["total"] == 470000
    no = order["no"]

    saved = client.put(
        "/api/admin/tariffs",
        json={"items": [{"id": "kamaz", "minSum": 60000, "includedKm": 10, "perKm": 6000}]},
    )
    assert saved.status_code == 200
    assert saved.json()["changed"] == 1

    fresh = calc(client).json()
    assert fresh["deliverySum"] == 60000 + 6 * 6000
    assert fresh["total"] == 390000 + 96000

    old = client.get(f"/api/orders/{no}").json()
    assert old["total"] == 470000
    assert old["deliverySum"] == 80000
    assert "5 000" in old["deliveryNote"]

    history = client.get("/api/bootstrap").json()["tariffHistory"]
    assert history[0]["truckId"] == "kamaz"
    assert history[0]["new"]["minSum"] == 60000


def test_price_and_tariff_validation(client):
    negative = client.put(
        "/api/admin/prices", json={"items": [{"id": "shps", "base": -1, "markup": 0}]}
    )
    assert negative.status_code == 400
    unknown = client.put(
        "/api/admin/prices", json={"items": [{"id": "gold", "base": 1, "markup": 0}]}
    )
    assert unknown.status_code == 400
    bad_tariff = client.put(
        "/api/admin/tariffs",
        json={"items": [{"id": "kamaz", "minSum": 1, "includedKm": -5, "perKm": 100}]},
    )
    assert bad_tariff.status_code == 400
    empty = client.put("/api/admin/prices", json={"items": []})
    assert empty.status_code == 400


def test_clients_and_report(client):
    make_order(client, payment="CARD")
    bootstrap = client.get("/api/bootstrap").json()
    assert bootstrap["clients"][0]["name"] == "Тест Клиент"
    assert bootstrap["clients"][0]["orders"] == 1
    assert bootstrap["clients"][0]["total"] == 470000
    assert bootstrap["report"]["byMaterial"]["ЩПС"] == 2
    assert bootstrap["report"]["byTruck"]["Камаз"] == 1

    report = client.get("/api/admin/report").json()
    assert report["stats"]["count"] == 1
    assert report["stats"]["card"] == 1
    assert report["report"]["byMaterial"]["Щебень"] == 1


def test_reset_demo_restores_defaults(client):
    make_order(client, payment="CASH")
    client.put(
        "/api/admin/prices", json={"items": [{"id": "pesok", "base": 200000, "markup": 5000}]}
    )
    reset = client.post("/api/admin/reset-demo")
    assert reset.status_code == 200
    data = client.get("/api/bootstrap").json()
    assert data["orders"] == []
    assert data["stats"]["count"] == 0
    assert data["prices"]["pesok"]["base"] == 180000
    assert data["prices"]["pesok"]["markup"] == 0
    assert data["priceHistory"] == []
    assert data["tariffs"]["kamaz"]["minSum"] == 50000
