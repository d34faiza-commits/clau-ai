import "server-only";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

export const SYSTEM_DATABASES = new Set(["mysql", "information_schema", "performance_schema", "sys"]);
const NAME_RE = /^[A-Za-z0-9_]{1,64}$/;

export class DbError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type DatabaseInfo = {
  name: string;
  sizeBytes: number;
  tables: number;
  engines: string[];
  collation: string;
  system: boolean;
};

export function dbConfigured(): boolean {
  return !!process.env.DB_USER;
}

/** Connection settings shared by the pool and mysqldump. */
export function dbSettings() {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
    socketPath: process.env.DB_SOCKET || undefined,
  };
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!dbConfigured()) throw new DbError("Database is not configured — set DB_USER and DB_PASSWORD in .env", 503);
  if (!pool) {
    pool = mysql.createPool({ ...dbSettings(), connectionLimit: 4, connectTimeout: 5000, multipleStatements: false });
  }
  return pool;
}

export function validateDbName(name: unknown): string {
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    throw new DbError("Database name may only contain letters, numbers and _ (max 64)");
  }
  return name;
}

export async function databaseExists(name: string): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
    [name],
  );
  return rows.length > 0;
}

export async function serverVersion(): Promise<string> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT VERSION() AS v");
  return String(rows[0].v);
}

export async function listDatabases(): Promise<DatabaseInfo[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(`
    SELECT s.SCHEMA_NAME AS name,
           s.DEFAULT_COLLATION_NAME AS collation,
           COUNT(t.TABLE_NAME) AS tables,
           COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) AS size,
           GROUP_CONCAT(DISTINCT t.ENGINE ORDER BY t.ENGINE) AS engines
      FROM information_schema.SCHEMATA s
      LEFT JOIN information_schema.TABLES t
        ON t.TABLE_SCHEMA = s.SCHEMA_NAME AND t.TABLE_TYPE = 'BASE TABLE'
     GROUP BY s.SCHEMA_NAME, s.DEFAULT_COLLATION_NAME
     ORDER BY s.SCHEMA_NAME`);
  return rows.map((r) => ({
    name: String(r.name),
    sizeBytes: Number(r.size),
    tables: Number(r.tables),
    engines: r.engines ? String(r.engines).split(",") : [],
    collation: String(r.collation),
    system: SYSTEM_DATABASES.has(String(r.name).toLowerCase()),
  }));
}

export async function createDatabase(nameInput: unknown) {
  const name = validateDbName(nameInput);
  if (SYSTEM_DATABASES.has(name.toLowerCase())) throw new DbError("That name is reserved");
  try {
    // the name is validated against [A-Za-z0-9_], so backtick quoting is safe
    await getPool().query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DB_CREATE_EXISTS") throw new DbError(`Database "${name}" already exists`, 409);
    throw err;
  }
}

export async function dropDatabase(nameInput: unknown) {
  const name = validateDbName(nameInput);
  if (SYSTEM_DATABASES.has(name.toLowerCase())) throw new DbError("System databases cannot be deleted", 403);
  try {
    await getPool().query(`DROP DATABASE \`${name}\``);
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DB_DROP_EXISTS") throw new DbError(`Database "${name}" does not exist`, 404);
    throw err;
  }
}

export function dbErrorResponse(err: unknown): { message: string; status: number } {
  if (err instanceof DbError) return { message: err.message, status: err.status };
  const code = (err as { code?: string }).code;
  if (code === "ER_ACCESS_DENIED_ERROR") return { message: "Access denied — check DB_USER / DB_PASSWORD", status: 502 };
  if (code === "ER_DBACCESS_DENIED_ERROR" || code === "ER_SPECIFIC_ACCESS_DENIED_ERROR")
    return { message: "The database user lacks permission for this action", status: 403 };
  if (code === "ECONNREFUSED" || code === "ENOENT" || code === "ETIMEDOUT")
    return { message: "Cannot connect to MySQL/MariaDB — is the server running?", status: 502 };
  console.error("[database]", err);
  return { message: (err as Error).message || "Database error", status: 500 };
}
