import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authRoutes } from "../src/routes/auth";
import { sha256 } from "../src/utils/crypto";

class Statement {
  values: any[] = [];
  constructor(readonly db: DatabaseSync, readonly sql: string) {}
  bind(...values: any[]) { this.values = values; return this; }
  async first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
  execute() { return this.db.prepare(this.sql).run(...this.values); }
}

describe("email verification with real token SQL", () => {
  let db: DatabaseSync;
  let binding: any;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    for (const name of ["0001_initial.sql", "008_identity_security.sql"]) {
      db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    }
    db.exec("INSERT INTO users (id,email,name,password_hash,created_at,updated_at) VALUES ('user','fixture@example.test','Fixture','unused',0,0)");
    binding = {
      prepare: (sql: string) => new Statement(db, sql),
      batch: async (statements: Statement[]) => {
        db.exec("BEGIN");
        try {
          const result = statements.map(statement => statement.execute());
          db.exec("COMMIT");
          return result;
        } catch (error) { db.exec("ROLLBACK"); throw error; }
      },
    };
  });
  afterEach(() => db.close());
  async function token(expires: number, used: number | null = null) {
    db.prepare("INSERT INTO email_verification_tokens (id,user_id,token_hash,expires_at,used_at,created_at) VALUES ('token','user',?,?,?,0)")
      .run(await sha256("fixture"), expires, used);
  }
  function verify(value = "fixture") {
    return authRoutes.request(`/v1/auth/email/verify?token=${value}`, {}, { DB: binding } as never);
  }
  it("verifies a fresh token and rejects replay without changing the verified timestamp", async () => {
    await token(Date.now() + 60000);
    expect(await (await verify()).json()).toEqual({ verified: true });
    const first = db.prepare("SELECT email_verified_at FROM users").get();
    expect(first?.email_verified_at).toBeGreaterThan(0);
    expect((await verify()).status).toBe(400);
    expect(db.prepare("SELECT email_verified_at FROM users").get()).toEqual(first);
  });
  it.each(["expired", "used", "unknown", "missing"])("rejects %s tokens without verifying the user", async kind => {
    await token(kind === "expired" ? Date.now() - 1 : Date.now() + 60000, kind === "used" ? 1 : null);
    const response = await verify(kind === "unknown" ? "other" : kind === "missing" ? "" : "fixture");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_VERIFICATION_TOKEN" } });
    expect(db.prepare("SELECT email_verified_at FROM users").get()?.email_verified_at).toBeNull();
  });
});
