import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface Order {
  id: string;
  customer: string;
  status: string;
  carrier: string | null;
  tracking_number: string | null;
  estimated_delivery: string;
}

const defaultOrdersPath = fileURLToPath(
  new URL("../data/orders.json", import.meta.url),
);

function isOrder(value: unknown): value is Order {
  if (typeof value !== "object" || value === null) return false;

  const order = value as Record<string, unknown>;
  return (
    typeof order.id === "string" &&
    typeof order.customer === "string" &&
    typeof order.status === "string" &&
    (typeof order.carrier === "string" || order.carrier === null) &&
    (typeof order.tracking_number === "string" ||
      order.tracking_number === null) &&
    typeof order.estimated_delivery === "string"
  );
}

export async function loadOrders(path = defaultOrdersPath): Promise<Order[]> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed) || !parsed.every(isOrder)) {
    throw new Error("Order data has an invalid format");
  }
  return parsed;
}

export async function getOrderStatus(orderId: string): Promise<Order> {
  const normalizedId = orderId.trim().toUpperCase();
  const order = (await loadOrders()).find(({ id }) => id === normalizedId);

  if (!order) {
    throw new Error(`Order ${normalizedId} was not found`);
  }
  return order;
}
