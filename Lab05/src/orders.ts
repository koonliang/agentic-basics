import { readFile } from "node:fs/promises";

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

export async function listOrderIds(): Promise<string[]> {
  return (await loadOrders()).map((order) => order.id);
}

export async function getOrderStatus(orderId: string): Promise<Order | undefined> {
  const normalizedId = orderId.trim().toUpperCase();
  return (await loadOrders()).find((order) => order.id === normalizedId);
}

function isOrder(value: unknown): value is Order {
  if (typeof value !== "object" || value === null) return false;
  const order = value as Record<string, unknown>;
  return (
    typeof order.id === "string" &&
    typeof order.customer === "string" &&
    typeof order.status === "string" &&
    (typeof order.carrier === "string" || order.carrier === null) &&
    (typeof order.tracking_number === "string" || order.tracking_number === null) &&
    typeof order.estimated_delivery === "string"
  );
}
