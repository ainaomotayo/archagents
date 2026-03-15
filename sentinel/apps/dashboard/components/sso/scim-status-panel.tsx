"use client";
import { useState, useEffect } from "react";

interface ScimState {
  lastSyncAt?: string;
  usersCreated: number;
  usersUpdated: number;
  usersDeleted: number;
  status: string;
  errorDetail?: string;
}

export function ScimStatusPanel({ configId }: { configId: string }) {
  const [state, setState] = useState<ScimState | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/scim/status")
      .then((r) => r.json())
      .then((d) => setState(d.state ?? null))
      .catch(() => {});
  }, []);

  const handleRegenerateToken = async () => {
    if (!confirm("This will invalidate the current SCIM token. Continue?")) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/v1/sso-configs/${configId}/scim-token`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setNewToken(data.scimToken);
      }
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 mt-4">
      <h3 className="font-semibold text-sm mb-3">SCIM Provisioning</h3>
      {state ? (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Status</span>
            <span className={state.status === "error" ? "text-red-600 font-medium" : "text-green-600 font-medium"}>
              {state.status}
            </span>
          </div>
          {state.lastSyncAt && (
            <div className="flex justify-between">
              <span className="text-gray-500">Last Sync</span>
              <span>{new Date(state.lastSyncAt).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Users Created</span>
            <span>{state.usersCreated}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Users Updated</span>
            <span>{state.usersUpdated}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Users Deleted</span>
            <span>{state.usersDeleted}</span>
          </div>
          {state.errorDetail && (
            <div className="bg-red-50 text-red-700 p-2 rounded text-xs mt-2">{state.errorDetail}</div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No SCIM sync data available.</p>
      )}
      <div className="mt-4 pt-3 border-t">
        <button
          onClick={handleRegenerateToken}
          disabled={regenerating}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm disabled:opacity-50"
        >
          {regenerating ? "Generating..." : "Regenerate SCIM Token"}
        </button>
        {newToken && (
          <div className="mt-2 bg-yellow-50 border border-yellow-200 p-2 rounded text-xs">
            <p className="font-medium text-yellow-800">New SCIM Token (copy now — won't be shown again):</p>
            <code className="block mt-1 break-all text-yellow-900">{newToken}</code>
          </div>
        )}
      </div>
    </div>
  );
}
