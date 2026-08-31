export function mcpServerUrl(value: string | undefined): URL {
  if (!value) throw new Error("MCP_SERVER_URL is missing. Copy the root .env.example to .env.");
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP_SERVER_URL must use http or https.");
  }
  return url;
}
