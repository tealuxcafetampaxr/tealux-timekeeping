import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzra1hhtBCp4sZ_4Jaxuy26o8-NyB-xm4hDIjPWhKqTMRDXac3PclYUJn8mIakKXMR9VQ/exec";

const INITIAL_EMPLOYEES = ["Kha", "Employee 2", "Employee 3"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTimestamp(date) {
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function getWeekLabel(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `Week of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ─── GOOGLE SHEETS WRITE ─────────────────────────────────────────────────────
async function logToSheet(payload) {
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Sheet write failed:", err);
    return { success: false, error: err.toString() };
  }
}

// ─── CONFIRMATION MODAL ───────────────────────────────────────────────────────
function ConfirmModal({ action, employee, timestamp, onConfirm, onCancel }) {
  const isClockIn = action === "CLOCK_IN";
  const isLunch = action === "LUNCH";
  const label = isClockIn ? "Clock In" : isLunch ? "Log Lunch" : "Clock Out";
  const color = isClockIn ? "#00C896" : isLunch ? "#F5A623" : "#FF5A5A";

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={{ ...styles.modalAccent, background: color }} />
        <p style={styles.modalEmp}>{employee}</p>
        <p style={styles.modalAction}>{label}?</p>
        <p style={styles.modalTime}>{formatTimestamp(timestamp)}</p>
        <div style={styles.modalButtons}>
          <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button style={{ ...styles.confirmBtn, background: color }} onClick={onConfirm}>
            Confirm {label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ message, color, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{ ...styles.toast, borderLeft: `4px solid ${color}` }}>
      <span style={{ color }}>{message}</span>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function TealuxClock() {
  const [now, setNow] = useState(new Date());
  const [employees] = useState(INITIAL_EMPLOYEES);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState({}); // { [name]: "IN" | "LUNCH" | null }
  const [pending, setPending] = useState(null); // { action, employee, timestamp }
  const [toast, setToast] = useState(null);
  const [log, setLog] = useState([]);
  const [syncPending, setSyncPending] = useState([]);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Retry sync queue
  useEffect(() => {
    if (syncPending.length === 0) return;
    const t = setInterval(async () => {
      const [next, ...rest] = syncPending;
      const result = await logToSheet(next);
      if (result.success) setSyncPending(rest);
    }, 5000);
    return () => clearInterval(t);
  }, [syncPending]);

  const showToast = useCallback((message, color = "#00C896") => {
    setToast({ message, color });
  }, []);

  const handleAction = (action) => {
    if (!selected) {
      showToast("Select your name first", "#F5A623");
      return;
    }
    const empStatus = status[selected];
    if (action === "CLOCK_IN" && empStatus === "IN") {
      showToast(`${selected} is already clocked in`, "#FF5A5A");
      return;
    }
    if (action === "CLOCK_OUT" && !empStatus) {
      showToast(`${selected} hasn't clocked in`, "#FF5A5A");
      return;
    }
    setPending({ action, employee: selected, timestamp: new Date() });
  };

  const handleConfirm = async () => {
    const { action, employee, timestamp } = pending;
    const d = timestamp;
    const dateISO = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const timeStr = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];

    const row = {
      employee,
      action,
      timestamp: formatTimestamp(timestamp),
      date: dateISO,
      day: dayName,
      week: getWeekLabel(timestamp),
      time: timeStr,
    };

    // Build punch payload for sheet
    const currentState = { ...status };
    const punchPayload = {
      action: "LOG_PUNCH",
      employee,
      date: dateISO,
      day: dayName,
      week: getWeekLabel(timestamp),
      scheduledIn: "",
      scheduledOut: "",
      clockIn:  action === "CLOCK_IN"  ? timeStr : (currentState[employee + "_in"]  || ""),
      clockOut: action === "CLOCK_OUT" ? timeStr : "",
      lunch:    action === "LUNCH"     ? timeStr : "",
      manual: false,
      exceptions: [],
    };

    setLog((prev) => [row, ...prev]);

    const newStatus = { ...status };
    if (action === "CLOCK_IN") {
      newStatus[employee] = "IN";
      newStatus[employee + "_in"] = timeStr;
    } else if (action === "LUNCH") {
      newStatus[employee] = "LUNCH";
    } else {
      newStatus[employee] = null;
      delete newStatus[employee + "_in"];
    }
    setStatus(newStatus);

    const result = await logToSheet(punchPayload);
    if (!result.success) {
      setSyncPending((q) => [...q, punchPayload]);
      showToast("Saved locally — will sync when online", "#F5A623");
    } else {
      const labels = { CLOCK_IN: "Clocked In ✓", LUNCH: "Lunch Logged ✓", CLOCK_OUT: "Clocked Out ✓" };
      showToast(`${employee}: ${labels[action]}`);
    }

    setPending(null);
  };

  const empStatus = status[selected];
  const isIn = empStatus === "IN";
  const isOut = !empStatus;
  const isLunch = empStatus === "LUNCH";

  return (
    <div style={styles.root}>
      {/* Background blobs */}
      <div style={styles.blob1} />
      <div style={styles.blob2} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoT}>T</span>
          <span style={styles.logoRest}>EALUX</span>
        </div>
        <span style={styles.headerSub}>Team Time Clock</span>
      </div>

      {/* Live Clock */}
      <div style={styles.clockBlock}>
        <div style={styles.clockTime}>{formatTime(now)}</div>
        <div style={styles.clockDate}>{formatDate(now)}</div>
      </div>

      {/* Employee Picker */}
      <div style={styles.section}>
        <p style={styles.label}>Who are you?</p>
        <div style={styles.empGrid}>
          {employees.map((emp) => {
            const s = status[emp];
            const dot = s === "IN" ? "#00C896" : s === "LUNCH" ? "#F5A623" : "#444";
            return (
              <button
                key={emp}
                style={{
                  ...styles.empBtn,
                  ...(selected === emp ? styles.empBtnActive : {}),
                }}
                onClick={() => setSelected(emp)}
              >
                <span style={{ ...styles.empDot, background: dot }} />
                {emp}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Badge */}
      {selected && (
        <div style={styles.statusBadge}>
          <span style={{
            ...styles.statusDot,
            background: isIn || isLunch ? (isLunch ? "#F5A623" : "#00C896") : "#555"
          }} />
          <span style={styles.statusText}>
            {isIn ? "Currently clocked in" : isLunch ? "On lunch break" : "Not clocked in"}
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div style={styles.actions}>
        <button
          style={{
            ...styles.actionBtn,
            ...(isOut ? styles.actionGreen : styles.actionDisabled),
          }}
          onClick={() => handleAction("CLOCK_IN")}
          disabled={!isOut}
        >
          <span style={styles.actionIcon}>▶</span>
          Clock In
        </button>

        <button
          style={{
            ...styles.actionBtn,
            ...(isIn ? styles.actionAmber : styles.actionDisabled),
          }}
          onClick={() => handleAction("LUNCH")}
          disabled={!isIn}
        >
          <span style={styles.actionIcon}>☕</span>
          Log Lunch
        </button>

        <button
          style={{
            ...styles.actionBtn,
            ...((isIn || isLunch) ? styles.actionRed : styles.actionDisabled),
          }}
          onClick={() => handleAction("CLOCK_OUT")}
          disabled={!(isIn || isLunch)}
        >
          <span style={styles.actionIcon}>■</span>
          Clock Out
        </button>
      </div>

      {/* Sync indicator */}
      {syncPending.length > 0 && (
        <div style={styles.syncWarning}>
          ⚠ {syncPending.length} punch{syncPending.length > 1 ? "es" : ""} pending sync…
        </div>
      )}

      {/* Recent log */}
      {log.length > 0 && (
        <div style={styles.logBlock}>
          <p style={styles.logTitle}>Today's Activity</p>
          {log.slice(0, 5).map((entry, i) => (
            <div key={i} style={styles.logRow}>
              <span style={styles.logEmp}>{entry.employee}</span>
              <span style={styles.logAct}>{entry.action.replace("_", " ")}</span>
              <span style={styles.logTs}>{entry.timestamp}</span>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation modal */}
      {pending && (
        <ConfirmModal
          {...pending}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          color={toast.color}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: "100vh",
    background: "#0D0D0F",
    color: "#F0EDE6",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 20px 60px",
    position: "relative",
    overflow: "hidden",
  },
  blob1: {
    position: "absolute", top: -120, right: -100,
    width: 400, height: 400, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(0,200,150,0.07) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  blob2: {
    position: "absolute", bottom: -80, left: -80,
    width: 300, height: 300, borderRadius: "50%",
    background: "radial-gradient(circle, rgba(245,166,35,0.06) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  header: {
    display: "flex", flexDirection: "column", alignItems: "center",
    marginBottom: 32,
  },
  logo: { display: "flex", alignItems: "baseline", gap: 2 },
  logoT: {
    fontSize: 42, fontWeight: 900, color: "#00C896",
    fontFamily: "'Georgia', serif", letterSpacing: -2,
  },
  logoRest: {
    fontSize: 28, fontWeight: 700, letterSpacing: 6,
    color: "#F0EDE6", fontFamily: "'DM Mono', monospace",
  },
  headerSub: {
    fontSize: 11, letterSpacing: 4, color: "#666",
    textTransform: "uppercase", marginTop: 4,
  },
  clockBlock: {
    textAlign: "center", marginBottom: 40,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16, padding: "24px 40px",
  },
  clockTime: {
    fontSize: 52, fontWeight: 700, letterSpacing: 2,
    color: "#F0EDE6", fontVariantNumeric: "tabular-nums",
  },
  clockDate: { fontSize: 13, color: "#666", marginTop: 6, letterSpacing: 1 },
  section: { width: "100%", maxWidth: 480, marginBottom: 24 },
  label: { fontSize: 11, color: "#666", letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 },
  empGrid: { display: "flex", flexWrap: "wrap", gap: 10 },
  empBtn: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 18px", borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#AAA", fontSize: 14, cursor: "pointer",
    transition: "all 0.15s",
  },
  empBtnActive: {
    background: "rgba(255,255,255,0.09)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "#F0EDE6",
  },
  empDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  statusBadge: {
    display: "flex", alignItems: "center", gap: 8,
    marginBottom: 28, fontSize: 13, color: "#888",
  },
  statusDot: { width: 8, height: 8, borderRadius: "50%" },
  statusText: {},
  actions: {
    display: "flex", flexDirection: "column", gap: 12,
    width: "100%", maxWidth: 480,
  },
  actionBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    padding: "18px 24px", borderRadius: 12, fontSize: 16, fontWeight: 700,
    letterSpacing: 1, cursor: "pointer", border: "none",
    transition: "opacity 0.15s, transform 0.1s",
    fontFamily: "'DM Mono', monospace",
  },
  actionIcon: { fontSize: 14 },
  actionGreen: { background: "#00C896", color: "#0D0D0F" },
  actionAmber: { background: "#F5A623", color: "#0D0D0F" },
  actionRed: { background: "#FF5A5A", color: "#fff" },
  actionDisabled: { background: "#1E1E22", color: "#444", cursor: "not-allowed" },
  syncWarning: {
    marginTop: 16, fontSize: 12, color: "#F5A623",
    padding: "8px 16px", background: "rgba(245,166,35,0.08)",
    borderRadius: 8, border: "1px solid rgba(245,166,35,0.2)",
  },
  logBlock: {
    width: "100%", maxWidth: 480, marginTop: 32,
    borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20,
  },
  logTitle: { fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase", marginBottom: 12 },
  logRow: {
    display: "flex", gap: 12, alignItems: "center",
    padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
    fontSize: 12, flexWrap: "wrap",
  },
  logEmp: { color: "#00C896", fontWeight: 700, minWidth: 70 },
  logAct: { color: "#888", flex: 1 },
  logTs: { color: "#555", fontSize: 11 },
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 100,
  },
  modal: {
    background: "#17171A", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 20, padding: "40px 32px", maxWidth: 360, width: "90%",
    display: "flex", flexDirection: "column", alignItems: "center",
    position: "relative", overflow: "hidden",
  },
  modalAccent: {
    position: "absolute", top: 0, left: 0, right: 0, height: 4,
  },
  modalEmp: { fontSize: 22, fontWeight: 700, color: "#F0EDE6", marginBottom: 4 },
  modalAction: { fontSize: 16, color: "#888", marginBottom: 12 },
  modalTime: { fontSize: 13, color: "#555", marginBottom: 28, textAlign: "center" },
  modalButtons: { display: "flex", gap: 12, width: "100%" },
  cancelBtn: {
    flex: 1, padding: "14px", borderRadius: 10,
    background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
    color: "#888", fontSize: 14, cursor: "pointer", fontFamily: "'DM Mono', monospace",
  },
  confirmBtn: {
    flex: 2, padding: "14px", borderRadius: 10,
    border: "none", color: "#0D0D0F", fontSize: 14,
    fontWeight: 700, cursor: "pointer", fontFamily: "'DM Mono', monospace",
  },
  toast: {
    position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
    background: "#1A1A1E", borderRadius: 10,
    padding: "14px 24px", fontSize: 14, zIndex: 200,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
};
