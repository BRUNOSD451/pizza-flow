import mysql, { type Pool, type PoolConnection } from "mysql2/promise";
import { connectionOptions, DB_NAME } from "./config";

// Repositories recebem o pool (padrão) ou a conexão de uma transação em andamento
export type Executor = Pool | PoolConnection;

export const db = mysql.createPool({
  ...connectionOptions,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

db.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

// Roda `fn` numa transação: commit se terminar, rollback se lançar erro.
// Passe a `conn` recebida para os repositories para que todos participem da mesma transação.
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    return resultado;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function testConnection() {
  const connection = await db.getConnection();
  try {
    await connection.ping();
    console.log("MySQL connected");
  } finally {
    connection.release();
  }
}
