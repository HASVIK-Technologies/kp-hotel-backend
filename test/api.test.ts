import { addDays, format } from "date-fns";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "./helpers/test-app";

/** HTTP-level tests: routing, validation, auth, permissions and the admin "add room" feature. */
let t: Awaited<ReturnType<typeof bootTestApp>>;
let http: ReturnType<typeof request>;
const d = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd");
const API = "/api/v1";

const ownerCookie: string[] = [];
const frontdeskCookie: string[] = [];

async function login(email: string, password: string) {
  const res = await http.post(`${API}/auth/login`).send({ email, password });
  expect(res.status).toBe(200);
  return res.headers["set-cookie"] as unknown as string[];
}

const newRoom = {
  name: "Heritage Suite",
  type: "Suite",
  view: "Garden",
  headline: "A new suite added from the admin panel",
  blurb: "Added through the admin console to prove the flow.",
  description: "A brand new suite with a private terrace, created via the admin API so the website can sell it immediately.",
  price: 5200,
  maxGuests: 3,
  beds: "King bed",
  size: 52,
  amenityFlags: ["WiFi", "Balcony"],
  amenities: ["Air conditioning", "Private terrace"],
  images: ["heritage-suite-1.jpg"],
  inventory: 2,
  active: true,
};

beforeAll(async () => {
  t = await bootTestApp();
  http = request(t.app.getHttpServer());
  const { SeedService } = await import("@/modules/seed/seed.service");
  const { UsersService } = await import("@/modules/users/users.service");
  await t.get(SeedService).ensureOwner("owner@test.com", "OwnerPass@2026", "Owner Person");
  await t.get(UsersService).create({ email: "desk@test.com", name: "Desk Person", role: "frontdesk", password: "DeskPass@2026" });
  ownerCookie.push(...(await login("owner@test.com", "OwnerPass@2026")));
  frontdeskCookie.push(...(await login("desk@test.com", "DeskPass@2026")));
});
afterAll(() => t?.close());

describe("public catalogue", () => {
  it("lists the starter rooms with live availability", async () => {
    const res = await http.get(`${API}/rooms`);
    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(5);
    expect(res.body.rooms[0]).toMatchObject({ slug: "deluxe-room", price: 2200, active: true });
    expect(typeof res.body.rooms[0].roomsLeft).toBe("number");
  });

  it("serves rate plans, add-ons and promos", async () => {
    const res = await http.get(`${API}/catalog`);
    expect(res.body.ratePlans.map((p: any) => p.id)).toEqual(["room-only", "breakfast"]);
    expect(res.body.promos.WEEKEND20.percent).toBe(20);
  });

  it("returns an authoritative quote", async () => {
    const res = await http.post(`${API}/quotes`).send({ roomSlug: "premium-room", checkIn: d(30), checkOut: d(32), rooms: 1, ratePlan: "room-only", addonIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.quote.total).toBe(5880);
    expect(res.body.soldOut).toBe(false);
  });
});

describe("errors have one consistent shape", () => {
  it("422 with per-field messages for invalid input", async () => {
    const res = await http.post(`${API}/enquiries`).send({ kind: "Contact", name: "A", email: "nope", subject: "Hi", message: "short" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(res.body.error.fields.email).toBeTruthy();
  });

  it("401 when not signed in, 404 for unknown routes' resources", async () => {
    expect((await http.get(`${API}/admin/bookings`)).status).toBe(401);
    const res = await http.get(`${API}/rooms/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("admin: add a room", () => {
  it("requires the CSRF header on cookie-authenticated writes", async () => {
    const res = await http.post(`${API}/admin/rooms`).set("Cookie", ownerCookie).send(newRoom);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF");
  });

  it("front desk cannot add rooms (permission rooms:edit)", async () => {
    const res = await http.post(`${API}/admin/rooms`).set("Cookie", frontdeskCookie).set("x-kp-csrf", "1").send(newRoom);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("validates the room", async () => {
    const res = await http.post(`${API}/admin/rooms`).set("Cookie", ownerCookie).set("x-kp-csrf", "1").send({ ...newRoom, price: 10, images: ["not an image"] });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.price).toBeTruthy();
    expect(Object.keys(res.body.error.fields).some((k) => k.startsWith("images"))).toBe(true);
  });

  it("creates the room, makes it public, bookable and editable", async () => {
    const created = await http.post(`${API}/admin/rooms`).set("Cookie", ownerCookie).set("x-kp-csrf", "1").send(newRoom);
    expect(created.status).toBe(201);
    expect(created.body.room.slug).toBe("heritage-suite");

    // public site sees it
    const pub = await http.get(`${API}/rooms/heritage-suite`);
    expect(pub.status).toBe(200);
    expect(pub.body.room.price).toBe(5200);

    // quotes and bookings work for it (5,200 ×2 nights, 5% GST)
    const q = await http.post(`${API}/quotes`).send({ roomSlug: "heritage-suite", checkIn: d(60), checkOut: d(62), rooms: 1 });
    expect(q.body.quote.total).toBe(10920);
    const b = await http
      .post(`${API}/bookings`)
      .send({ roomSlug: "heritage-suite", checkIn: d(60), checkOut: d(62), rooms: 1, adults: 2, children: 0, ratePlan: "room-only", addonIds: [], payMode: "hotel", guest: { name: "Meera Nair", email: "meera@example.com", mobile: "9876500011", gstin: "" } });
    expect(b.status).toBe(201);
    expect(b.body.booking.status).toBe("CONFIRMED");
    expect(b.body.accessToken).toBeTruthy();

    // a guest can read it with the token, but not without proof
    const ref = b.body.booking.ref;
    expect((await http.get(`${API}/bookings/${ref}?t=${b.body.accessToken}`)).status).toBe(200);
    expect((await http.get(`${API}/bookings/${ref}`)).status).toBe(404);

    // owner edits the rate; same slug, new price
    const patched = await http.patch(`${API}/admin/rooms/heritage-suite`).set("Cookie", ownerCookie).set("x-kp-csrf", "1").send({ price: 5400, active: false });
    expect(patched.status).toBe(200);
    expect(patched.body.room).toMatchObject({ slug: "heritage-suite", price: 5400, active: false });
    const after = await http.post(`${API}/quotes`).send({ roomSlug: "heritage-suite", checkIn: d(70), checkOut: d(71), rooms: 1 });
    expect(after.body.soldOut).toBe(true); // inactive rooms are sold out
  });

  it("gives a second room with the same name a unique slug", async () => {
    const res = await http.post(`${API}/admin/rooms`).set("Cookie", ownerCookie).set("x-kp-csrf", "1").send(newRoom);
    expect(res.status).toBe(201);
    expect(res.body.room.slug).toBe("heritage-suite-2");
  });
});

describe("admin: payments and invoices over HTTP", () => {
  it("front desk can issue a B2C invoice and record a cash payment", async () => {
    const inv = await http
      .post(`${API}/admin/invoices`)
      .set("Cookie", frontdeskCookie)
      .set("x-kp-csrf", "1")
      .send({ party: { type: "B2C", name: "Walk In", email: "walkin@example.com" }, items: [{ description: "Restaurant dinner", ruleCode: "RESTAURANT_FNB", qty: 1, unitPrice: 1000 }] });
    expect(inv.status).toBe(201);
    expect(inv.body.invoice.totals.grandTotalPaise).toBe(105000);

    const pay = await http
      .post(`${API}/admin/invoices/${inv.body.invoice.id}/payments`)
      .set("Cookie", frontdeskCookie)
      .set("x-kp-csrf", "1")
      .send({ method: "CASH", amount: 1050 });
    expect(pay.status).toBe(201);
    expect(pay.body.ledger.status).toBe("PAID");

    const bad = await http
      .post(`${API}/admin/invoices/${inv.body.invoice.id}/payments`)
      .set("Cookie", frontdeskCookie)
      .set("x-kp-csrf", "1")
      .send({ method: "UPI", amount: 10 });
    expect(bad.status).toBe(422); // UPI needs a transaction id
  });
});
