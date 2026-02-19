/** Bridge dials Hub to report sessions and receive control (kill/approve). */
export interface HubLinkClient {
  reportSessionStart(sessionId: string): Promise<void>;
  reportSessionEnd(sessionId: string): Promise<void>;
  reportFrame(sessionId: string, type: string, payload: unknown): Promise<void>;
}

export function createHubLinkClient(hubUrl: string): HubLinkClient {
  const base = hubUrl.replace(/\/$/, "");

  return {
    async reportSessionStart(sessionId: string) {
      try {
        await fetch(`${base}/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, type: "start" }),
        });
      } catch {
        // ignore
      }
    },
    async reportSessionEnd(sessionId: string) {
      try {
        await fetch(`${base}/api/sessions/${sessionId}/end`, {
          method: "POST",
        });
      } catch {
        // ignore
      }
    },
    async reportFrame(sessionId: string, type: string, payload: unknown) {
      try {
        await fetch(`${base}/api/sessions/${sessionId}/frames`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, payload }),
        });
      } catch {
        // ignore
      }
    },
  };
}
