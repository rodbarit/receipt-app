import { useState, useRef, useCallback } from "react";

const FIELD_KEYS = ["issuer", "date", "total", "description"];
const FIELD_LABELS = { issuer: "Issuer", date: "Date", total: "Total Amount", description: "Items / Description" };

async function extractReceiptData(base64, mediaType) {
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mediaType })
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error || "Extraction failed");
  }

  return json.data;
}

function toCSV(rows) {
  const header = ["Issuer", "Date", "Total Amount", "Description"];
  const lines = [
    header.join(","),
    ...rows.map(r =>
      [r.issuer, r.date, r.total, r.description]
        .map(v => `"${(v || "").replace(/"/g, '""')}"`)
        .join(",")
    )
  ];
  return lines.join("\n");
}

export default function App() {
  const [receipts, setReceipts] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const fileRef = useRef();

  const processFiles = useCallback(async (files) => {
    setGlobalError(null);
    const newItems = Array.from(files).map(f => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      preview: URL.createObjectURL(f),
      status: "pending",
      error: null,
      data: { issuer: "", date: "", total: "", description: "" }
    }));
    setReceipts(prev => [...prev, ...newItems]);

    for (const item of newItems) {
      setReceipts(prev => prev.map(r => r.id === item.id ? { ...r, status: "processing" } : r));
      try {
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result.split(",")[1]);
          reader.onerror = rej;
          reader.readAsDataURL(item.file);
        });
        const mediaType = item.file.type || "image/jpeg";
        const extracted = await extractReceiptData(base64, mediaType);
        setReceipts(prev => prev.map(r =>
          r.id === item.id ? { ...r, status: "done", data: extracted || r.data } : r
        ));
      } catch (e) {
        const msg = e.message || "Failed to process";
        // Surface rate limit errors globally
        if (msg.toLowerCase().includes("daily limit")) setGlobalError(msg);
        setReceipts(prev => prev.map(r =>
          r.id === item.id ? { ...r, status: "error", error: msg } : r
        ));
      }
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const updateField = (id, key, value) =>
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, data: { ...r.data, [key]: value } } : r));

  const removeReceipt = (id) =>
    setReceipts(prev => prev.filter(r => r.id !== id));

  const downloadCSV = () => {
    const done = receipts.filter(r => r.status === "done");
    if (!done.length) return;
    const blob = new Blob([toCSV(done.map(r => r.data))], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `receipts-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const doneCount = receipts.filter(r => r.status === "done").length;
  const processingCount = receipts.filter(r => r.status === "processing").length;

  return (
    <div style={{
      minHeight: "100vh", background: "#0f0e0c", color: "#f0ece3",
      fontFamily: "'Georgia', serif", padding: 0
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #2a2620", padding: "28px 48px",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.25em", color: "#8a7f6e", textTransform: "uppercase", marginBottom: 4 }}>
            Receipt Intelligence
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em" }}>
            Scan & Export
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, color: "#6a6258" }}>10 receipts / day per user</span>
          <button
            onClick={downloadCSV}
            disabled={doneCount === 0}
            style={{
              background: doneCount > 0 ? "#c9a84c" : "#2a2620",
              color: doneCount > 0 ? "#0f0e0c" : "#4a4540",
              border: "none", borderRadius: 4, padding: "10px 22px",
              fontSize: 13, fontFamily: "inherit",
              cursor: doneCount > 0 ? "pointer" : "not-allowed",
              letterSpacing: "0.08em", fontWeight: 600, transition: "all 0.2s"
            }}
          >
            ↓ Export CSV {doneCount > 0 ? `(${doneCount})` : ""}
          </button>
        </div>
      </div>

      <div style={{ padding: "40px 48px", maxWidth: 1100, margin: "0 auto" }}>
        {/* Global error banner */}
        {globalError && (
          <div style={{
            background: "rgba(220,90,90,0.12)", border: "1px solid rgba(220,90,90,0.3)",
            borderRadius: 6, padding: "12px 18px", marginBottom: 24,
            fontSize: 13, color: "#e88080", display: "flex", justifyContent: "space-between"
          }}>
            <span>⚠ {globalError}</span>
            <button onClick={() => setGlobalError(null)} style={{
              background: "none", border: "none", color: "#e88080", cursor: "pointer", fontSize: 16
            }}>×</button>
          </div>
        )}

        {/* Drop Zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileRef.current.click()}
          style={{
            border: `2px dashed ${dragging ? "#c9a84c" : "#3a3630"}`,
            borderRadius: 8, padding: "52px 32px", textAlign: "center",
            cursor: "pointer", marginBottom: 40, transition: "all 0.2s",
            background: dragging ? "rgba(201,168,76,0.04)" : "rgba(255,255,255,0.02)"
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>📄</div>
          <div style={{ fontSize: 16, color: "#c9a84c", marginBottom: 6 }}>
            Drop receipt photos here
          </div>
          <div style={{ fontSize: 13, color: "#6a6258" }}>
            or click to browse · JPG, PNG, WEBP · multiple files OK
          </div>
          <input
            ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={e => processFiles(e.target.files)}
          />
        </div>

        {/* Status bar */}
        {receipts.length > 0 && (
          <div style={{ marginBottom: 24, display: "flex", gap: 20, fontSize: 13, color: "#8a7f6e" }}>
            <span>{receipts.length} receipt{receipts.length !== 1 ? "s" : ""}</span>
            {processingCount > 0 && <span style={{ color: "#c9a84c" }}>⟳ {processingCount} processing…</span>}
            {doneCount > 0 && <span style={{ color: "#7ab87a" }}>✓ {doneCount} ready to export</span>}
          </div>
        )}

        {/* Results Table */}
        {receipts.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2a2620" }}>
                  <th style={{ ...th, width: 72 }}>Preview</th>
                  {FIELD_KEYS.map(k => <th key={k} style={th}>{FIELD_LABELS[k]}</th>)}
                  <th style={{ ...th, width: 80 }}>Status</th>
                  <th style={{ ...th, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #1e1c18" }}>
                    <td style={td}>
                      <img src={r.preview} alt="" style={{
                        width: 52, height: 52, objectFit: "cover",
                        borderRadius: 4, border: "1px solid #2a2620"
                      }} />
                    </td>
                    {FIELD_KEYS.map(k => (
                      <td key={k} style={td}>
                        {r.status === "processing"
                          ? <div style={{
                              height: 16, background: "#1e1c18", borderRadius: 3,
                              animation: "pulse 1.4s infinite"
                            }} />
                          : r.status === "error"
                          ? <span style={{ color: "#6a5a5a", fontSize: 12 }}>—</span>
                          : <input
                              value={r.data[k] || ""}
                              onChange={e => updateField(r.id, k, e.target.value)}
                              style={{
                                background: "transparent", border: "1px solid transparent",
                                borderRadius: 3, padding: "4px 6px", color: "#f0ece3",
                                fontFamily: "inherit", fontSize: 13, width: "100%",
                                outline: "none", transition: "border-color 0.15s", boxSizing: "border-box"
                              }}
                              onFocus={e => e.target.style.borderColor = "#c9a84c"}
                              onBlur={e => e.target.style.borderColor = "transparent"}
                            />
                        }
                      </td>
                    ))}
                    <td style={{ ...td, textAlign: "center" }}>
                      {r.status === "error"
                        ? <span title={r.error} style={{
                            fontSize: 11, padding: "2px 8px", borderRadius: 10,
                            background: "rgba(220,90,90,0.15)", color: "#dc5a5a",
                            cursor: "help"
                          }}>error ⓘ</span>
                        : <span style={{
                            fontSize: 11, padding: "2px 8px", borderRadius: 10,
                            background: r.status === "done" ? "rgba(122,184,122,0.15)" : "rgba(201,168,76,0.15)",
                            color: r.status === "done" ? "#7ab87a" : "#c9a84c"
                          }}>
                            {r.status === "processing" ? "…" : r.status}
                          </span>
                      }
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => removeReceipt(r.id)}
                        style={{
                          background: "none", border: "none", color: "#4a4540",
                          cursor: "pointer", fontSize: 16, padding: "2px 6px", transition: "color 0.15s"
                        }}
                        onMouseEnter={e => e.target.style.color = "#dc5a5a"}
                        onMouseLeave={e => e.target.style.color = "#4a4540"}
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {receipts.length === 0 && (
          <div style={{ textAlign: "center", color: "#3a3630", fontSize: 13, marginTop: 40 }}>
            No receipts yet — upload some images above to get started.
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:0.4 } 50% { opacity:0.9 } }
        * { box-sizing: border-box; }
        input::placeholder { color: #4a4540; }
      `}</style>
    </div>
  );
}

const th = {
  textAlign: "left", padding: "10px 14px", color: "#6a6258",
  fontWeight: 400, letterSpacing: "0.08em", fontSize: 11, textTransform: "uppercase"
};
const td = { padding: "10px 14px", verticalAlign: "middle" };
