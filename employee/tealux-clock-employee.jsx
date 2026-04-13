const { useState, useEffect, useCallback, useRef } = React;

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzra1hhtBCp4sZ_4Jaxuy26o8-NyB-xm4hDIjPWhKqTMRDXac3PclYUJn8mIakKXMR9VQ/exec";
const AUTO_LOGOUT_SECS = 10;

// Fallback employees if sheet is unreachable
const FALLBACK_EMPLOYEES = [
  { name: "Kha",        pin: "" },
  { name: "Employee 2", pin: "" },
  { name: "Employee 3", pin: "" },
];

async function fetchEmployees() {
  try {
    const res = await fetch(APPS_SCRIPT_URL + "?action=GET_EMPLOYEE_CONFIG", { redirect: "follow" });
    const text = await res.text();
    const data = JSON.parse(text);
    if (data.success && data.employees && data.employees.length > 0) {
      return data.employees.filter(e => e.name).map(e => ({ name: e.name, pin: String(e.pin || "").padStart(4, "0") }));
    }
  } catch (err) {
    console.error("Failed to load employees:", err);
  }
  return FALLBACK_EMPLOYEES;
}

async function fetchTodayStatus(employeeNames) {
  // Get today's punches and reconstruct who is currently clocked in
  const today = new Date();
  const month = today.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const todayISO = toLocalISO(today);

  try {
    const res = await fetch(
      APPS_SCRIPT_URL + "?action=GET_PUNCHES&month=" + encodeURIComponent(month),
      { redirect: "follow" }
    );
    const text = await res.text();
    const data = JSON.parse(text);
    if (!data.success || !data.punches) return {};

    // Filter to today's punches only
    const todayPunches = data.punches.filter(p => p.date === todayISO);

    // For each employee find their last action today
    const status = {};
    employeeNames.forEach(name => {
      const empPunches = todayPunches.filter(p => p.employee === name);
      if (empPunches.length === 0) return;

      // Last punch determines status
      const last = empPunches[empPunches.length - 1];
      if (last.clockIn && !last.clockOut) {
        status[name] = "IN";
        status[name + "_in"] = last.clockIn;
      } else if (last.lunch && !last.clockOut) {
        status[name] = "LUNCH";
      } else {
        status[name] = null;
      }
    });

    return status;
  } catch (err) {
    console.error("Failed to load today status:", err);
    return {};
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatTimestamp(date) {
  return date.toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

function toLocalISO(d) {
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

function getTimeStr(d) {
  return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
}

function getDayName(d) {
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}

function getWeekLabel(d) {
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay()+6)%7));
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  return mon.toLocaleDateString("en-US",{month:"short",day:"numeric"}) + " – " + sun.toLocaleDateString("en-US",{month:"short",day:"numeric"});
}

async function logToSheet(payload) {
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ─── LIVE CLOCK ──────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={st.clockBlock}>
      <div style={st.clockTime}>{formatTime(now)}</div>
      <div style={st.clockDate}>{formatDate(now)}</div>
    </div>
  );
}

// ─── PIN PAD ─────────────────────────────────────────────────────────────────
function PinPad({ employee, onSuccess, onBack, onActivity }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const press = (digit) => {
    onActivity();
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      const empPin = String(employee.pin || "").padStart(4, "0");
    if (next === empPin) {
        setTimeout(() => onSuccess(), 150);
      } else {
        setTimeout(() => { setError(true); setPin(""); }, 400);
      }
    }
  };

  const del = () => { onActivity(); setPin(p => p.slice(0,-1)); setError(false); };

  const dots = Array(4).fill(0).map((_,i) => (
    <div key={i} style={{ ...st.pinDot, background: i < pin.length ? (error ? "#FF5A5A" : "#00C896") : "rgba(255,255,255,0.1)" }} />
  ));

  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div style={st.pinWrap}>
      <div style={st.pinEmpName}>{employee.name}</div>
      <div style={st.pinSubtitle}>Enter your PIN</div>
      <div style={st.pinDots}>{dots}</div>
      {error && <div style={st.pinError}>Incorrect PIN — try again</div>}
      <div style={st.pinGrid}>
        {keys.map((k, i) => k === "" ? (
          <div key={i} />
        ) : k === "⌫" ? (
          <button key={i} style={st.pinKeyDel} onClick={del}>⌫</button>
        ) : (
          <button key={i} style={st.pinKey} onClick={() => press(k)}>{k}</button>
        ))}
      </div>
      <button style={st.backBtn} onClick={onBack}>← Back</button>
    </div>
  );
}

// ─── CONFIRM MODAL ───────────────────────────────────────────────────────────
function ConfirmModal({ action, employee, timestamp, onConfirm, onCancel }) {
  const isClockIn = action === "CLOCK_IN";
  const isLunch   = action === "LUNCH";
  const label     = isClockIn ? "Clock In" : isLunch ? "Log Lunch" : "Clock Out";
  const color     = isClockIn ? "#00C896"  : isLunch ? "#F5A623"  : "#FF5A5A";
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onConfirm();
  };

  return (
    <div style={st.overlay}>
      <div style={st.modal}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:4, background:color }} />
        <p style={st.modalEmp}>{employee}</p>
        <p style={st.modalAction}>Confirm {label}?</p>
        <p style={st.modalTime}>{formatTimestamp(timestamp)}</p>
        <div style={st.modalButtons}>
          <button style={st.cancelBtn} onClick={onCancel} disabled={submitting}>Cancel</button>
          <button style={{ ...st.confirmBtn, background:color, opacity:submitting?0.5:1 }} onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Logging..." : "Confirm " + label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function Toast({ message, color, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  return (
    <div style={{ ...st.toast, borderLeft:"4px solid " + color }}>
      <span style={{ color }}>{message}</span>
    </div>
  );
}

// ─── CLOCK SCREEN ────────────────────────────────────────────────────────────
function ClockScreen({ employee, shiftStatus, setShiftStatus, onLogout, onActivity }) {
  const [pending, setPending]       = useState(null);
  const [toast, setToast]           = useState(null);
  const [syncQueue, setSyncQueue]   = useState([]);

  const showToast = (msg, color="#00C896") => setToast({ message:msg, color });

  const status   = shiftStatus[employee.name] || null;
  const isIn     = status === "IN";
  const isLunch  = status === "LUNCH";
  const isOut    = !status;

  const handleAction = (action) => {
    onActivity();
    if (action === "CLOCK_IN" && isIn)    { showToast("Already clocked in", "#FF5A5A"); return; }
    if (action === "CLOCK_OUT" && isOut)  { showToast("Not clocked in", "#FF5A5A"); return; }
    if (action === "LUNCH" && !isIn)      { showToast("Not clocked in", "#FF5A5A"); return; }
    setPending({ action, employee:employee.name, timestamp:new Date() });
  };

  const handleConfirm = async () => {
    const { action, employee:empName, timestamp } = pending;
    const d = timestamp;
    const timeStr  = getTimeStr(d);
    const dateISO  = toLocalISO(d);
    const dayName  = getDayName(d);

    const newStatus = { ...shiftStatus };
    if (action === "CLOCK_IN")  { newStatus[empName] = "IN";   newStatus[empName+"_in"] = timeStr; }
    else if (action === "LUNCH"){ newStatus[empName] = "LUNCH"; }
    else                        { newStatus[empName] = null; delete newStatus[empName+"_in"]; }
    setShiftStatus(newStatus);

    const payload = {
      action:       "LOG_PUNCH",
      employee:     empName,
      date:         dateISO,
      day:          dayName,
      week:         getWeekLabel(d),
      clockIn:      action === "CLOCK_IN"  ? timeStr : (shiftStatus[empName+"_in"] || ""),
      clockOut:     action === "CLOCK_OUT" ? timeStr : "",
      lunch:        action === "LUNCH"     ? timeStr : "",
      scheduledIn:  "",
      scheduledOut: "",
      manual:       false,
      exceptions:   [],
    };

    const result = await logToSheet(payload);
    if (!result.success) {
      setSyncQueue(q => [...q, payload]);
      showToast("Saved — will sync when online", "#F5A623");
    } else {
      const labels = { CLOCK_IN:"Clocked In ✓", LUNCH:"Lunch Logged ✓", CLOCK_OUT:"Clocked Out ✓" };
      showToast(labels[action]);
    }

    setPending(null);
    onActivity();
  };

  const actions = [
    { action:"CLOCK_IN",  label:"Clock In",   icon:"▶", active:isOut,        bg:"#00C896", tc:"#0D0D0F" },
    { action:"LUNCH",     label:"Log Lunch",  icon:"☕", active:isIn,         bg:"#F5A623", tc:"#0D0D0F" },
    { action:"CLOCK_OUT", label:"Clock Out",  icon:"■", active:isIn||isLunch, bg:"#FF5A5A", tc:"#fff"    },
  ];

  return (
    <div style={st.clockScreenWrap}>
      {/* Employee header */}
      <div style={st.empHeader}>
        <div style={st.empAvatar}>{employee.name.charAt(0)}</div>
        <div>
          <div style={st.empName}>{employee.name}</div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ ...st.statusDot, background: isIn?"#00C896":isLunch?"#F5A623":"#333" }} />
            <span style={st.statusText}>{isIn?"Clocked In":isLunch?"On Lunch":"Not Clocked In"}</span>
          </div>
        </div>
        <button style={st.logoutBtn} onClick={onLogout}>Log Out</button>
      </div>

      {/* Actions */}
      <div style={st.actions}>
        {actions.map(({ action, label, icon, active, bg, tc }) => (
          <button key={action} onClick={() => handleAction(action)} disabled={!active}
            style={{ ...st.actionBtn, background:active?bg:"#1A1A1E", color:active?tc:"#3A3A3A", cursor:active?"pointer":"not-allowed" }}>
            <span style={{ fontSize:13 }}>{icon}</span> {label}
          </button>
        ))}
      </div>

      {syncQueue.length > 0 && (
        <div style={st.syncWarning}>⚠ {syncQueue.length} punch{syncQueue.length>1?"es":""} pending sync…</div>
      )}

      {pending && <ConfirmModal {...pending} onConfirm={handleConfirm} onCancel={()=>{ setPending(null); onActivity(); }} />}
      {toast   && <Toast message={toast.message} color={toast.color} onDone={()=>setToast(null)} />}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function TealuxClock() {
  // screen: "home" | "pin" | "clock"
  const [screen, setScreen]           = useState("home");
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [shiftStatus, setShiftStatus] = useState({});
  const [employees, setEmployees]     = useState(FALLBACK_EMPLOYEES);
  const [loadingEmps, setLoadingEmps] = useState(true);

  useEffect(() => {
    fetchEmployees().then(async emps => {
      if (emps && emps.length > 0) setEmployees(emps);
      // Reconstruct shift status from today's sheet data
      const names = emps.map(e => e.name);
      const todayStatus = await fetchTodayStatus(names);
      if (Object.keys(todayStatus).length > 0) {
        setShiftStatus(todayStatus);
      }
      setLoadingEmps(false);
    });
  }, []);
  const [countdown, setCountdown]     = useState(AUTO_LOGOUT_SECS);
  const timerRef                      = useRef(null);
  const countRef                      = useRef(null);

  const logout = useCallback(() => {
    clearTimeout(timerRef.current);
    clearInterval(countRef.current);
    setScreen("home");
    setSelectedEmp(null);
    setCountdown(AUTO_LOGOUT_SECS);
  }, []);

  const resetTimer = useCallback(() => {
    if (screen !== "clock") return;
    clearTimeout(timerRef.current);
    clearInterval(countRef.current);
    setCountdown(AUTO_LOGOUT_SECS);

    let c = AUTO_LOGOUT_SECS;
    countRef.current = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) {
        clearInterval(countRef.current);
      }
    }, 1000);

    timerRef.current = setTimeout(() => {
      logout();
    }, AUTO_LOGOUT_SECS * 1000);
  }, [screen, logout]);

  // Start timer when clock screen opens
  useEffect(() => {
    if (screen === "clock") {
      resetTimer();
    }
    return () => {
      clearTimeout(timerRef.current);
      clearInterval(countRef.current);
    };
  }, [screen]);

  const selectEmployee = (emp) => {
    setSelectedEmp(emp);
    setScreen("pin");
  };

  const onPinSuccess = () => {
    setScreen("clock");
  };

  return (
    <div style={st.root} onClick={screen === "clock" ? resetTimer : undefined}>
      <div style={st.blob1} />
      <div style={st.blob2} />

      {/* Logo */}
      <div style={st.header}>
        <div style={st.logo}>
          <span style={st.logoT}>T</span>
          <span style={st.logoRest}>EALUX</span>
        </div>
        <span style={st.headerSub}>Team Time Clock</span>
      </div>

      {/* Live Clock */}
      <LiveClock />

      {/* ── HOME: Employee select ── */}
      {screen === "home" && (
        <div style={st.section}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <p style={{ ...st.label, marginBottom:0 }}>Who are you?</p>
            {loadingEmps && <span style={{ fontSize:11, color:"#444", letterSpacing:1 }}>syncing…</span>}
          </div>
          <div style={st.empGrid}>
            {employees.map(emp => {
              const s = shiftStatus[emp.name];
              const dot = s==="IN"?"#00C896":s==="LUNCH"?"#F5A623":"#444";
              return (
                <button key={emp.name} style={st.empBtn} onClick={() => selectEmployee(emp)}>
                  <span style={{ ...st.empDot, background:dot }} />
                  {emp.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PIN: Enter PIN ── */}
      {screen === "pin" && selectedEmp && (
        <PinPad
          employee={selectedEmp}
          onSuccess={onPinSuccess}
          onBack={() => { setScreen("home"); setSelectedEmp(null); }}
          onActivity={() => {}}
        />
      )}

      {/* ── CLOCK: Actions ── */}
      {screen === "clock" && selectedEmp && (
        <>
          <ClockScreen
            employee={selectedEmp}
            shiftStatus={shiftStatus}
            setShiftStatus={setShiftStatus}
            onLogout={logout}
            onActivity={resetTimer}
          />
          {/* Auto-logout countdown */}
          <div style={st.countdownBar}>
            <div style={{ ...st.countdownFill, width: (countdown / AUTO_LOGOUT_SECS * 100) + "%", background: countdown <= 3 ? "#FF5A5A" : "#00C896" }} />
            <span style={st.countdownLabel}>Auto logout in {countdown}s</span>
          </div>
        </>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(TealuxClock));

// ─── STYLES ──────────────────────────────────────────────────────────────────
const st = {
  root:          { minHeight:"100vh", background:"#0D0D0F", color:"#F0EDE6", fontFamily:"'Courier New',monospace", display:"flex", flexDirection:"column", alignItems:"center", padding:"32px 20px 80px", position:"relative", overflow:"hidden" },
  blob1:         { position:"absolute", top:-120, right:-100, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(0,200,150,0.07) 0%,transparent 70%)", pointerEvents:"none" },
  blob2:         { position:"absolute", bottom:-80, left:-80, width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle,rgba(245,166,35,0.06) 0%,transparent 70%)", pointerEvents:"none" },
  header:        { display:"flex", flexDirection:"column", alignItems:"center", marginBottom:24 },
  logo:          { display:"flex", alignItems:"baseline", gap:2 },
  logoT:         { fontSize:42, fontWeight:900, color:"#00C896", fontFamily:"Georgia,serif", letterSpacing:-2 },
  logoRest:      { fontSize:28, fontWeight:700, letterSpacing:6, color:"#F0EDE6" },
  headerSub:     { fontSize:11, letterSpacing:4, color:"#555", textTransform:"uppercase", marginTop:4 },
  clockBlock:    { textAlign:"center", marginBottom:32, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 40px" },
  clockTime:     { fontSize:48, fontWeight:700, letterSpacing:2, color:"#F0EDE6", fontVariantNumeric:"tabular-nums" },
  clockDate:     { fontSize:13, color:"#555", marginTop:6, letterSpacing:1 },
  section:       { width:"100%", maxWidth:480, marginBottom:24 },
  label:         { fontSize:11, color:"#555", letterSpacing:3, textTransform:"uppercase", marginBottom:12 },
  empGrid:       { display:"flex", flexWrap:"wrap", gap:10 },
  empBtn:        { display:"flex", alignItems:"center", gap:8, padding:"14px 22px", borderRadius:10, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:"#AAA", fontSize:15, cursor:"pointer", transition:"all 0.15s" },
  empDot:        { width:8, height:8, borderRadius:"50%" },
  // PIN pad
  pinWrap:       { display:"flex", flexDirection:"column", alignItems:"center", width:"100%", maxWidth:320 },
  pinEmpName:    { fontSize:22, fontWeight:700, color:"#F0EDE6", marginBottom:4 },
  pinSubtitle:   { fontSize:13, color:"#555", marginBottom:24, letterSpacing:1 },
  pinDots:       { display:"flex", gap:16, marginBottom:12 },
  pinDot:        { width:16, height:16, borderRadius:"50%", transition:"background 0.15s" },
  pinError:      { fontSize:12, color:"#FF5A5A", marginBottom:12 },
  pinGrid:       { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, width:"100%", marginBottom:20 },
  pinKey:        { padding:"18px", borderRadius:12, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"#F0EDE6", fontSize:22, fontWeight:700, cursor:"pointer", fontFamily:"'Courier New',monospace" },
  pinKeyDel:     { padding:"18px", borderRadius:12, background:"rgba(255,90,90,0.08)", border:"1px solid rgba(255,90,90,0.2)", color:"#FF5A5A", fontSize:18, cursor:"pointer", fontFamily:"'Courier New',monospace" },
  backBtn:       { fontSize:12, color:"#555", background:"transparent", border:"none", cursor:"pointer", letterSpacing:1, fontFamily:"'Courier New',monospace" },
  // Clock screen
  clockScreenWrap: { width:"100%", maxWidth:480 },
  empHeader:     { display:"flex", alignItems:"center", gap:14, marginBottom:28, padding:"16px 20px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14 },
  empAvatar:     { width:44, height:44, borderRadius:"50%", background:"rgba(0,200,150,0.12)", border:"1px solid rgba(0,200,150,0.2)", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"#00C896", flexShrink:0 },
  empName:       { fontSize:17, fontWeight:700, color:"#F0EDE6", marginBottom:4 },
  statusDot:     { width:7, height:7, borderRadius:"50%" },
  statusText:    { fontSize:12, color:"#666" },
  logoutBtn:     { marginLeft:"auto", fontSize:11, color:"#555", background:"transparent", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, padding:"6px 12px", cursor:"pointer", fontFamily:"'Courier New',monospace" },
  actions:       { display:"flex", flexDirection:"column", gap:12 },
  actionBtn:     { display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"20px 24px", borderRadius:12, fontSize:17, fontWeight:700, letterSpacing:1, border:"none", transition:"opacity 0.15s", fontFamily:"'Courier New',monospace" },
  syncWarning:   { marginTop:16, fontSize:12, color:"#F5A623", padding:"8px 16px", background:"rgba(245,166,35,0.08)", borderRadius:8, border:"1px solid rgba(245,166,35,0.2)" },
  // Countdown bar
  countdownBar:  { position:"fixed", bottom:0, left:0, right:0, height:36, background:"#111114", borderTop:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", overflow:"hidden" },
  countdownFill: { position:"absolute", left:0, top:0, bottom:0, transition:"width 1s linear, background 0.3s" },
  countdownLabel:{ position:"relative", zIndex:1, fontSize:11, color:"#555", letterSpacing:2, textTransform:"uppercase", margin:"0 auto" },
  // Modal
  overlay:       { position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
  modal:         { background:"#17171A", border:"1px solid rgba(255,255,255,0.1)", borderRadius:20, padding:"40px 32px", maxWidth:340, width:"90%", display:"flex", flexDirection:"column", alignItems:"center", position:"relative", overflow:"hidden" },
  modalEmp:      { fontSize:22, fontWeight:700, color:"#F0EDE6", marginBottom:4, marginTop:0 },
  modalAction:   { fontSize:16, color:"#888", marginBottom:12, marginTop:0 },
  modalTime:     { fontSize:13, color:"#555", marginBottom:28, textAlign:"center", marginTop:0 },
  modalButtons:  { display:"flex", gap:12, width:"100%" },
  cancelBtn:     { flex:1, padding:14, borderRadius:10, background:"transparent", border:"1px solid rgba(255,255,255,0.12)", color:"#888", fontSize:14, cursor:"pointer", fontFamily:"'Courier New',monospace" },
  confirmBtn:    { flex:2, padding:14, borderRadius:10, border:"none", color:"#0D0D0F", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Courier New',monospace" },
  toast:         { position:"fixed", bottom:48, left:"50%", transform:"translateX(-50%)", background:"#1A1A1E", borderRadius:10, padding:"14px 24px", fontSize:14, zIndex:200, boxShadow:"0 8px 32px rgba(0,0,0,0.4)", whiteSpace:"nowrap" },
};
