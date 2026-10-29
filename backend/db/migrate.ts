import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { connectionOptions as baseOptions, DB_NAME } from "./config";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const connectionOptions = {
  ...baseOptions,
  multipleStatements: true,
};

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

async function migrate() {
  const server = await mysql.createConnection(connectionOptions);
  await server.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
  );
  await server.end();

  const connection = await mysql.createConnection({ ...connectionOptions, database: DB_NAME });
  try {
    await connection.query("SET time_zone = '+00:00'");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        name        VARCHAR(255) NOT NULL,
        executed_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);

    const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT name FROM migrations");
    const executed = new Set(rows.map((row) => row.name));
    const pending = listMigrationFiles().filter((file) => !executed.has(file));

    if (pending.length === 0) {
      console.log("No pending migrations");
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`Running ${file}...`);
      await connection.query(sql);
      await connection.query("INSERT INTO migrations (name) VALUES (?)", [file]);
    }

    console.log(`${pending.length} migration(s) executed`);
  } finally {
    await connection.end();
  }
}

function create(name: string | undefined) {
  if (!name) {
    console.error("Usage: npm run migrate:create <nome_da_migration>");
    process.exit(1);
  }

  const last = listMigrationFiles().at(-1);
  const next = String((last ? parseInt(last, 10) : 0) + 1).padStart(3, "0");
  const fileName = `${next}_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.sql`;

  fs.writeFileSync(path.join(MIGRATIONS_DIR, fileName), `-- ${fileName}\n\n`);
  console.log(`Created db/migrations/${fileName}`);
}

const [command, arg] = process.argv.slice(2);

if (command === "create") {
  create(arg);
} else {
  migrate().catch((error) => {
    console.error("Migration failed:", error.message);
    process.exit(1);
  });
}
