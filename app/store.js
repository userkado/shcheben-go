"use strict";

/* Слой состояния и API. Все деньги, лимиты и остатки считает сервер.
   В localStorage лежит только состояние интерфейса: роль, экран, черновик, профиль. */

const UI_KEY = "shcheben_go_ui_v1";

function emptyQty() {
  return { zasypka: 0, pesok: 0, shps: 0, scheben: 0 };
}

function freshDraft() {
  return {
    step: 1,
    zoneId: "",
    address: "",
    landmark: "",
    truckId: "",
    qty: emptyQty(),
    payment: "CASH",
    preview: null,
    previewError: "",
    quote: null
  };
}

function defaultUi() {
  return {
    role: "client",
    screen: { client: "C01", driver: "D01", crusher: "K01", dispatcher: "A01" },
    selected: { client: null, driver: null, crusher: null, dispatcher: null },
    client: { name: "Адис", phone: "+998 90 000 00 00" },
    driverId: "d1",
    crusherId: "k1",
    draft: freshDraft()
  };
}

function loadUi() {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

const UI = loadUi();

let S = Object.assign(defaultUi(), UI, {
  draft: Object.assign(freshDraft(), UI.draft || {}),
  screen: Object.assign(defaultUi().screen, UI.screen || {}),
  selected: Object.assign(defaultUi().selected, UI.selected || {}),
  orders: [],
  prices: {},
  tariffs: {},
  stats: {},
  clients: [],
  report: { byMaterial: {}, byTruck: {}, byStatus: {} },
  examples: { price: null, delivery: {} },
  priceHistory: [],
  tariffHistory: [],
  serverTime: null,
  online: false
});

function saveUi() {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({
      role: S.role,
      screen: S.screen,
      selected: S.selected,
      client: S.client,
      driverId: S.driverId,
      crusherId: S.crusherId,
      draft: S.draft
    }));
  } catch (e) {}
}

/* ---------------------------------------------------------------- API */

async function api(path, options) {
  const opts = { method: (options && options.method) || "GET", headers: {} };
  if (options && options.body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(options.body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new Error("Нет связи с сервером. Запустите scripts\\run.bat.");
  }
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const detail = data && data.detail;
    let message = "Ошибка сервера (" + res.status + ")";
    if (typeof detail === "string") message = detail;
    else if (Array.isArray(detail) && detail.length) {
      message = "Проверьте поля: " + detail.map(d => d.msg || "некорректное значение").join("; ");
    }
    throw new Error(message);
  }
  return data;
}

function applyBootstrap(data) {
  DATA.materials = data.materials || [];
  DATA.trucks = data.trucks || [];
  DATA.zones = data.zones || [];
  DATA.drivers = data.drivers || [];
  DATA.crushers = data.crushers || [];

  S.prices = data.prices || {};
  S.tariffs = data.tariffs || {};
  S.orders = data.orders || [];
  S.stats = data.stats || {};
  S.clients = data.clients || [];
  S.report = data.report || { byMaterial: {}, byTruck: {}, byStatus: {} };
  S.examples = data.examples || { price: null, delivery: {} };
  S.priceHistory = data.priceHistory || [];
  S.tariffHistory = data.tariffHistory || [];
  S.serverTime = data.serverTime || null;
  S.online = true;

  ["client", "driver", "crusher", "dispatcher"].forEach(role => {
    if (S.selected[role] && !S.orders.some(o => o.id === S.selected[role])) {
      S.selected[role] = null;
    }
  });
  if (!driver(S.driverId)) S.driverId = DATA.drivers.length ? DATA.drivers[0].id : null;
  if (!crusher(S.crusherId)) S.crusherId = DATA.crushers.length ? DATA.crushers[0].id : null;
  if (S.draft.zoneId && !zone(S.draft.zoneId)) S.draft.zoneId = "";
  if (S.draft.truckId && !truck(S.draft.truckId)) S.draft.truckId = "";
}

async function boot() {
  applyBootstrap(await api("/api/bootstrap"));
}

async function refresh() {
  applyBootstrap(await api("/api/bootstrap"));
  saveUi();
}

/* ---------------------------------------------------------------- прайс */

function priceBase(id) {
  return S.prices[id] ? S.prices[id].base : 0;
}
function priceMarkup(id) {
  return S.prices[id] ? S.prices[id].markup : 0;
}
function priceClient(id) {
  return S.prices[id] ? S.prices[id].client : 0;
}

/* ---------------------------------------------------------------- черновик */

function draftZone() { return zone(S.draft.zoneId) || null; }
function draftTruck() { return truck(S.draft.truckId) || null; }
function draftQtySum() {
  return DATA.materials.reduce((a, m) => a + (Number(S.draft.qty[m.id]) || 0), 0);
}
function draftCanStep1() {
  return !!(S.draft.zoneId && S.draft.address.trim() && S.draft.truckId);
}
function draftCanStep2() {
  const t = draftTruck();
  const sum = draftQtySum();
  return !!(t && sum > 0 && sum <= t.capacity + 0.0001);
}
function draftQtyPayload() {
  const out = {};
  DATA.materials.forEach(m => {
    const q = Number(S.draft.qty[m.id]) || 0;
    if (q > 0) out[m.id] = q;
  });
  return out;
}
function resetDraft() {
  S.draft = freshDraft();
  saveUi();
}
function unlockDraft() {
  S.draft.quote = null;
  S.draft.preview = null;
  S.draft.previewError = "";
  S.draft.step = 1;
  saveUi();
}

async function calculateDraft() {
  if (!draftCanStep1()) throw new Error("Заполните район, адрес и машину");
  if (!draftCanStep2()) throw new Error("Выберите материал в пределах вместимости машины");
  const data = await api("/api/calc", {
    method: "POST",
    body: {
      zoneId: S.draft.zoneId,
      truckId: S.draft.truckId,
      qty: draftQtyPayload(),
      address: S.draft.address,
      landmark: S.draft.landmark
    }
  });
  S.draft.preview = data;
  S.draft.previewError = "";
  saveUi();
  return data;
}

async function lockDraft() {
  const data = await api("/api/quotes", {
    method: "POST",
    body: {
      zoneId: S.draft.zoneId,
      truckId: S.draft.truckId,
      qty: draftQtyPayload(),
      address: S.draft.address,
      landmark: S.draft.landmark
    }
  });
  S.draft.quote = data;
  S.draft.preview = null;
  S.draft.previewError = "";
  S.draft.step = 3;
  saveUi();
  return data;
}

async function placeOrder() {
  const q = S.draft.quote;
  if (!q) throw new Error("Сначала рассчитайте и зафиксируйте сумму");
  const order = await api("/api/orders", {
    method: "POST",
    body: {
      quoteId: q.id,
      clientName: S.client.name,
      clientPhone: S.client.phone,
      payment: S.draft.payment
    }
  });
  await refresh();
  S.selected.client = order.id;
  S.screen.client = "C05";
  resetDraft();
  saveUi();
  return order;
}

/* ---------------------------------------------------------------- заказы */

function orderById(id) { return S.orders.find(o => o.id === id) || null; }
function currentClientOrder() {
  return orderById(S.selected.client) || S.orders[0] || null;
}
function currentDriverOrder() {
  return orderById(S.selected.driver) || driverOrders(S.driverId)[0] || null;
}
function currentCrusherOrder() {
  return orderById(S.selected.crusher) || crusherOrders(S.crusherId)[0] || null;
}
function currentDispatcherOrder() {
  return orderById(S.selected.dispatcher) || S.orders[0] || null;
}

function driverOrders(driverId) {
  return S.orders.filter(o => o.driverId === driverId);
}
function crusherOrders(crusherId) {
  return S.orders.filter(o => o.crusherId === crusherId);
}
function activeOrders() {
  return S.orders.filter(o => o.status !== "DELIVERED");
}
function matchingDrivers(order) {
  return DATA.drivers.filter(d => d.truckId === order.truckId);
}
function driverDebtOrders(driverId) {
  return S.orders.filter(o =>
    o.driverId === driverId && o.payment === "CASH" && o.debt > 0 && !o.debtPaid
  );
}
function crusherDebtOrders(crusherId) {
  return S.orders.filter(o =>
    o.crusherId === crusherId && o.payment === "CASH" && o.debt > 0 && !o.debtPaid
  );
}
function totalDebt(orders) {
  return orders.reduce((a, o) => a + o.debt, 0);
}

/* ---------------------------------------------------------------- действия */

function setRole(role) { S.role = role; saveUi(); }
function setScreen(role, screen) { S.screen[role] = screen; saveUi(); }
function selectOrder(role, id) { S.selected[role] = id; saveUi(); }
function updateProfile(name, phone) {
  S.client.name = (name || "").trim() || S.client.name;
  S.client.phone = (phone || "").trim();
  saveUi();
}
function setDriver(id) { if (driver(id)) { S.driverId = id; S.selected.driver = null; saveUi(); } }
function setCrusher(id) { if (crusher(id)) { S.crusherId = id; S.selected.crusher = null; saveUi(); } }

async function assignOrder(orderId, driverId, crusherId) {
  await api("/api/orders/" + encodeURIComponent(orderId) + "/assign", {
    method: "POST",
    body: { driverId, crusherId }
  });
  await refresh();
}

async function driverAction(orderId, action) {
  await api("/api/orders/" + encodeURIComponent(orderId) + "/driver", {
    method: "POST",
    body: { action, driverId: S.driverId }
  });
  await refresh();
}

async function crusherConfirm(orderId) {
  await api("/api/orders/" + encodeURIComponent(orderId) + "/crusher-confirm", {
    method: "POST",
    body: { crusherId: S.crusherId }
  });
  await refresh();
}

async function markPaid(orderId) {
  await api("/api/orders/" + encodeURIComponent(orderId) + "/paid", { method: "POST" });
  await refresh();
}

async function payDebt(orderId) {
  await api("/api/orders/" + encodeURIComponent(orderId) + "/debt-paid", { method: "POST" });
  await refresh();
}

async function setPrices(items) {
  const result = await api("/api/admin/prices", {
    method: "PUT",
    body: { items: items.map(i => ({ id: i.id, base: i.base, markup: i.markup })) }
  });
  await refresh();
  return result.changed;
}

async function setTariffs(items) {
  const result = await api("/api/admin/tariffs", {
    method: "PUT",
    body: {
      items: items.map(i => ({
        id: i.id,
        minSum: i.minSum,
        includedKm: i.includedKm,
        perKm: i.perKm
      }))
    }
  });
  await refresh();
  return result.changed;
}

async function resetDemo() {
  await api("/api/admin/reset-demo", { method: "POST" });
  await refresh();
  resetDraft();
  S.selected = defaultUi().selected;
  S.screen = defaultUi().screen;
  saveUi();
}

/* ---------------------------------------------------------------- сводки */

function stats() {
  return Object.assign({
    count: 0, active: 0, delivered: 0, revenue: 0, material: 0,
    delivery: 0, unpaid: 0, debt: 0, cash: 0, card: 0
  }, S.stats || {});
}

function clientsBase() {
  return S.clients || [];
}
