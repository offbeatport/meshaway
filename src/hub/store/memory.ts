import {
  createInMemorySessionStore,
  type Session,
  type Frame,
} from "../../shared/session/index.js";

/** Hub's default session store (in-memory). Can be swapped for SQLite/DB when the hub runs elsewhere. */
export const sessionStore = createInMemorySessionStore();
export type { Session, Frame };
