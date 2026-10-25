"use strict";

const root = document.getElementById("app");

/* ============================ helpers ============================ */
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function ic(name) {
  return '<svg class="ic" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}
function chip(text, tone) {
  return '<span class="chip ' + (tone || "") + '">' + esc(text) + "</span>";
}
function statusChip(st) {
  const s = DATA.statuses[st] || { name: st, tone: "" };
  return chip(s.name, s.tone);
}
function payChip(o) {
  return o.paid ? chip("оплачен", "ok") : chip("не оплачен", "bad");
}
function stepper(n) {
  const labels = ["Адрес и машина", "Сырьё", "Расчёт"];
  return '<div class="stepper">' + labels.map((label, i) => {
    const no = i + 1;
    return '<div class="step ' + (no === n ? "on" : no < n ? "done" : "") + '">' +
      '<b>' + no + "</b><span>" + label + "</span></div>";
  }).join("") + "</div>";
}
function empty(title, text, action) {
  return '<div class="empty"><div class="empty-ic">' + ic("box") + "</div><b>" + esc(title) +
    '</b><p class="muted">' + esc(text) + "</p>" + (action || "") + "</div>";
}
function plural(n, one, few, many) {
  const abs = Math.abs(Number(n) || 0) % 100, last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
function qtyWord(n) { return plural(n, "чумич", "чумича", "чумичей"); }
function toast(text) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}
function orderItems(o) {
  return o.items.map(i =>
    '<div class="kv"><span>' + esc(i.name) + " · " + qtyFmt(i.qty) + " " + qtyWord(i.qty) + "</span><b>" +
    money(i.qty * i.price) + "</b></div>"
  ).join("");
}
function lockStamp(o) {
  return '<div class="lock"><span class="lock-ic">' + ic("lock") + '</span><div><b>Сумма зафиксирована</b><small>' +
    dateTime(o.lockedAt || o.createdAt) + " · изменение невозможно</small></div></div>";
}

/* ============================ каркас ============================ */
function topbar() {
  const roles = [
    ["client", "Клиент"],
    ["driver", "Водитель"],
    ["crusher", "Дробилка"],
    ["dispatcher", "Диспетчер"]
  ];
  return '<header class="topbar">' +
    '<div class="brand"><span class="brand-mark">Щ</span><div class="brand-text"><b>ЩЕБЕНЬ GO</b><small>сырьё и доставка</small></div></div>' +
    '<nav class="roles">' + roles.map(r =>
      '<button class="role-btn ' + (S.role === r[0] ? "active" : "") + '" data-act="role" data-role="' + r[0] + '">' + r[1] + "</button>"
    ).join("") + "</nav>" +
    '<span class="demo-tag">демо · локальная база SQLite</span>' +
    "</header>";
}

function info(html) { return '<div class="info">' + html + "</div>"; }

function sideCard() {
  return '<aside class="stage-side">' +
    '<div class="side-card"><p class="eyebrow">Цепочка заказа</p>' +
    '<ol class="chain"><li><b>Клиент</b><span>адрес, машина, сырьё</span></li>' +
    '<li><b>Диспетчер</b><span>водитель + дробилка</span></li>' +
    '<li><b>Дробилка</b><span>отгрузка материала</span></li>' +
    '<li><b>Водитель</b><span>доставка клиенту</span></li></ol></div>' +
    '<div class="side-card note"><b>Демо-режим</b><p class="muted">Заказы, цены и тарифы хранятся в локальной базе SQLite на сервере. Цены материалов и тариф доставки задаются в панели диспетчера.</p></div>' +
    "</aside>";
}

function phoneShell(content, tabs) {
  return '<div class="stage"><div class="phone">' +
    '<div class="phone-bar"><span>9:41</span><b>Telegram · Mini App</b><span>▮▮▮</span></div>' +
    '<div class="phone-body">' + content + "</div>" +
    (tabs || "") +
    "</div>" + sideCard() + "</div>";
}

function tabbar(items) {
  return '<nav class="tabbar">' + items.map(i =>
    '<button class="tab ' + (i.active ? "active" : "") + '" data-act="screen" data-screen="' + i.code + '">' +
    ic(i.icon) + "<span>" + i.label + "</span></button>"
  ).join("") + "</nav>";
}

/* ============================ клиент ============================ */
function clientScreen() {
  const code = S.screen.client;
  if (code === "C02") return clientStep1();
  if (code === "C03") return clientStep2();
  if (code === "C04") return clientStep3();
  if (code === "C05") return clientStatus();
  if (code === "C06") return clientOrders();
  if (code === "C07") return clientProfile();
  return clientCatalog();
}

function clientTabs() {
  const c = S.screen.client;
  const catalog = ["C01", "C02", "C03", "C04"].includes(c);
  const orders = ["C05", "C06"].includes(c);
  return tabbar([
    { code: "C01", label: "Каталог", icon: "home", active: catalog },
    { code: "C06", label: "Заказы", icon: "list", active: orders },
    { code: "C07", label: "Профиль", icon: "user", active: c === "C07" }
  ]);
}

function clientCatalog() {
  return '<div class="screen">' +
    '<div class="hero"><p class="eyebrow">Доставка нерудных материалов</p>' +
    '<h1>Сырьё с дробилки</h1>' +
    '<p class="muted">Цена за 1 чумич. Доставка: минималка за включённые километры, дальше — за каждый километр. Сумма фиксируется при расчёте.</p></div>' +
    '<div class="mat-grid">' + DATA.materials.map(m =>
      '<button class="mat-card" data-act="startOrder" data-mat="' + m.id + '">' +
      '<span class="mat-top"><b>' + esc(m.name) + '</b><small>' + esc(m.note) + "</small></span>" +
      '<span class="mat-price">' + money(priceClient(m.id)) + '<small> / чумич</small></span>' +
      '<span class="mat-go">Заказать ' + ic("arrow-right") + "</span></button>"
    ).join("") + "</div>" +
    info('<b>Как считается заказ</b><p>Материал + доставка: минималка за включённые километры и плата за каждый следующий. После расчёта сумма фиксируется и не меняется.</p>') +
    info('<b>Оплата</b><p>Наличные водителю или карта в приложении. При оплате наличными долг за материал записывается на водителя перед конкретной дробилкой.</p>') +
    "</div>";
}

function clientStep1() {
  const z = draftZone(), t = draftTruck();
  return '<div class="screen">' +
    '<button class="back" data-act="screen" data-screen="C01">' + ic("arrow-left") + " Каталог</button>" +
    stepper(1) +
    '<h1 class="tight">Адрес и машина</h1>' +
    '<div class="card">' +
      '<label class="field"><span>Район / зона</span><select data-field="zone">' +
        '<option value="">Выберите зону</option>' +
        DATA.zones.map(x => '<option value="' + x.id + '"' + (S.draft.zoneId === x.id ? " selected" : "") + ">" + esc(x.name) + " · " + x.km + " км</option>").join("") +
      "</select></label>" +
      (z ? '<div class="hint">До дробилки по дороге: <b>' + z.km + " км</b></div>" : '<div class="hint muted">Километраж берётся из справочника зон.</div>') +
      '<label class="field"><span>Адрес доставки</span><input data-field="address" value="' + esc(S.draft.address) + '" placeholder="Улица, дом"></label>' +
      '<label class="field"><span>Ориентир для водителя</span><input data-field="landmark" value="' + esc(S.draft.landmark) + '" placeholder="Например: за магазином"></label>' +
    "</div>" +
    '<h2>Машина</h2>' +
    '<div class="truck-grid">' + DATA.trucks.map(x => {
      const d = DATA.drivers.filter(v => v.truckId === x.id).length;
      return '<button class="truck-card ' + (S.draft.truckId === x.id ? "active" : "") + '" data-act="setTruck" data-truck="' + x.id + '">' +
        '<span class="truck-ic">' + ic("truck") + "</span>" +
        "<b>" + esc(x.name) + "</b><span>" + qtyFmt(x.capacity) + " " + qtyWord(x.capacity) + "</span>" +
        '<small>' + d + " водител" + (d === 1 ? "ь" : "я") + "</small></button>";
    }).join("") + "</div>" +
    (t ? '<div class="hint">Состав должен уместиться в ' + esc(t.name) + ": " + qtyFmt(t.capacity) + " " + qtyWord(t.capacity) + ".</div>" : "") +
    '<div class="spacer"></div>' +
    '<button class="btn" data-act="nextStep1" ' + (draftCanStep1() ? "" : "disabled") + ">Далее: сырьё</button>" +
    "</div>";
}

function clientStep2() {
  const t = draftTruck();
  if (!t) return clientStep1();
  const used = draftQtySum();
  const remain = Math.max(0, t.capacity - used);
  const over = Math.max(0, used - t.capacity);
  const pct = Math.min(100, (used / t.capacity) * 100);
  const preview = S.draft.preview;
  return '<div class="screen">' +
    '<button class="back" data-act="backStep1">' + ic("arrow-left") + " Адрес и машина</button>" +
    stepper(2) +
    '<h1 class="tight">Сырьё</h1>' +
    '<div class="card cap-card"><div class="row"><span><b>' + esc(t.name) + "</b><small class=\"mut block\">Вместимость " + qtyFmt(t.capacity) + " " + qtyWord(t.capacity) + "</small></span>" +
      '<span class="cap-num">' + qtyFmt(used) + " / " + qtyFmt(t.capacity) + "</span></div>" +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="hint ' + (remain <= 0 ? "warn-text" : "muted") + '">' +
        (over > 0 ? "Перегруз: " + qtyFmt(over) + " " + qtyWord(over) + " — уберите лишнее"
          : remain > 0 ? "Свободно: " + qtyFmt(remain) + " " + qtyWord(remain)
          : "Машина заполнена") + "</div></div>" +
    '<div class="card flat mat-rows">' + DATA.materials.map(m => {
      const q = Number(S.draft.qty[m.id]) || 0;
      const row = preview && preview.items.find(i => i.id === m.id);
      const rowSum = row && row.qty === q ? money(row.qty * row.price) : "—";
      return '<div class="qty-row"><div class="qty-name"><b>' + esc(m.name) + "</b><small>" + money(priceClient(m.id)) + " / чумич</small></div>" +
        '<div class="qty-controls"><button class="qty-btn" data-act="incMat" data-mat="' + m.id + '" data-delta="-0.5" ' + (q <= 0 ? "disabled" : "") + ">" + ic("minus") + "</button>" +
        '<span class="qty-val">' + qtyFmt(q) + "</span>" +
        '<button class="qty-btn" data-act="incMat" data-mat="' + m.id + '" data-delta="0.5" ' + (remain < 0.5 ? "disabled" : "") + ">" + ic("plus") + "</button></div>" +
        '<div class="qty-sum">' + rowSum + "</div></div>";
    }).join("") + "</div>" +
    '<div class="card total-card"><div class="kv"><span>Материал</span><b>' +
      (preview ? money(preview.materialSum) : "—") + "</b></div>" +
      '<div class="hint muted">' + (over > 0 ? "Уберите лишнее — расчёт станет доступен." : preview ? "Доставка добавится на следующем шаге." : "Считаем материал на сервере…") + "</div></div>" +
    '<div class="spacer"></div>' +
    '<button class="btn" data-act="nextStep2" ' + (draftCanStep2() ? "" : "disabled") + ">К расчёту</button>" +
    "</div>";
}

function quoteBody(q, withItems) {
  return '<div class="card">' +
    '<div class="kv"><span>Адрес</span><b>' + esc(q.zoneName) + " · " + esc(q.address) + "</b></div>" +
    '<div class="kv"><span>Машина</span><b>' + esc(q.truckName) + " · " + qtyFmt(q.capacity) + " " + qtyWord(q.capacity) + "</b></div>" +
    (withItems ? '<div class="divider"></div>' + orderItems({ items: q.items }) : "") +
    '<div class="divider"></div>' +
    '<div class="kv"><span>Материал</span><b>' + money(q.materialSum) + "</b></div>" +
    '<div class="kv"><span>Доставка · ' + qtyFmt(q.km) + " км</span><b>" + money(q.deliverySum) + "</b></div>" +
    '<div class="hint muted">' + esc(q.deliveryNote || "по тарифу перевозчика") + "</div>" +
    '<div class="kv total"><span>Итого</span><b>' + money(q.total) + "</b></div>" +
    "</div>";
}

function clientStep3() {
  const q = S.draft.quote;
  if (!q) {
    if (!draftTruck() || !draftZone() || !draftCanStep2()) return clientStep2();
    const pv = S.draft.preview;
    if (!pv) {
      return '<div class="screen">' +
        '<button class="back" data-act="backStep2">' + ic("arrow-left") + " Сырьё</button>" +
        stepper(3) +
        '<h1 class="tight">Расчёт</h1>' +
        (S.draft.previewError
          ? '<div class="warn-box"><b>Не удалось посчитать</b><p>' + esc(S.draft.previewError) + "</p></div>" +
            '<button class="btn" data-act="calcPreview">Повторить</button>'
          : '<div class="card"><p class="muted">Считаем сумму на сервере…</p></div>') +
        "</div>";
    }
    return '<div class="screen">' +
      '<button class="back" data-act="backStep2">' + ic("arrow-left") + " Сырьё</button>" +
      stepper(3) +
      '<h1 class="tight">Расчёт</h1>' +
      quoteBody(pv, true) +
      info('<b>Как считается доставка</b><p>Минималка за включённые километры плюс плата за каждый следующий километр. Тариф задаётся в панели диспетчера. После расчёта сумма фиксируется.</p>') +
      '<button class="btn" data-act="calc">Рассчитать и зафиксировать</button>' +
      "</div>";
  }

  return '<div class="screen">' +
    '<button class="back" data-act="unlock">' + ic("arrow-left") + " Изменить параметры</button>" +
    '<h1 class="tight">Расчёт и оплата</h1>' +
    lockStamp(q) +
    quoteBody(q, true) +
    '<h2>Оплата</h2>' +
    '<div class="pay-grid">' +
      '<button class="pay-card ' + (S.draft.payment === "CASH" ? "active" : "") + '" data-act="pay" data-pay="CASH"><b>Наличные водителю</b><small>Долг за материал запишется на водителя перед дробилкой</small></button>' +
      '<button class="pay-card ' + (S.draft.payment === "CARD" ? "active" : "") + '" data-act="pay" data-pay="CARD"><b>Карта в приложении</b><small>Демо-подтверждение, долга перед дробилкой нет</small></button>' +
    "</div>" +
    '<div class="spacer"></div>' +
    '<button class="btn" data-act="place">Оформить заказ · ' + money(q.total) + "</button>" +
    '<p class="fine">Сумма уже зафиксирована. Изменение адреса, машины или состава создаёт новый расчёт.</p>' +
    "</div>";
}

function timeline(o) {
  const idx = DATA.statusOrder.indexOf(o.status);
  const subs = {
    NEW: "Заказ у диспетчера",
    ASSIGNED: "Водитель и дробилка назначены",
    AT_CRUSHER: "Водитель на территории дробилки",
    LOADED: "Материал отпущен",
    EN_ROUTE: "Машина едет к клиенту",
    DELIVERED: "Груз у клиента"
  };
  return '<div class="timeline">' + DATA.statusOrder.map((st, i) => {
    const cls = i < idx ? "done" : i === idx ? "now" : "";
    return '<div class="tl ' + cls + '"><span class="dot"></span><div><b>' + DATA.statuses[st].name + "</b><small>" + subs[st] + "</small></div></div>";
  }).join("") + "</div>";
}

function clientStatus() {
  const o = currentClientOrder();
  if (!o) return empty("Заказа пока нет", "Оформите первый заказ из каталога.", '<button class="btn" data-act="screen" data-screen="C01">В каталог</button>');
  const d = o.driverId ? driver(o.driverId) : null;
  const k = o.crusherId ? crusher(o.crusherId) : null;
  return '<div class="screen">' +
    '<p class="eyebrow">' + esc(o.no) + "</p>" +
    '<div class="row"><h1 class="tight grow">Заказ</h1>' + statusChip(o.status) + "</div>" +
    '<div class="card flat"><div class="row"><span class="grow"><b>' + money(o.total) + "</b><small class=\"mut block\">" + dateTime(o.createdAt) + "</small></span>" + payChip(o) + "</div></div>" +
    lockStamp(o) +
    timeline(o) +
    '<div class="card"><div class="kv"><span>Адрес</span><b>' + esc(o.zoneName) + " · " + esc(o.address) + "</b></div>" +
      '<div class="kv"><span>Машина</span><b>' + esc(o.truckName) + "</b></div>" +
      '<div class="kv"><span>Водитель</span><b>' + (d ? esc(d.name) + " · " + esc(d.plate) : "ещё не назначен") + "</b></div>" +
      '<div class="kv"><span>Дробилка</span><b>' + (k ? esc(k.name) : "ещё не назначена") + "</b></div>" +
      '<div class="kv"><span>Оплата</span><b>' + DATA.payments[o.payment] + "</b></div>" +
      '<div class="kv"><span>Доставка</span><b>' + o.km + " км · " + money(o.deliverySum) + "</b></div></div>" +
    '<div class="card"><h3>Состав</h3>' + orderItems(o) + "</div>" +
    '<button class="btn2" data-act="repeat" data-id="' + o.id + '">Повторить заказ</button>' +
    '<button class="btn" data-act="screen" data-screen="C06">Мои заказы</button>' +
    "</div>";
}

function clientOrders() {
  if (!S.orders.length) return '<div class="screen"><h1>Мои заказы</h1>' +
    empty("Заказов нет", "Выберите материал в каталоге.", '<button class="btn" data-act="screen" data-screen="C01">В каталог</button>') + "</div>";
  return '<div class="screen"><h1>Мои заказы</h1>' +
    S.orders.map(o =>
      '<button class="order-item" data-act="openOrder" data-id="' + o.id + '" data-target="C05">' +
      '<div class="row"><b>' + esc(o.no) + "</b>" + statusChip(o.status) + "</div>" +
      '<div class="mut">' + esc(o.zoneName) + " · " + esc(o.address) + "</div>" +
      '<div class="row"><span class="mut">' + dateShort(o.createdAt) + '</span><b>' + money(o.total) + "</b></div>" +
      "</button>"
    ).join("") + "</div>";
}

function clientProfile() {
  return '<div class="screen"><h1>Профиль</h1>' +
    '<div class="card">' +
      '<label class="field"><span>Имя</span><input id="profileName" value="' + esc(S.client.name) + '"></label>' +
      '<label class="field"><span>Телефон</span><input id="profilePhone" value="' + esc(S.client.phone) + '"></label>' +
      '<div class="hint muted">Эти данные попадают в карточку клиента и в клиентскую базу диспетчера.</div>' +
    "</div>" +
    '<button class="btn" data-act="saveProfile">Сохранить</button>' +
    info('<b>Клиентская база</b><p>Все заказы и контакты остаются у владельца приложения.</p>') +
    "</div>";
}

/* ============================ водитель ============================ */
function driverScreen() {
  const code = S.screen.driver;
  if (code === "D02") return driverOrder();
  if (code === "D05") return driverDebts();
  if (code === "D07") return driverTruck();
  return driverOrdersScreen();
}

function driverTabs() {
  const c = S.screen.driver;
  return tabbar([
    { code: "D01", label: "Заказы", icon: "list", active: c === "D01" || c === "D02" },
    { code: "D05", label: "Долг", icon: "cash", active: c === "D05" },
    { code: "D07", label: "Машина", icon: "truck", active: c === "D07" }
  ]);
}

function driverSwitch() {
  return '<div class="switch-row"><label>Водитель<select data-field="driverPick">' +
    DATA.drivers.map(d => '<option value="' + d.id + '"' + (S.driverId === d.id ? " selected" : "") + ">" + esc(d.name) + " · " + esc(truck(d.truckId).name) + "</option>").join("") +
    "</select></label></div>";
}

function driverOrdersScreen() {
  const d = driver(S.driverId);
  const t = truck(d.truckId);
  const list = driverOrders(S.driverId);
  return '<div class="screen">' + driverSwitch() +
    '<p class="eyebrow">Кабинет водителя</p><h1 class="tight">Мои заказы</h1>' +
    '<div class="card flat"><div class="row"><span class="grow"><b>' + esc(d.name) + "</b><small class=\"mut block\">" + esc(t.name) + " · " + esc(d.plate) + "</small></span>" + chip(qtyFmt(t.capacity) + " " + qtyWord(t.capacity), "info") + "</div></div>" +
    (list.length ? list.map(o =>
      '<button class="order-item" data-act="openOrder" data-id="' + o.id + '" data-target="D02">' +
      '<div class="row"><b>' + esc(o.no) + "</b>" + statusChip(o.status) + "</div>" +
      '<div class="mut">' + esc(o.zoneName) + " · " + esc(o.address) + "</div>" +
      '<div class="row"><span class="mut">' + esc(o.crusherId ? crusher(o.crusherId).name : "дробилка не назначена") + '</span><b>' + money(o.total) + "</b></div>" +
      "</button>"
    ).join("") : empty("Заказов нет", "Диспетчер назначит заказ — он появится здесь.", "")) +
    "</div>";
}

function driverOrder() {
  const o = currentDriverOrder();
  if (!o) return empty("Заказ не выбран", "Вернитесь к списку заказов.", '<button class="btn" data-act="screen" data-screen="D01">К заказам</button>');
  const k = o.crusherId ? crusher(o.crusherId) : null;
  let action = "";
  if (o.status === "ASSIGNED") action = '<button class="btn" data-act="driverStage" data-stage="toCrusher" data-id="' + o.id + '">Я на дробилке</button>';
  else if (o.status === "AT_CRUSHER") action = '<button class="btn" disabled>Ждём подтверждения дробилки</button>';
  else if (o.status === "LOADED") action = '<button class="btn" data-act="driverStage" data-stage="onRoute" data-id="' + o.id + '">В пути к клиенту</button>';
  else if (o.status === "EN_ROUTE") action = '<button class="btn" data-act="driverStage" data-stage="delivered" data-id="' + o.id + '">Выгрузил у клиента</button>';
  else action = '<div class="ok-box">' + ic("check") + " Заказ доставлен</div>";
  return '<div class="screen">' +
    '<button class="back" data-act="screen" data-screen="D01">' + ic("arrow-left") + " Мои заказы</button>" +
    '<p class="eyebrow">' + esc(o.no) + "</p>" +
    '<div class="row"><h1 class="tight grow">Заказ</h1>' + statusChip(o.status) + "</div>" +
    '<div class="card"><div class="kv"><span>Клиент</span><b>' + esc(o.client.name) + "</b></div>" +
      '<div class="kv"><span>Телефон</span><b>' + esc(o.client.phone) + "</b></div>" +
      '<div class="kv"><span>Адрес</span><b>' + esc(o.zoneName) + " · " + esc(o.address) + "</b></div>" +
      (o.landmark ? '<div class="kv"><span>Ориентир</span><b>' + esc(o.landmark) + "</b></div>" : "") +
      '<div class="kv"><span>Дробилка</span><b>' + (k ? esc(k.name) : "не назначена") + "</b></div>" +
      (k ? '<div class="hint muted">' + esc(k.address) + "</div>" : "") + "</div>" +
    '<div class="card"><h3>Состав · ' + esc(o.truckName) + "</h3>" + orderItems(o) + '<div class="divider"></div>' +
      '<div class="kv"><span>Клиент платит</span><b>' + money(o.total) + "</b></div>" +
      '<div class="kv"><span>Способ</span><b>' + DATA.payments[o.payment] + "</b></div>" +
      '<div class="kv"><span>Оплата</span><b>' + (o.paid ? "получена" : "при выгрузке") + "</b></div></div>" +
    (o.payment === "CASH" && o.debt > 0 && !o.debtPaid ?
      '<div class="warn-box"><b>Долг перед ' + esc(k ? k.name : "дробилкой") + ": " + money(o.debt) + "</b><p>Закройте долг после расчёта с дробилкой в разделе «Долг».</p></div>" :
      (o.debtPaid ? '<div class="ok-box">' + ic("check") + " Долг перед дробилкой погашен</div>" : "")) +
    '<div class="spacer"></div>' + action + "</div>";
}

function driverDebts() {
  const list = driverDebtOrders(S.driverId);
  const total = totalDebt(list);
  return '<div class="screen">' + driverSwitch() +
    '<h1 class="tight">Долг дробилке</h1>' +
    '<div class="card flat"><div class="kv"><span>Всего долг</span><b class="big">' + money(total) + "</b></div>" +
      '<div class="hint muted">Долг за материал при оплате клиента наличными.</div></div>' +
    (list.length ? list.map(o => {
      const k = crusher(o.crusherId);
      return '<div class="card"><div class="row"><b>' + esc(o.no) + "</b>" + chip(k ? k.name : "дробилка", "warn") + "</div>" +
        '<div class="kv"><span>Материал</span><b>' + money(o.debt) + "</b></div>" +
        '<div class="kv"><span>Дата</span><b>' + dateShort(o.createdAt) + "</b></div>" +
        '<button class="btn2" data-act="payDebt" data-id="' + o.id + '">Погасить долг</button></div>';
    }).join("") : empty("Долгов нет", "Все расчёты с дробилками закрыты.", "")) +
    "</div>";
}

function driverTruck() {
  const d = driver(S.driverId);
  const t = truck(d.truckId);
  return '<div class="screen">' + driverSwitch() +
    '<h1 class="tight">Моя машина</h1>' +
    '<div class="card"><div class="kv"><span>Водитель</span><b>' + esc(d.name) + "</b></div>" +
      '<div class="kv"><span>Машина</span><b>' + esc(t.name) + "</b></div>" +
      '<div class="kv"><span>Вместимость</span><b>' + qtyFmt(t.capacity) + " " + qtyWord(t.capacity) + "</b></div>" +
      '<div class="kv"><span>Госномер</span><b>' + esc(d.plate) + "</b></div>" +
      '<div class="kv"><span>Телефон</span><b>' + esc(d.phone) + "</b></div></div>" +
    info('<b>Смена машины</b><p>Тип машины и вместимость меняет диспетчер. Клиент выбирает тип машины при заказе.</p>') +
    "</div>";
}

/* ============================ дробилка ============================ */
function crusherScreen() {
  const code = S.screen.crusher;
  if (code === "K02") return crusherPrices();
  if (code === "K03") return crusherOrder();
  if (code === "K04") return crusherDebts();
  if (code === "K05") return crusherHistory();
  return crusherOrdersScreen();
}

function crusherTabs() {
  const c = S.screen.crusher;
  return tabbar([
    { code: "K01", label: "Отгрузки", icon: "box", active: c === "K01" || c === "K03" },
    { code: "K02", label: "Прайс", icon: "doc", active: c === "K02" },
    { code: "K04", label: "Долги", icon: "cash", active: c === "K04" },
    { code: "K05", label: "История", icon: "list", active: c === "K05" }
  ]);
}

function crusherSwitch() {
  return '<div class="switch-row"><label>Дробилка<select data-field="crusherPick">' +
    DATA.crushers.map(k => '<option value="' + k.id + '"' + (S.crusherId === k.id ? " selected" : "") + ">" + esc(k.name) + "</option>").join("") +
    "</select></label></div>";
}

function crusherOrdersScreen() {
  const list = crusherOrders(S.crusherId).filter(o => o.status !== "DELIVERED");
  return '<div class="screen">' + crusherSwitch() +
    '<p class="eyebrow">Кабинет дробилки</p><h1 class="tight">Заказы на отгрузку</h1>' +
    (list.length ? list.map(o => {
      const d = o.driverId ? driver(o.driverId) : null;
      const totalQty = o.items.reduce((a, i) => a + i.qty, 0);
      return '<button class="order-item" data-act="openOrder" data-id="' + o.id + '" data-target="K03">' +
        '<div class="row"><b>' + esc(o.no) + "</b>" + statusChip(o.status) + "</div>" +
        '<div class="mut">' + esc(d ? d.name + " · " + d.plate : "водитель не назначен") + "</div>" +
        '<div class="row"><span class="mut">' + esc(o.truckName) + " · " + qtyFmt(totalQty) + " " + qtyWord(totalQty) + '</span><b>' + money(o.materialSum) + "</b></div>" +
        "</button>";
    }).join("") : empty("Отгрузок нет", "Диспетчер направит заказ на эту дробилку.", "")) +
    "</div>";
}

function crusherOrder() {
  const o = currentCrusherOrder();
  if (!o) return empty("Заказ не выбран", "Вернитесь к списку.", '<button class="btn" data-act="screen" data-screen="K01">К отгрузкам</button>');
  const d = o.driverId ? driver(o.driverId) : null;
  let action = "";
  if (o.status === "ASSIGNED") action = '<div class="info">Водитель ещё не приехал на дробилку.</div>';
  else if (o.status === "AT_CRUSHER") action = '<button class="btn" data-act="crusherConfirm" data-id="' + o.id + '">Подтвердить отгрузку</button>';
  else action = '<div class="ok-box">' + ic("check") + " Отгрузка подтверждена</div>";
  return '<div class="screen">' +
    '<button class="back" data-act="screen" data-screen="K01">' + ic("arrow-left") + " Отгрузки</button>" +
    '<p class="eyebrow">' + esc(o.no) + "</p>" +
    '<div class="row"><h1 class="tight grow">Отгрузка</h1>' + statusChip(o.status) + "</div>" +
    '<div class="card"><div class="kv"><span>Водитель</span><b>' + (d ? esc(d.name) : "не назначен") + "</b></div>" +
      '<div class="kv"><span>Машина</span><b>' + esc(o.truckName) + "</b></div>" +
      '<div class="kv"><span>Госномер</span><b>' + (d ? esc(d.plate) : "—") + "</b></div>" +
      '<div class="kv"><span>Телефон</span><b>' + (d ? esc(d.phone) : "—") + "</b></div></div>" +
    '<div class="card"><h3>Состав</h3>' + orderItems(o) + '<div class="divider"></div>' +
      '<div class="kv total"><span>Сумма материала</span><b>' + money(o.materialSum) + "</b></div></div>" +
    (o.payment === "CASH" && o.debt > 0 ?
      '<div class="warn-box"><b>Долг водителя: ' + money(o.debt) + "</b><p>Записан на водителя перед этой дробилкой.</p></div>" :
      '<div class="info">Оплата картой: долга водителя перед дробилкой нет.</div>') +
    '<div class="spacer"></div>' + action + "</div>";
}

function crusherPrices() {
  return '<div class="screen">' + crusherSwitch() +
    '<h1 class="tight">Прайс</h1>' +
    '<div class="card flat"><h3>Цены за 1 чумич</h3>' +
      DATA.materials.map(m => '<div class="kv"><span>' + esc(m.name) + "</span><b>" + money(priceBase(m.id)) + "</b></div>").join("") +
    "</div>" +
    info('<b>Откуда цены</b><p>Прайс за 1 чумич задаёт владелец в панели диспетчера. Изменение цены не меняет уже рассчитанные и оформленные заказы.</p>') +
    "</div>";
}

function crusherDebts() {
  const list = crusherDebtOrders(S.crusherId);
  const total = totalDebt(list);
  return '<div class="screen">' + crusherSwitch() +
    '<h1 class="tight">Долги водителей</h1>' +
    '<div class="card flat"><div class="kv"><span>Всего</span><b class="big">' + money(total) + "</b></div></div>" +
    (list.length ? list.map(o => {
      const d = driver(o.driverId);
      return '<div class="card"><div class="row"><b>' + esc(o.no) + "</b>" + chip(d ? d.name : "водитель", "warn") + "</div>" +
        '<div class="kv"><span>Материал</span><b>' + money(o.debt) + "</b></div>" +
        '<button class="btn2" data-act="payDebt" data-id="' + o.id + '">Долг получен</button></div>';
    }).join("") : empty("Долгов нет", "Все водители рассчитались.", "")) +
    "</div>";
}

function crusherHistory() {
  const list = crusherOrders(S.crusherId).filter(o => o.status === "DELIVERED");
  return '<div class="screen">' + crusherSwitch() +
    '<h1 class="tight">История отгрузок</h1>' +
    (list.length ? list.map(o =>
      '<div class="order-item static"><div class="row"><b>' + esc(o.no) + "</b>" + statusChip(o.status) + "</div>" +
      '<div class="mut">' + dateShort(o.createdAt) + " · " + esc(o.truckName) + '</div><div class="row"><span class="mut">' + esc(o.address) + '</span><b>' + money(o.materialSum) + "</b></div></div>"
    ).join("") : empty("История пуста", "Доставленные заказы появятся здесь.", "")) +
    "</div>";
}

/* ============================ диспетчер ============================ */
const DESK_NAV = [
  ["A01", "Дашборд", "home"],
  ["A02", "Заказы", "list"],
  ["A03", "Назначение", "truck"],
  ["A04", "Клиенты", "users"],
  ["A05", "Прайс", "doc"],
  ["A06", "Доставка", "pin"],
  ["A07", "Оплаты и долги", "cash"],
  ["A08", "Водители", "truck"],
  ["A09", "Дробилки", "box"],
  ["A10", "Отчёты", "chart"]
];

function dispatcherScreen() {
  const code = S.screen.dispatcher;
  if (code === "A02") return deskOrders();
  if (code === "A03") return deskAssign();
  if (code === "A04") return deskClients();
  if (code === "A05") return deskPrices();
  if (code === "A06") return deskTariffs();
  if (code === "A07") return deskMoney();
  if (code === "A08") return deskDrivers();
  if (code === "A09") return deskCrushers();
  if (code === "A10") return deskReports();
  return deskDashboard();
}

function deskShell() {
  return '<div class="desk-wrap"><aside class="side-nav">' +
    '<div class="side-brand"><span class="brand-mark">Щ</span><div><b>ЩЕБЕНЬ GO</b><small>диспетчерская</small></div></div>' +
    DESK_NAV.map(n =>
      '<button class="nav-btn ' + (S.screen.dispatcher === n[0] ? "active" : "") + '" data-act="screen" data-screen="' + n[0] + '">' +
      ic(n[2]) + "<span>" + n[1] + "</span></button>"
    ).join("") +
    '<div class="side-foot"><button class="reset" data-act="reset">Сбросить демо</button></div>' +
    "</aside><main class=\"desk-body\">" + dispatcherScreen() + "</main></div>";
}

function kpi(label, value, sub) {
  return '<div class="kpi"><span>' + esc(label) + "</span><b>" + value + "</b><small>" + (sub || "") + "</small></div>";
}

function deskDashboard() {
  const s = stats();
  const active = activeOrders();
  return '<div class="desk-head"><div><p class="eyebrow">Диспетчерская</p><h1>Дашборд</h1></div>' +
    '<button class="btn small" data-act="screen" data-screen="A02">Все заказы</button></div>' +
    '<div class="kpi-grid">' +
      kpi("Заказов", s.count, "активных: " + s.active) +
      kpi("Сумма заказов", money(s.revenue), "материал " + money(s.material)) +
      kpi("Доставка", money(s.delivery), "тариф демо") +
      kpi("Долг водителей", money(s.debt), "перед дробилками") +
    "</div>" +
    '<div class="banner">Цены материалов задаются в разделе «Прайс», тариф доставки — в «Доставке». Уже рассчитанные заказы не меняются.</div>' +
    '<div class="panel"><div class="panel-head"><h2>Активные заказы</h2><span class="mut">' + active.length + "</span></div>" +
    (active.length ? ordersTable(active, true) : empty("Активных заказов нет", "Новый заказ клиента появится здесь.", "")) +
    "</div>" +
    '<div class="panel"><div class="panel-head"><h2>Клиентская база</h2><span class="mut">' + clientsBase().length + "</span></div>" +
    (clientsBase().length ? clientsTable(clientsBase()) : empty("Клиентов пока нет", "Клиент появится после первого заказа.", "")) +
    "</div>";
}

function ordersTable(list, compact) {
  return '<div class="table-wrap"><table class="table"><thead><tr>' +
    "<th>Заказ</th><th>Клиент</th><th>Адрес</th><th>Машина</th><th>Сумма</th><th>Оплата</th><th>Статус</th><th>Водитель</th><th>Дробилка</th><th></th></tr></thead><tbody>" +
    list.map(o => {
      const d = o.driverId ? driver(o.driverId) : null;
      const k = o.crusherId ? crusher(o.crusherId) : null;
      return "<tr>" +
        "<td><b>" + esc(o.no) + '</b><small class="block mut">' + dateShort(o.createdAt) + "</small></td>" +
        "<td>" + esc(o.client.name) + '<small class="block mut">' + esc(o.client.phone) + "</small></td>" +
        "<td>" + esc(o.zoneName) + '<small class="block mut">' + esc(o.address) + "</small></td>" +
        "<td>" + esc(o.truckName) + "</td>" +
        "<td><b>" + money(o.total) + '</b><small class="block mut">дост. ' + money(o.deliverySum) + "</small></td>" +
        "<td>" + DATA.payments[o.payment] + ' ' + payChip(o) + "</td>" +
        "<td>" + statusChip(o.status) + "</td>" +
        "<td>" + (d ? esc(d.name) : '<span class="mut">—</span>') + "</td>" +
        "<td>" + (k ? esc(k.name) : '<span class="mut">—</span>') + "</td>" +
        '<td><button class="btn tiny" data-act="assignOpen" data-id="' + o.id + '">' + (o.status === "NEW" ? "Назначить" : "Открыть") + "</button></td>" +
        "</tr>";
    }).join("") + "</tbody></table></div>";
}

function deskOrders() {
  return '<div class="desk-head"><div><p class="eyebrow">Все заказы</p><h1>Заказы</h1></div>' +
    '<span class="mut">' + S.orders.length + " шт.</span></div>" +
    '<div class="panel">' + (S.orders.length ? ordersTable(S.orders) : empty("Заказов нет", "Оформите заказ в кабинете клиента.", '<button class="btn" data-act="role" data-role="client">Открыть клиента</button>')) + "</div>";
}

function deskAssign() {
  const o = currentDispatcherOrder();
  if (!o) return '<div class="desk-head"><div><p class="eyebrow">Назначение</p><h1>Заказ</h1></div></div>' +
    '<div class="panel">' + empty("Заказ не выбран", "Выберите заказ в списке.", '<button class="btn" data-act="screen" data-screen="A02">К заказам</button>') + "</div>";
  const d = o.driverId ? driver(o.driverId) : null;
  const k = o.crusherId ? crusher(o.crusherId) : null;
  const drivers = matchingDrivers(o);
  const canAssign = o.status === "NEW";
  return '<div class="desk-head"><div><p class="eyebrow">' + esc(o.no) + '</p><h1>Назначение</h1></div>' +
    '<button class="btn2 small" data-act="screen" data-screen="A02">К заказам</button></div>' +
    '<div class="assign-grid"><div class="panel"><div class="panel-head"><h2>Заказ</h2>' + statusChip(o.status) + "</div>" +
      '<div class="kv"><span>Клиент</span><b>' + esc(o.client.name) + " · " + esc(o.client.phone) + "</b></div>" +
      '<div class="kv"><span>Адрес</span><b>' + esc(o.zoneName) + " · " + esc(o.address) + "</b></div>" +
      '<div class="kv"><span>Километраж</span><b>' + o.km + " км</b></div>" +
      '<div class="kv"><span>Машина</span><b>' + esc(o.truckName) + " · " + qtyFmt(o.capacity) + " " + qtyWord(o.capacity) + "</b></div>" +
      '<div class="kv"><span>Материал</span><b>' + money(o.materialSum) + "</b></div>" +
      '<div class="kv"><span>Доставка</span><b>' + money(o.deliverySum) + "</b></div>" +
      '<div class="kv total"><span>Итого</span><b>' + money(o.total) + "</b></div>" +
      lockStamp(o) +
      '<div class="panel-sub"><h3>Состав</h3>' + orderItems(o) + "</div></div>" +
    '<div class="panel"><div class="panel-head"><h2>Исполнители</h2></div>' +
      (canAssign ?
        '<label class="field"><span>Водитель · ' + esc(o.truckName) + '</span><select id="assignDriver">' +
          (drivers.length ? drivers.map(x => '<option value="' + x.id + '">' + esc(x.name) + " · " + esc(x.plate) + "</option>").join("") : '<option value="">Нет водителя на этой машине</option>') +
        "</select></label>" +
        '<label class="field"><span>Дробилка</span><select id="assignCrusher">' +
          DATA.crushers.map(x => '<option value="' + x.id + '">' + esc(x.name) + " · " + esc(x.address) + "</option>").join("") +
        "</select></label>" +
        '<button class="btn" data-act="assignSave" data-id="' + o.id + '" ' + (drivers.length ? "" : "disabled") + ">Назначить водителя и дробилку</button>" +
        '<div class="hint muted">Водитель показывается только с нужным типом машины.</div>'
      :
        '<div class="kv"><span>Водитель</span><b>' + (d ? esc(d.name) + " · " + esc(d.plate) : "—") + "</b></div>" +
        '<div class="kv"><span>Дробилка</span><b>' + (k ? esc(k.name) : "—") + "</b></div>" +
        '<div class="kv"><span>Статус</span><b>' + statusChip(o.status) + "</b></div>" +
        '<div class="kv"><span>Оплата</span><b>' + DATA.payments[o.payment] + " · " + (o.paid ? "оплачен" : "не оплачен") + "</b></div>" +
        '<div class="kv"><span>Долг водителя</span><b>' + money(o.debt) + "</b></div>" +
        (o.status !== "DELIVERED" ? '<div class="info">Дальше заказ ведут дробилка и водитель. Диспетчер видит статус в реальном времени.</div>' : "") +
        (!o.paid ? '<button class="btn2" data-act="markPaid" data-id="' + o.id + '">Отметить оплату</button>' : "") +
        (o.debt > 0 && !o.debtPaid ? '<button class="btn2" data-act="payDebt" data-id="' + o.id + '">Долг получен</button>' : "")
      ) +
    "</div></div>" +
    '<div class="panel"><div class="panel-head"><h2>История заказа</h2></div><ul class="history">' +
      o.history.slice().reverse().map(h => '<li><span>' + dateTime(h.at) + "</span><b>" + esc(h.text) + "</b></li>").join("") +
    "</ul></div>";
}

function clientsTable(list) {
  return '<div class="table-wrap"><table class="table"><thead><tr><th>Клиент</th><th>Телефон</th><th>Заказов</th><th>Сумма</th><th>Последний</th></tr></thead><tbody>' +
    list.map(c => "<tr><td><b>" + esc(c.name) + "</b></td><td>" + esc(c.phone) + "</td><td>" + c.orders + "</td><td><b>" + money(c.total) + "</b></td><td>" + dateShort(c.last) + "</td></tr>").join("") +
    "</tbody></table></div>";
}

function deskClients() {
  const list = clientsBase();
  return '<div class="desk-head"><div><p class="eyebrow">Клиентская база</p><h1>Клиенты</h1></div><span class="mut">' + list.length + " шт.</span></div>" +
    '<div class="panel">' + (list.length ? clientsTable(list) : empty("Клиентов пока нет", "Первый заказ создаст карточку клиента.", "")) + "</div>";
}

function deskPrices() {
  const history = (S.priceHistory || []).slice(0, 6);
  const ex = S.examples && S.examples.price;
  return '<div class="desk-head"><div><p class="eyebrow">Цены</p><h1>Прайс и наценка</h1></div></div>' +
    '<div class="banner">Прайс задаётся здесь и сразу действует на новые расчёты клиента. Уже рассчитанные суммы и оформленные заказы хранят цену на момент расчёта. Долг водителя перед дробилкой считается по цене дробилки, без наценки.</div>' +
    '<div class="panel"><div class="panel-head"><h2>Цены за 1 чумич</h2><span class="mut">сум</span></div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Материал</th><th>Цена дробилки</th><th>Наценка владельца</th><th>Цена клиента</th></tr></thead><tbody>' +
      DATA.materials.map(m => {
        const base = priceBase(m.id), mk = priceMarkup(m.id);
        return "<tr><td><b>" + esc(m.name) + '</b><small class="block mut">' + esc(m.note) + "</small></td>" +
          '<td><input class="price-in" id="price-' + m.id + '" type="number" min="0" step="10000" value="' + base + '"></td>' +
          '<td><input class="price-in" id="markup-' + m.id + '" type="number" min="0" step="10000" value="' + mk + '"></td>' +
          "<td><b>" + money(base + mk) + "</b></td></tr>";
      }).join("") +
      "</tbody></table></div>" +
      '<div class="spacer"></div>' +
      '<button class="btn" data-act="savePrices">Сохранить прайс</button>' +
    "</div>" +
    (ex ? '<div class="panel"><div class="panel-head"><h2>Пример расчёта</h2><span class="mut">Камаз · ' + qtyFmt(ex.km) + ' км</span></div>' +
      '<div class="kv"><span>Материал: 2 ЩПС + 1 щебень</span><b>' + money(ex.materialSum) + "</b></div>" +
      '<div class="kv"><span>Доставка</span><b>' + money(ex.deliverySum) + "</b></div>" +
      '<div class="kv total"><span>Итого клиенту</span><b>' + money(ex.total) + "</b></div>" +
      '<div class="hint muted">' + esc(ex.deliveryNote) + ". Материал по цене клиента.</div></div>" : "") +
    (history.length ?
      '<div class="panel"><div class="panel-head"><h2>История прайса</h2><span class="mut">последние ' + history.length + "</span></div><ul class=\"history\">" +
      history.map(h => '<li><span>' + dateTime(h.at) + "</span><b>" + esc(h.name) + ": " + money(h.oldPrice) + " → " + money(h.price) +
        (h.markup || h.oldMarkup ? " · наценка " + money(h.oldMarkup) + " → " + money(h.markup) : "") + "</b></li>").join("") +
      "</ul></div>" : "") +
    '<div class="panel"><div class="panel-head"><h2>Цены на доставку</h2></div><p class="mut">Минималка и плата за километр задаются в разделе «Доставка». Существующие заказы хранят зафиксированный тариф.</p></div>';
}

function deskTariffs() {
  const history = (S.tariffHistory || []).slice(0, 6);
  const names = {};
  DATA.trucks.forEach(t => { names[t.id] = t.name; });
  const ex = S.examples && S.examples.delivery ? S.examples.delivery : {};
  return '<div class="desk-head"><div><p class="eyebrow">Тариф доставки</p><h1>Минималка и километр</h1></div></div>' +
    '<div class="banner">Доставка = минималка за включённые километры + плата за каждый следующий километр. Сейчас стоят демонстрационные ставки. Новые расчёты считаются по новым ставкам, старые заказы не меняются.</div>' +
    '<div class="panel"><div class="tariff-grid">' +
    DATA.trucks.map(t => {
      const tr = S.tariffs[t.id] || { minSum: 0, includedKm: 0, perKm: 0 };
      return '<div class="tariff-card"><span class="truck-ic">' + ic("truck") + "</span><b>" + esc(t.name) + "</b>" +
        '<small class="mut">вместимость ' + qtyFmt(t.capacity) + " " + qtyWord(t.capacity) + "</small>" +
        '<label class="field"><span>Минималка, сум</span><input id="tmin-' + t.id + '" type="number" min="0" step="5000" value="' + tr.minSum + '"></label>' +
        '<label class="field"><span>Км включено в минималку</span><input id="tinc-' + t.id + '" type="number" min="0" step="1" value="' + tr.includedKm + '"></label>' +
        '<label class="field"><span>Сум за 1 км сверх</span><input id="tkm-' + t.id + '" type="number" min="0" step="500" value="' + tr.perKm + '"></label></div>';
    }).join("") +
    "</div><button class=\"btn\" data-act=\"saveTariffs\">Сохранить тариф</button></div>" +
    '<div class="panel"><div class="panel-head"><h2>Проверка тарифа</h2><span class="mut">только доставка</span></div>' +
      DATA.trucks.map(t => {
        const row = ex[t.id] || {};
        return '<div class="kv"><span>' + esc(t.name) + "</span><b>8 км — " + money(row["8"] || 0) +
          " · 16 км — " + money(row["16"] || 0) + " · 28 км — " + money(row["28"] || 0) + "</b></div>";
      }).join("") +
      '<div class="hint muted">Суммы считает сервер по текущим ставкам.</div>' +
    "</div>" +
    (history.length ?
      '<div class="panel"><div class="panel-head"><h2>История тарифа</h2><span class="mut">последние ' + history.length + "</span></div><ul class=\"history\">" +
      history.map(h => '<li><span>' + dateTime(h.at) + "</span><b>" + esc(names[h.truckId] || h.truckId) + ": " +
        money(h.old.minSum) + " / " + qtyFmt(h.old.includedKm) + " км / " + money(h.old.perKm) + " → " +
        money(h.new.minSum) + " / " + qtyFmt(h.new.includedKm) + " км / " + money(h.new.perKm) + "</b></li>").join("") +
      "</ul></div>" : "");
}

function deskMoney() {
  const unpaid = S.orders.filter(o => !o.paid);
  const debts = S.orders.filter(o => o.debt > 0 && !o.debtPaid);
  return '<div class="desk-head"><div><p class="eyebrow">Деньги</p><h1>Оплаты и долги</h1></div></div>' +
    '<div class="kpi-grid">' +
      kpi("Не оплачено клиентами", money(unpaid.reduce((a, o) => a + o.total, 0)), unpaid.length + " " + plural(unpaid.length, "заказ", "заказа", "заказов")) +
      kpi("Долг водителей", money(totalDebt(debts)), debts.length + " " + plural(debts.length, "заказ", "заказа", "заказов")) +
    "</div>" +
    '<div class="panel"><div class="panel-head"><h2>Неоплаченные заказы</h2><span class="mut">' + unpaid.length + "</span></div>" +
    (unpaid.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Заказ</th><th>Клиент</th><th>Сумма</th><th>Способ</th><th>Статус</th><th></th></tr></thead><tbody>' +
      unpaid.map(o => "<tr><td><b>" + esc(o.no) + "</b></td><td>" + esc(o.client.name) + "</td><td><b>" + money(o.total) + "</b></td><td>" + DATA.payments[o.payment] + "</td><td>" + statusChip(o.status) + '</td><td><button class="btn tiny" data-act="markPaid" data-id="' + o.id + '">Оплачен</button></td></tr>').join("") +
      "</tbody></table></div>" : empty("Неоплаченных нет", "Все заказы оплачены.", "")) + "</div>" +
    '<div class="panel"><div class="panel-head"><h2>Долги водителей перед дробилками</h2><span class="mut">' + debts.length + "</span></div>" +
    (debts.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Заказ</th><th>Водитель</th><th>Дробилка</th><th>Материал</th><th>Дата</th><th></th></tr></thead><tbody>' +
      debts.map(o => "<tr><td><b>" + esc(o.no) + "</b></td><td>" + esc(driver(o.driverId).name) + "</td><td>" + esc(crusher(o.crusherId).name) + "</td><td><b>" + money(o.debt) + "</b></td><td>" + dateShort(o.createdAt) + '</td><td><button class="btn tiny" data-act="payDebt" data-id="' + o.id + '">Долг получен</button></td></tr>').join("") +
      "</tbody></table></div>" : empty("Долгов нет", "Все водители рассчитались.", "")) + "</div>";
}

function deskDrivers() {
  return '<div class="desk-head"><div><p class="eyebrow">Парк</p><h1>Водители и машины</h1></div><span class="mut">' + DATA.drivers.length + " шт.</span></div>" +
    '<div class="cards">' + DATA.drivers.map(d => {
      const t = truck(d.truckId);
      const orders = driverOrders(d.id);
      const debt = totalDebt(driverDebtOrders(d.id));
      return '<div class="panel driver-panel"><div class="row"><span class="truck-big">' + ic("truck") + "</span><div class=\"grow\"><b>" + esc(d.name) + "</b><small class=\"block mut\">" + esc(t.name) + " · " + esc(d.plate) + "</small></div>" + chip(qtyFmt(t.capacity) + " " + qtyWord(t.capacity), "info") + "</div>" +
        '<div class="kv"><span>Телефон</span><b>' + esc(d.phone) + "</b></div>" +
        '<div class="kv"><span>Заказов</span><b>' + orders.length + "</b></div>" +
        '<div class="kv"><span>Долг</span><b>' + money(debt) + "</b></div></div>";
    }).join("") + "</div>";
}

function deskCrushers() {
  return '<div class="desk-head"><div><p class="eyebrow">Поставщики</p><h1>Дробилки</h1></div><span class="mut">' + DATA.crushers.length + " шт.</span></div>" +
    '<div class="cards">' + DATA.crushers.map(k => {
      const list = crusherOrders(k.id);
      const debt = totalDebt(crusherDebtOrders(k.id));
      return '<div class="panel driver-panel"><div class="row"><span class="truck-big">' + ic("box") + '</span><div class="grow"><b>' + esc(k.name) + '</b><small class="block mut">' + esc(k.address) + "</small></div>" + chip(list.length + " " + plural(list.length, "заказ", "заказа", "заказов"), "info") + "</div>" +
        '<div class="kv"><span>Отгружено</span><b>' + list.filter(o => o.status !== "NEW" && o.status !== "ASSIGNED").length + "</b></div>" +
        '<div class="kv"><span>Долг водителей</span><b>' + money(debt) + "</b></div></div>";
    }).join("") + "</div>";
}

function deskReports() {
  const s = stats();
  const byMat = (S.report && S.report.byMaterial) || {};
  const byTruck = (S.report && S.report.byTruck) || {};
  const byStatus = (S.report && S.report.byStatus) || {};
  return '<div class="desk-head"><div><p class="eyebrow">Итоги</p><h1>Отчёты</h1></div><span class="mut">все заказы</span></div>' +
    '<div class="kpi-grid">' + kpi("Заказов", s.count, "доставлено: " + s.delivered) + kpi("Сумма", money(s.revenue), "материал + доставка") + kpi("Материал", money(s.material), "") + kpi("Доставка", money(s.delivery), "") + "</div>" +
    '<div class="assign-grid"><div class="panel"><div class="panel-head"><h2>По материалам</h2></div>' +
      (Object.keys(byMat).length ? Object.keys(byMat).map(n => '<div class="kv"><span>' + esc(n) + "</span><b>" + qtyFmt(byMat[n]) + " " + qtyWord(byMat[n]) + "</b></div>").join("") : '<p class="mut">Пока нет данных.</p>') +
    '</div><div class="panel"><div class="panel-head"><h2>По машинам</h2></div>' +
      (Object.keys(byTruck).length ? Object.keys(byTruck).map(n => '<div class="kv"><span>' + esc(n) + "</span><b>" + byTruck[n] + " " + plural(byTruck[n], "заказ", "заказа", "заказов") + "</b></div>").join("") : '<p class="mut">Пока нет данных.</p>') +
    "</div></div>" +
    '<div class="panel"><div class="panel-head"><h2>По статусам</h2></div>' +
      (Object.keys(byStatus).length ? Object.keys(byStatus).map(st => '<div class="kv"><span>' + statusChip(st) + "</span><b>" + byStatus[st] + "</b></div>").join("") : '<p class="mut">Пока нет данных.</p>') +
    "</div>" +
    '<div class="panel"><div class="panel-head"><h2>Деньги</h2></div>' +
      '<div class="kv"><span>Оплачено</span><b>' + money(s.revenue - s.unpaid) + "</b></div>" +
      '<div class="kv"><span>Не оплачено</span><b>' + money(s.unpaid) + "</b></div>" +
      '<div class="kv"><span>Долг водителей перед дробилками</span><b>' + money(s.debt) + "</b></div>" +
      '<div class="kv"><span>Заказов: наличные / карта</span><b>' + s.cash + " / " + s.card + "</b></div></div>" +
    '<div class="panel"><div class="panel-head"><h2>Как считается выручка</h2></div><p class="mut">Сумма заказа = материал по цене клиента + доставка. Наценка задаётся в разделе «Прайс», тариф — в «Доставке». Долг водителя перед дробилкой считается по цене дробилки, без наценки. Все суммы считает сервер.</p></div>';
}

/* ============================ render ============================ */
function render() {
  if (S.role === "dispatcher") {
    root.innerHTML = topbar() + deskShell();
    return;
  }
  if (S.role === "driver") {
    root.innerHTML = topbar() + phoneShell(driverScreen(), driverTabs());
    return;
  }
  if (S.role === "crusher") {
    root.innerHTML = topbar() + phoneShell(crusherScreen(), crusherTabs());
    return;
  }
  root.innerHTML = topbar() + phoneShell(clientScreen(), clientTabs());
}

/* ============================ загрузка ============================ */
function bootScreen() {
  root.innerHTML = '<div class="boot"><div class="boot-card">' +
    '<span class="boot-mark">Щ</span><b>ЩЕБЕНЬ GO</b>' +
    '<p class="muted">Подключаемся к локальной базе…</p>' +
    '<span class="boot-bar"><i></i></span></div></div>';
}

function offlineScreen(message) {
  root.innerHTML = '<div class="boot"><div class="boot-card">' +
    '<span class="boot-mark bad">!</span><b>Сервер не отвечает</b>' +
    '<p class="muted">' + esc(message || "Не удалось загрузить данные") + "</p>" +
    '<div class="boot-help"><b>Как запустить</b><p>Откройте папку проекта и запустите <code>scripts\\run.bat</code>. ' +
    'Сервер поднимется на <code>http://127.0.0.1:8110</code>, база — <code>data\\shcheben_go.db</code>.</p></div>' +
    '<button class="btn" data-act="retryBoot">Повторить</button></div></div>';
}

async function start() {
  bootScreen();
  try {
    await boot();
    S.draft.preview = null;
    S.draft.previewError = "";
    saveUi();
    render();
    const c = S.screen.client;
    if ((c === "C03" || (c === "C04" && !S.draft.quote)) && draftCanStep1() && draftCanStep2()) {
      refreshPreview(false);
    }
  } catch (err) {
    offlineScreen(err && err.message ? err.message : "Не удалось загрузить данные");
  }
}

async function refreshPreview(showSpinner) {
  if (!draftCanStep1() || !draftCanStep2()) {
    S.draft.preview = null;
    S.draft.previewError = "";
    saveUi();
    render();
    return;
  }
  S.draft.preview = null;
  S.draft.previewError = "";
  if (showSpinner) render();
  try {
    await calculateDraft();
  } catch (err) {
    S.draft.preview = null;
    S.draft.previewError = err && err.message ? err.message : "Не удалось посчитать сумму";
  }
  render();
}

async function syncQuiet() {
  try { await refresh(); render(); } catch (e) {}
}

/* ============================ события ============================ */
let busy = false;

async function handleAction(act, el) {
  if (act === "retryBoot") { await start(); return; }
  if (act === "role") {
    setRole(el.dataset.role);
    render();
    syncQuiet();
    return;
  }
  if (act === "screen") { setScreen(S.role, el.dataset.screen); render(); return; }

  if (act === "startOrder") {
    resetDraft();
    S.draft.qty[el.dataset.mat] = 1;
    S.draft.step = 1;
    S.screen.client = "C02";
    saveUi(); render(); return;
  }
  if (act === "setTruck") {
    if (S.draft.quote) return;
    S.draft.truckId = el.dataset.truck;
    S.draft.preview = null;
    S.draft.previewError = "";
    saveUi(); render(); return;
  }
  if (act === "nextStep1") {
    if (!draftCanStep1()) return;
    S.draft.step = 2;
    S.screen.client = "C03";
    saveUi(); render();
    await refreshPreview(false);
    return;
  }
  if (act === "backStep1") {
    if (S.draft.quote) unlockDraft();
    S.draft.step = 1;
    S.screen.client = "C02";
    saveUi(); render(); return;
  }
  if (act === "nextStep2") {
    if (!draftCanStep2()) return;
    S.draft.step = 3;
    S.screen.client = "C04";
    saveUi(); render();
    await refreshPreview(false);
    return;
  }
  if (act === "backStep2") {
    if (S.draft.quote) return;
    S.draft.step = 2;
    S.screen.client = "C03";
    saveUi(); render();
    await refreshPreview(false);
    return;
  }
  if (act === "incMat") {
    if (S.draft.quote) return;
    const id = el.dataset.mat;
    const delta = Number(el.dataset.delta);
    const t = draftTruck();
    const next = Math.max(0, (Number(S.draft.qty[id]) || 0) + delta);
    const other = draftQtySum() - (Number(S.draft.qty[id]) || 0);
    if (t && other + next > t.capacity + 0.0001) { toast("Не помещается в " + t.name); return; }
    S.draft.qty[id] = next;
    S.draft.preview = null;
    S.draft.previewError = "";
    saveUi(); render();
    await refreshPreview(false);
    return;
  }
  if (act === "calcPreview") {
    await refreshPreview(true);
    return;
  }
  if (act === "calc") {
    await lockDraft();
    toast("Сумма рассчитана и зафиксирована");
    render(); return;
  }
  if (act === "unlock") {
    unlockDraft();
    S.screen.client = "C02";
    toast("Расчёт сброшен. Измените параметры и рассчитайте заново.");
    render(); return;
  }
  if (act === "pay") {
    if (!S.draft.quote) return;
    S.draft.payment = el.dataset.pay;
    saveUi(); render(); return;
  }
  if (act === "place") {
    const o = await placeOrder();
    toast("Заказ " + o.no + " оформлен");
    render(); return;
  }
  if (act === "openOrder") {
    selectOrder(S.role, el.dataset.id);
    setScreen(S.role, el.dataset.target);
    render(); return;
  }
  if (act === "repeat") {
    const o = orderById(el.dataset.id);
    if (!o) return;
    resetDraft();
    S.draft.zoneId = o.zoneId;
    S.draft.address = o.address;
    S.draft.landmark = o.landmark;
    S.draft.truckId = o.truckId;
    o.items.forEach(i => { S.draft.qty[i.id] = i.qty; });
    S.draft.step = 3;
    S.screen.client = "C04";
    saveUi(); render();
    await refreshPreview(true);
    return;
  }
  if (act === "assignOpen") {
    selectOrder("dispatcher", el.dataset.id);
    setScreen("dispatcher", "A03");
    render(); return;
  }
  if (act === "assignSave") {
    const dv = document.getElementById("assignDriver");
    const cr = document.getElementById("assignCrusher");
    if (!dv || !cr || !dv.value) { toast("Нет доступного водителя"); return; }
    await assignOrder(el.dataset.id, dv.value, cr.value);
    setScreen("dispatcher", "A03");
    toast("Водитель и дробилка назначены");
    render(); return;
  }
  if (act === "driverStage") {
    await driverAction(el.dataset.id, el.dataset.stage);
    toast(el.dataset.stage === "delivered" ? "Заказ доставлен" : "Статус обновлён");
    render(); return;
  }
  if (act === "crusherConfirm") {
    await crusherConfirm(el.dataset.id);
    toast("Отгрузка подтверждена");
    render(); return;
  }
  if (act === "markPaid") {
    await markPaid(el.dataset.id);
    toast("Оплата отмечена");
    render(); return;
  }
  if (act === "payDebt") {
    await payDebt(el.dataset.id);
    toast("Долг погашен");
    render(); return;
  }
  if (act === "saveProfile") {
    const n = document.getElementById("profileName");
    const p = document.getElementById("profilePhone");
    updateProfile(n ? n.value : "", p ? p.value : "");
    toast("Профиль сохранён");
    render(); return;
  }
  if (act === "savePrices") {
    const items = DATA.materials.map(m => {
      const p = document.getElementById("price-" + m.id);
      const mk = document.getElementById("markup-" + m.id);
      return {
        id: m.id,
        base: p ? Number(p.value) : priceBase(m.id),
        markup: mk ? Number(mk.value) : priceMarkup(m.id)
      };
    });
    const changed = await setPrices(items);
    toast(changed ? "Прайс сохранён: позиций " + changed + ". Старые заказы не изменились." : "Цены не изменились");
    render(); return;
  }
  if (act === "saveTariffs") {
    const items = DATA.trucks.map(t => {
      const min = document.getElementById("tmin-" + t.id);
      const inc = document.getElementById("tinc-" + t.id);
      const km = document.getElementById("tkm-" + t.id);
      const old = S.tariffs[t.id] || { minSum: 0, includedKm: 0, perKm: 0 };
      return {
        id: t.id,
        minSum: min ? Number(min.value) : old.minSum,
        includedKm: inc ? Number(inc.value) : old.includedKm,
        perKm: km ? Number(km.value) : old.perKm
      };
    });
    const changed = await setTariffs(items);
    toast(changed ? "Тариф сохранён: машин " + changed + ". Старые заказы не изменились." : "Тариф не изменился");
    render(); return;
  }
  if (act === "reset") {
    if (!confirm("Сбросить все демо-заказы, цены и тарифы?")) return;
    await resetDemo();
    toast("Демо сброшено");
    render(); return;
  }
}

root.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  if (busy) return;
  busy = true;
  handleAction(el.dataset.act, el)
    .catch(err => toast(err && err.message ? err.message : "Ошибка операции"))
    .finally(() => { busy = false; });
});

root.addEventListener("input", e => {
  const f = e.target.dataset.field;
  if (f === "address") { S.draft.address = e.target.value; saveUi(); }
  else if (f === "landmark") { S.draft.landmark = e.target.value; saveUi(); }
});

root.addEventListener("change", e => {
  const f = e.target.dataset.field;
  if (f === "zone") {
    if (S.draft.quote) return;
    S.draft.zoneId = e.target.value;
    S.draft.preview = null;
    S.draft.previewError = "";
    saveUi(); render();
  } else if (f === "driverPick") {
    setDriver(e.target.value); render();
  } else if (f === "crusherPick") {
    setCrusher(e.target.value); render();
  }
});

start();
