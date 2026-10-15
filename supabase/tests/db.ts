import { PGlite, type Transaction } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** All migrations, in the order Supabase applies them (by filename). */
export function migrationFiles(): string[] {
  const dir = join(root, "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(dir, f));
}

/** A fresh in-memory Postgres with the Supabase shim and every migration applied. */
export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(root, "tests", "supabase-shim.sql"), "utf8"));
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

export interface TestUser {
  id: string;
  anonymous: boolean;
}

/** Create a user the way Supabase Auth would (fires our on-signup trigger). */
export async function createUser(db: PGlite, { anonymous = false } = {}): Promise<TestUser> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, is_anonymous) values ($1, $2)", [id, anonymous]);
  return { id, anonymous };
}

type Caller = TestUser | "anon" | "service_role";

/**
 * Run SQL as a given caller, like a request through Supabase's API:
 * a signed-in user (role authenticated + JWT claims), a visitor (anon) or the server.
 * Runs in its own transaction, so a failed call leaves no trace.
 */
export async function as<T = Record<string, unknown>>(
  db: PGlite,
  caller: Caller,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx: Transaction) => {
    const role = typeof caller === "string" ? caller : "authenticated";
    const claims =
      typeof caller === "string"
        ? { role }
        : { sub: caller.id, role, is_anonymous: caller.anonymous };
    await tx.query(
      "select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)",
      [role, JSON.stringify(claims)],
    );
    const res = await tx.query<T>(sql, params);
    return res.rows;
  });
}

/** Call a JSON-returning function and give back its value. */
export async function rpc<T = unknown>(
  db: PGlite,
  caller: Caller,
  fn: string,
  args: unknown[] = [],
): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await as<{ result: T }>(
    db,
    caller,
    `select public.${fn}(${placeholders}) as result`,
    args,
  );
  return rows[0].result;
}
