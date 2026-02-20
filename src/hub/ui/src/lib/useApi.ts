import { useState, useEffect, useCallback } from "react";
import {
  fetchSessions,
  fetchSession,
  fetchFrames,
  killSession,
  checkHealth,
  fetchHealthInfo,
  type Session,
  type Frame,
} from "./api";

export function useSessions(refreshInterval = 3000) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchSessions();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (refreshInterval <= 0) return;
    const id = setInterval(load, refreshInterval);
    return () => clearInterval(id);
  }, [load, refreshInterval]);

  return { sessions, loading, error, refresh: load };
}

export function useSession(id: string | undefined) {
  const [session, setSession] = useState<Session | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setSession(null);
      setFrames([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setError(null);
        setLoading(true);
        const [sess, frms] = await Promise.all([
          fetchSession(id),
          fetchFrames(id),
        ]);
        if (!cancelled) {
          setSession(sess);
          setFrames(frms);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load session");
          setSession(null);
          setFrames([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleKill = useCallback(async () => {
    if (!id || !session) return false;
    const ok = await killSession(id);
    if (ok) setSession((s) => (s ? { ...s, status: "killed" } : null));
    return ok;
  }, [id, session]);

  return { session, frames, loading, error, killSession: handleKill };
}

export function useHealth(refreshInterval = 5000) {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const ok = await checkHealth();
      if (!cancelled) setHealthy(ok);
    }

    check();
    const id = setInterval(check, refreshInterval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshInterval]);

  return healthy;
}

export function useHealthInfo() {
  const [healthInfo, setHealthInfo] = useState<{
    hub: boolean;
    backend: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setError(null);
        const data = await fetchHealthInfo();
        if (!cancelled) setHealthInfo(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load health");
          setHealthInfo(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { healthInfo, loading, error };
}
