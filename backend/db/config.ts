import "../config/load_env";
import fs from "node:fs";
import path from "node:path";
import type { ConnectionOptions } from "mysql2/promise";

function sslOptions(): ConnectionOptions["ssl"] {
  if (process.env.DB_SSL !== "true") return undefined;

  const caPath = process.env.DB_SSL_CA_PATH;
  const ca = caPath
    ? fs.readFileSync(path.resolve(__dirname, "../..", caPath), "utf8")
    : process.env.DB_SSL_CA?.replace(/\\n/g, "\n");

  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

export const DB_NAME = process.env.DB_NAME || "pizza_flow";

export const connectionOptions: ConnectionOptions = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  ssl: sslOptions(),
  charset: "utf8mb4",
  timezone: "Z",
};
