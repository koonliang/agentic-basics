import assert from "node:assert/strict";
import { test } from "node:test";
import { getOrderStatus, loadOrders } from "../src/orders.js";

test("loads the local order fixture", async () => {
  const orders = await loadOrders();
  assert.equal(orders.length, 3);
  assert.equal(orders[0]?.id, "A1001");
});

test("normalizes an order identifier", async () => {
  const order = await getOrderStatus(" a1001 ");
  assert.equal(order.status, "in_transit");
});

test("rejects an unknown order", async () => {
  await assert.rejects(() => getOrderStatus("A9999"), /was not found/);
});
