/**
 * SQLite session store. Requires optional dependency: pnpm add better-sqlite3
 * Use when the hub (or bridge) should persist sessions to disk.
 */

import type { SessionStore } from "./store.js";
import type { Session, Frame } from "./types.js";
import { genId } from "../ids.js";

export async function createSqliteSessionStore(dbPath: string): Promise<SessionStore> {
  const Database = (await import("better-sqlite3")).default;
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS frames (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT,
      redacted INTEGER DEFAULT 1,
      FOREIGN KEY (sessionId) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_frames_sessionId ON frames(sessionId);
  `);

  const getSessionRow = db.prepare<{ id: string }, { id: string; createdAt: number; updatedAt: number; status: string }>(
    "SELECT id, createdAt, updatedAt, status FROM sessions WHERE id = ?"
  );
  const getFramesRows = db.prepare<
    { sessionId: string },
    { id: string; sessionId: string; timestamp: number; type: string; payload: string; redacted: number }
  >("SELECT id, sessionId, timestamp, type, payload, redacted FROM frames WHERE sessionId = ? ORDER BY timestamp ASC");

  function rowToSession(row: { id: string; createdAt: number; updatedAt: number; status: string }): Session {
    const frames = getFramesRows.all({ sessionId: row.id }).map((f) => ({
      id: f.id,
      sessionId: f.sessionId,
      timestamp: f.timestamp,
      type: f.type,
      payload: JSON.parse(f.payload || "null") as unknown,
      redacted: f.redacted !== 0,
    }));
    return {
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      status: row.status as Session["status"],
      frames,
    };
  }

  return {
    createSession(): Session {
      const id = genId("sess");
      const now = Date.now();
      db.prepare("INSERT INTO sessions (id, createdAt, updatedAt, status) VALUES (?, ?, ?, ?)").run(
        id,
        now,
        now,
        "active"
      );
      return { id, createdAt: now, updatedAt: now, status: "active", frames: [] };
    },

    ensureSession(id: string): Session {
      const row = getSessionRow.get({ id });
      if (row) return rowToSession(row);
      const now = Date.now();
      db.prepare("INSERT INTO sessions (id, createdAt, updatedAt, status) VALUES (?, ?, ?, ?)").run(
        id,
        now,
        now,
        "active"
      );
      return { id, createdAt: now, updatedAt: now, status: "active", frames: [] };
    },

    getSession(id: string): Session | undefined {
      const row = getSessionRow.get({ id });
      return row ? rowToSession(row) : undefined;
    },

    listSessions(): Session[] {
      const rows = db.prepare("SELECT id, createdAt, updatedAt, status FROM sessions ORDER BY updatedAt DESC").all() as {
        id: string;
        createdAt: number;
        updatedAt: number;
        status: string;
      }[];
      return rows.map(rowToSession);
    },

    updateSession(id: string, updates: Partial<Session>): Session | undefined {
      const row = getSessionRow.get({ id });
      if (!row) return undefined;
      const updatesObj: Record<string, unknown> = { ...updates, updatedAt: Date.now() };
      if (updatesObj.status !== undefined) {
        db.prepare("UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?").run(
          updatesObj.status as string,
          updatesObj.updatedAt as number,
          id
        );
      }
      return this.getSession(id);
    },

    addFrame(sessionId: string, type: string, payload: unknown, redacted = true): Frame | undefined {
      const row = getSessionRow.get({ id: sessionId });
      if (!row) return undefined;
      const id = genId("frame");
      const timestamp = Date.now();
      db.prepare(
        "INSERT INTO frames (id, sessionId, timestamp, type, payload, redacted) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, sessionId, timestamp, type, JSON.stringify(payload), redacted ? 1 : 0);
      db.prepare("UPDATE sessions SET updatedAt = ? WHERE id = ?").run(timestamp, sessionId);
      return {
        id,
        sessionId,
        timestamp,
        type,
        payload,
        redacted,
      };
    },

    getFrames(sessionId: string): Frame[] {
      return getFramesRows.all({ sessionId }).map((f) => ({
        id: f.id,
        sessionId: f.sessionId,
        timestamp: f.timestamp,
        type: f.type,
        payload: JSON.parse(f.payload || "null") as unknown,
        redacted: f.redacted !== 0,
      }));
    },

    killSession(id: string): boolean {
      const row = getSessionRow.get({ id });
      if (!row) return false;
      db.prepare("UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?").run("killed", Date.now(), id);
      return true;
    },

    resetRunnerSession(id: string): Session | undefined {
      const row = getSessionRow.get({ id });
      if (!row) return undefined;
      const now = Date.now();
      db.prepare("DELETE FROM frames WHERE sessionId = ?").run(id);
      db.prepare("UPDATE sessions SET updatedAt = ? WHERE id = ?").run(now, id);
      return rowToSession({ ...row, updatedAt: now });
    },
  };
}
