export function parseDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValidDate(value)) {
    throw new Error("--as-of must be a valid date in YYYY-MM-DD format.");
  }
  return Number(value.replaceAll("-", ""));
}

export function formatDate(value: number): string {
  const digits = String(value);
  if (!/^\d{8}$/.test(digits)) throw new Error("effective_date must be a valid YYYYMMDD number.");
  const formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (!isValidDate(formatted)) throw new Error("effective_date must be a valid YYYYMMDD number.");
  return formatted;
}

function isValidDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
