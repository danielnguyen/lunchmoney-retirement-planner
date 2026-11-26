"use client";

import { useEffect, useRef, useState } from "react";

export function usePlannerConfigSync(onApplied: () => Promise<{ ok: boolean }>) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Checking browser sync setup…");
  const active = useRef(false);
  const onAppliedRef = useRef(onApplied);
  useEffect(() => { onAppliedRef.current = onApplied; }, [onApplied]);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/config/sync", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const status = await response.json();
        if (!cancelled) {
          setAvailable(status.available === true);
          setMessage(status.message);
        }
      }).catch(() => {
        if (!cancelled) setMessage("Browser sync setup could not be checked. Reload the page to retry, or ask the owner to check deployment settings.");
      });
    return () => { cancelled = true; };
  }, []);

  async function sync() {
    if (active.current || !available) return;
    active.current = true;
    setBusy(true);
    setMessage("Syncing committed configuration…");
    try {
      const response = await fetch("/api/v1/config/sync", {
        method: "POST", headers: { "X-Planner-Sync": "1" }, cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.message || "Sync failed. Check deployment settings privately and retry.");
        return;
      }
      if (typeof result.revision !== "string" || !/^[a-f0-9]{40}$/.test(result.revision)) throw new Error();
      setMessage(`Applied Git revision ${result.revision}. Refreshing the baseline…`);
      let refreshed = false;
      try { refreshed = (await onAppliedRef.current()).ok; } catch { /* Activation already succeeded. */ }
      setMessage(`Applied Git revision ${result.revision}. ${refreshed
        ? "Baseline refreshed; temporary controls cleared. Revert any open YAML draft to reload the saved file."
        : "The baseline could not be refreshed. Retry Refresh Lunch Money and check its connection privately."}`);
    } catch {
      setMessage("The sync result could not be received. Refresh the baseline to check the active plan, then retry Sync now to confirm the committed revision.");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  return {
    busy,
    button: <button type="button" className="button secondary drawer-view-switch" disabled={!available || busy} aria-describedby="planner-sync-status" onClick={() => void sync()}>{busy ? "Syncing…" : "Sync now"}</button>,
    status: <p id="planner-sync-status" className="panel-copy" role="status" aria-label="Git sync" aria-live="polite" aria-atomic="true">{message}</p>,
  };
}
