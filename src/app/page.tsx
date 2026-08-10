"use client";

import { useState, useRef, useEffect } from "react";

type Citation = { source: "gmail" | "drive"; title: string; url: string; date: string };
type Msg = { role: "user" | "assistant"; content: string; citations?: Citation[] };

const SUGGESTIONS = [
  "Find the email from Stripe about the failed payment",
  "What jobs have I applied to, and what's my status on each?",
  "Did I ever send [name] a draft, and did they reply?",
];

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "I'm your personal brain — connected to Gmail and Drive. Click \"Sync now\" once to pull in your data, then ask me anything that spans both.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // After the OAuth redirect lands back here with ?connected=1, kick off
  // sync automatically instead of making the user click "sync now" twice.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      // Clean the query param off the URL so a page refresh doesn't
      // re-trigger sync every time.
      window.history.replaceState({}, "", window.location.pathname);
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        if (data.error.includes("Not connected")) {
          window.location.href = "/api/auth/google";
          return;
        }
        setSyncStatus(`Sync failed: ${data.error}`);
      } else {
        setSyncStatus(
          `Synced ${data.gmailCount} Gmail messages + ${data.driveCount} Drive files (${data.totalStored} total in brain).`
        );
      }
    } catch (e: any) {
      setSyncStatus(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function send(query?: string) {
    const q = (query ?? input).trim();
    if (!q || loading) return;
    const nextMessages: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const history = nextMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(0, -1)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, history }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, citations: data.citations },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Something went wrong: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "0 20px",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "28px 0 18px",
          borderBottom: "1px solid var(--rule)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Pulse />
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
            Personal Brain
          </h1>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="mono"
          style={{
            fontSize: 12,
            padding: "8px 14px",
            border: "1px solid var(--ink)",
            background: syncing ? "var(--accent-soft)" : "var(--paper-raised)",
            borderRadius: 3,
          }}
        >
          {syncing ? "syncing…" : "sync now"}
        </button>
      </header>

      {syncStatus && (
        <p className="mono" style={{ fontSize: 12, color: "var(--accent)", margin: "10px 0 0" }}>
          {syncStatus}
        </p>
      )}

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: "auto", padding: "20px 0 12px", display: "flex", flexDirection: "column", gap: 18 }}
      >
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "85%",
                background: m.role === "user" ? "var(--ink)" : "var(--paper-raised)",
                color: m.role === "user" ? "var(--paper)" : "var(--ink)",
                border: m.role === "user" ? "none" : "1px solid var(--rule)",
                borderRadius: 10,
                padding: "12px 16px",
                lineHeight: 1.55,
                fontSize: 15,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
            {m.citations && m.citations.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, maxWidth: "85%" }}>
                {m.citations.map((c, ci) => (
                  <a
                    key={ci}
                    href={c.url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                    style={{
                      fontSize: 11,
                      textDecoration: "none",
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: `1px solid ${c.source === "gmail" ? "var(--gmail)" : "var(--drive)"}`,
                      color: c.source === "gmail" ? "var(--gmail)" : "var(--drive)",
                    }}
                  >
                    {c.source === "gmail" ? "✉" : "▤"} {c.title.slice(0, 40)}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="mono" style={{ fontSize: 12, color: "#8a8577" }}>
            thinking…
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="mono"
              style={{
                fontSize: 12,
                padding: "6px 10px",
                border: "1px solid var(--rule)",
                background: "var(--paper-raised)",
                borderRadius: 6,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{ display: "flex", gap: 8, padding: "12px 0 24px", borderTop: "1px solid var(--rule)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask across your Gmail and Drive…"
          style={{
            flex: 1,
            padding: "12px 14px",
            fontSize: 15,
            border: "1px solid var(--rule)",
            borderRadius: 8,
            background: "var(--paper-raised)",
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0 18px",
            border: "none",
            borderRadius: 8,
            background: "var(--accent)",
            color: "var(--paper)",
            fontSize: 14,
          }}
        >
          Ask
        </button>
      </form>
    </main>
  );
}

function Pulse() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: "var(--accent)",
        boxShadow: "0 0 0 3px var(--accent-soft)",
      }}
    />
  );
}
