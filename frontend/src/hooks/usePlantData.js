import { useState, useEffect, useCallback } from "react";
import {
  fetchSnapshot, fetchReport,
  fetchAnomalies, fetchMaintenance, fetchFailure
} from "../api";
import { useInterval } from "./useInterval";

const POLL_MS = 30000; // refresh every 30s

export function usePlantData() {
  const [snap,        setSnap]        = useState(null);
  const [report,      setReport]      = useState(null);
  const [anomalies,   setAnomalies]   = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [failures,    setFailures]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, r, a, m, f] = await Promise.all([
        fetchSnapshot(), fetchReport(),
        fetchAnomalies(), fetchMaintenance(), fetchFailure()
      ]);
      setSnap(s); setReport(r);
      setAnomalies(a); setMaintenance(m); setFailures(f);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError("Cannot reach backend. Make sure FastAPI is running on port 8000.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useInterval(load, POLL_MS);

  return { snap, report, anomalies, maintenance, failures, loading, error, lastRefresh, refresh: load };
}
