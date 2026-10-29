import mysql from "mysql2/promise";
import { connectionOptions, DB_NAME } from "./config";

export const db = mysql.createPool({
  ...connectionOptions,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

db.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export async function testConnection() {
  const connection = await db.getConnection();
  try {
    await connection.ping();
    console.log("MySQL connected");
  } finally {
    connection.release();
  }
}
