"use strict";

/* Стартовые справочники для справки. При запуске заменяются данными
   из /api/bootstrap. Цены и тарифы живут в SQLite и меняются в панели
   диспетчера (A05, A06). */
const DATA = {
  materials: [
    { id: "zasypka", name: "Засыпка", note: "Планировка, подушка" },
    { id: "pesok",   name: "Песок мытый", note: "Мытый песок" },
    { id: "shps",    name: "ЩПС", note: "Щебёночно-песчаная смесь" },
    { id: "scheben", name: "Щебень", note: "Фракция по запросу" }
  ],
  trucks: [
    { id: "kamaz", name: "Камаз", capacity: 3 },
    { id: "zil",   name: "ЗИЛ", capacity: 2 },
    { id: "howo",  name: "Хова", capacity: 6 }
  ],
  zones: [
    { id: "z1", name: "Центр", km: 8 },
    { id: "z2", name: "Куйлюк", km: 12 },
    { id: "z3", name: "Сергели", km: 16 },
    { id: "z4", name: "Янгиюль", km: 28 },
    { id: "z5", name: "Чирчик", km: 42 },
    { id: "z6", name: "Пскент", km: 55 }
  ],
  drivers: [
    { id: "d1", name: "Алишер", phone: "+998 90 111 22 33", truckId: "kamaz", plate: "01 A 123 BC" },
    { id: "d2", name: "Бахтиёр", phone: "+998 90 222 33 44", truckId: "zil", plate: "01 B 456 CD" },
    { id: "d3", name: "Шухрат", phone: "+998 90 333 44 55", truckId: "howo", plate: "01 C 789 EF" }
  ],
  crushers: [
    { id: "k1", name: "Дробилка №1", address: "Промзона, выезд на Сергели" },
    { id: "k2", name: "Дробилка №2", address: "Трасса на Чирчик, 18 км" }
  ],
  tariffs: {},
  statuses: {
    NEW:       { name: "Оформлен",       tone: "info" },
    ASSIGNED:  { name: "Назначен",       tone: "info" },
    AT_CRUSHER:{ name: "На дробилке",    tone: "warn" },
    LOADED:    { name: "Загружен",       tone: "warn" },
    EN_ROUTE:  { name: "В пути",         tone: "warn" },
    DELIVERED: { name: "Доставлен",      tone: "ok" }
  },
  statusOrder: ["NEW", "ASSIGNED", "AT_CRUSHER", "LOADED", "EN_ROUTE", "DELIVERED"],
  payments: {
    CASH: "Наличные водителю",
    CARD: "Карта в приложении"
  }
};

function truck(id) { return DATA.trucks.find(t => t.id === id); }
function zone(id) { return DATA.zones.find(z => z.id === id); }
function driver(id) { return DATA.drivers.find(d => d.id === id); }
function crusher(id) { return DATA.crushers.find(k => k.id === id); }

function money(n) {
  return (Math.round(Number(n) || 0)).toLocaleString("ru-RU").replace(/\u00a0/g, " ") + " сум";
}
function qtyFmt(n) {
  return (Math.round(Number(n) * 10) / 10).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}
function dateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function dateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
