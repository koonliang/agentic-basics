import { readFile } from "node:fs/promises";

import { isRecord } from "./types.js";

export interface Order {
  id: string;
  customer: string;
  status: string;
  carrier: string | null;
  tracking_number: string | null;
  estimated_delivery: string;
}

const ordersFile = new URL("../data/orders.json", import.meta.url);

export async function loadOrders(): Promise<Order[]> {
  const parsed: unknown = JSON.parse(await readFile(ordersFile, "utf8"));

  if (!Array.isArray(parsed) || !parsed.every(isOrder)) {
    throw new Error("data/orders.json has an invalid format.");
  }

  return parsed;
}

export async function getOrderStatus(orderId: string): Promise<Order | undefined> {
  const orders = await loadOrders();
  const normalizedId = orderId.trim().toUpperCase();
  return orders.find((order) => order.id === normalizedId);
}

export async function countOrders(): Promise<number> {
  return (await loadOrders()).length;
}

export async function listOrderIds(): Promise<string[]> {
  return (await loadOrders()).map((order) => order.id);
}

function isOrder(value: unknown): value is Order {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.customer === "string" &&
    typeof value.status === "string" &&
    (typeof value.carrier === "string" || value.carrier === null) &&
    (typeof value.tracking_number === "string" || value.tracking_number === null) &&
    typeof value.estimated_delivery === "string"
  );
}
