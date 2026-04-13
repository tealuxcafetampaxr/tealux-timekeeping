const { useState, useEffect, useCallback, useRef } = React;


const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzra1hhtBCp4sZ_4Jaxuy26o8-NyB-xm4hDIjPWhKqTMRDXac3PclYUJn8mIakKXMR9VQ/exec";

// ── SHEETS API ───────────────────────────────────────────────────────────────
async function sheetPost(payload) {
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error("Sheet write failed:", err);
    return { success: false, error: err.toString() };
  }
}

async function sheetGet(params) {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${APPS_SCRIPT_URL}?${qs}`);
    return await res.json();
  } catch (err) {
    console.error("Sheet read failed:", err);
    return { success: false, error: err.toString() };
  }
}

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const BASE_SHIFTS = {
  OPEN:  { label: "Open",  short: "O", color: "#00C896", bg: "rgba(0,200,150,0.15)",  border: "rgba(0,200,150,0.4)",  start: "11:00", end: "16:00" },
  CLOSE: { label: "Close", short: "C", color: "#7EC8E3", bg: "rgba(126,200,227,0.15)", border: "rgba(126,200,227,0.4)", start: "16:00", end: "21:00" },
  MOD:   { label: "Mgr",   short: "M", color: "#F5A623", bg: "rgba(245,166,35,0.15)",  border: "rgba(245,166,35,0.4)",  start: "11:00", end: "21:00" },
};

const CUSTOM_COLORS = [
  { color: "#C084FC", bg: "rgba(192,132,252,0.15)", border: "rgba(192,132,252,0.4)" },
  { color: "#F87171", bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.4)" },
];

const CYCLE_KEYS = ["OFF", "OPEN", "CLOSE", "MOD", "CUSTOM1", "CUSTOM2"];

const EXCEPTION_LABELS = {
  LATE_IN:     { label: "Late In",      color: "#F5A623",  critical: false },
  EARLY_IN:    { label: "Early In",     color: "#7EC8E3",  critical: false },
  LATE_OUT:    { label: "Late Out",     color: "#F5A623",  critical: false },
  EARLY_OUT:   { label: "Early Out",    color: "#C084FC",  critical: false },
  NO_CLOCKIN:  { label: "No Clock-In",  color: "#FF5A5A",  critical: true  },
  NO_CLOCKOUT: { label: "No Clock-Out", color: "#FF5A5A",  critical: true  },
};

const CRITICAL_TYPES = ["NO_CLOCKIN", "NO_CLOCKOUT"];
const TWO_WEEKS_MS   = 14 * 24 * 60 * 60 * 1000;

// ── INIT DATA ─────────────────────────────────────────────────────────────────
const INIT_EMPLOYEES = [
  { id: 1, name: "Kha",        position: "Manager", rate: 18.00, custom: [{ label: "Mid",     start: "12:00", end: "17:00" }, { label: "Split",   start: "11:00", end: "15:00" }] },
  { id: 2, name: "Employee 2", position: "Barista", rate: 13.00, custom: [{ label: "Shift A", start: "12:00", end: "17:00" }, { label: "Shift B", start: "15:00", end: "19:00" }] },
  { id: 3, name: "Employee 3", position: "Crew",    rate: 12.00, custom: [{ label: "Shift A", start: "12:00", end: "17:00" }, { label: "Shift B", start: "15:00", end: "19:00" }] },
];

const today = new Date();
function daysAgo(n) {
  const d = new Date(today); d.setDate(d.getDate() - n);
  return toLocalISO(d);
}

const INIT_PUNCHES = [
  { id: 1,  employee: "Kha",        date: daysAgo(6), day: "Mon", clockIn: "11:02", clockOut: "16:05", lunch: "13:00", scheduledIn: "11:00", scheduledOut: "16:00", exceptions: [],           manual: false },
  { id: 2,  employee: "Kha",        date: daysAgo(5), day: "Tue", clockIn: "10:58", clockOut: "16:02", lunch: null,    scheduledIn: "11:00", scheduledOut: "16:00", exceptions: ["EARLY_IN"], manual: false },
  { id: 3,  employee: "Kha",        date: daysAgo(4), day: "Wed", clockIn: "11:00", clockOut: "16:34", lunch: "13:15", scheduledIn: "11:00", scheduledOut: "16:00", exceptions: ["LATE_OUT"], manual: false },
  { id: 4,  employee: "Kha",        date: daysAgo(3), day: "Thu", clockIn: "11:05", clockOut: "16:00", lunch: null,    scheduledIn: "11:00", scheduledOut: "16:00", exceptions: [],           manual: false },
  { id: 5,  employee: "Kha",        date: daysAgo(1), day: "Sat", clockIn: "11:00", clockOut: "15:58", lunch: null,    scheduledIn: "11:00", scheduledOut: "16:00", exceptions: [],           manual: false },
  { id: 6,  employee: "Employee 2", date: daysAgo(5), day: "Tue", clockIn: "16:12", clockOut: "21:00", lunch: null,    scheduledIn: "16:00", scheduledOut: "21:00", exceptions: ["LATE_IN"],  manual: false },
  { id: 7,  employee: "Employee 2", date: daysAgo(4), day: "Wed", clockIn: "16:00", clockOut: "20:55", lunch: null,    scheduledIn: "16:00", scheduledOut: "21:00", exceptions: ["EARLY_OUT"],manual: false },
  { id: 8,  employee: "Employee 2", date: daysAgo(3), day: "Thu", clockIn: "16:01", clockOut: "21:00", lunch: null,    scheduledIn: "16:00", scheduledOut: "21:00", exceptions: [],           manual: false },
  { id: 9,  employee: "Employee 3", date: daysAgo(6), day: "Mon", clockIn: null,    clockOut: null,    lunch: null,    scheduledIn: "11:00", scheduledOut: "16:00", exceptions: ["NO_CLOCKIN"],manual: false },
  { id: 10, employee: "Employee 3", date: daysAgo(2), day: "Fri", clockIn: "11:00", clockOut: "16:00", lunch: "13:00", scheduledIn: "11:00", scheduledOut: "16:00", exceptions: [],           manual: false },
  { id: 11, employee: "Employee 3", date: daysAgo(1), day: "Sat", clockIn: "11:03", clockOut: null,    lunch: null,    scheduledIn: "11:00", scheduledOut: "16:00", exceptions: ["NO_CLOCKOUT"],manual: false},
];

// ── HELPERS ──────────────────────────────────────────────────────────────────
function toLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fmt12(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function calcHoursNum(inTime, outTime) {
  if (!inTime || !outTime) return 0;
  const [ih, im] = inTime.split(":").map(Number);
  const [oh, om] = outTime.split(":").map(Number);
  return Math.max(0, ((oh * 60 + om) - (ih * 60 + im)) / 60);
}

function calcHours(inTime, outTime) {
  const h = calcHoursNum(inTime, outTime);
  if (h === 0) return null;
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return mm === 0 ? `${hh}h` : `${hh}h ${mm}m`;
}

function roundHours(h) { return Math.round(h); }

function buildEmptyWeek(employees) {
  const grid = {};
  employees.forEach(e => { grid[e.id] = {}; DAYS.forEach(d => { grid[e.id][d] = "OFF"; }); });
  return grid;
}

function getWeekDates(offset = 0) {
  const t = new Date();
  const mon = new Date(t);
  mon.setDate(t.getDate() - ((t.getDay() + 6) % 7) + offset * 7);
  return DAYS.map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}

function getWeekLabel(offset = 0) {
  const d = getWeekDates(offset);
  return `${d[0].toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${d[6].toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`;
}

function getWeekISO(offset = 0) { return getWeekDates(offset).map(d => toLocalISO(d)); }

function excKey(punchId, excType) { return `${punchId}__${excType}`; }

// ── SHIFT BLOCK ──────────────────────────────────────────────────────────────
function ShiftBlock({ shiftKey, emp, onClick, baseShifts }) {
  const bs = baseShifts || BASE_SHIFTS;
  if (shiftKey === "OFF") return (
    <div onClick={onClick} style={{ ...blk.block, background:"transparent", border:"1px solid rgba(255,255,255,0.05)", cursor:"pointer" }}>
      <span style={{ color:"#2A2A2E", fontSize:18, fontWeight:700 }}>–</span>
    </div>
  );
  let label, short, color, bg, border, time;
  if (shiftKey === "CUSTOM1" || shiftKey === "CUSTOM2") {
    const idx = shiftKey === "CUSTOM1" ? 0 : 1;
    const cc = CUSTOM_COLORS[idx], c = emp.custom[idx];
    label = c.label; short = c.label.charAt(0).toUpperCase();
    color = cc.color; bg = cc.bg; border = cc.border;
    time = `${fmt12(c.start)} – ${fmt12(c.end)}`;
  } else {
    ({ label, short, color, bg, border } = bs[shiftKey]);
    time = `${fmt12(bs[shiftKey].start)} – ${fmt12(bs[shiftKey].end)}`;
  }
  return (
    <div onClick={onClick} title={`${label} · ${time}`} style={{ ...blk.block, background:bg, border:`1px solid ${border}`, color, cursor:"pointer" }}>
      <span style={{ fontSize:15, fontWeight:900 }}>{short}</span>
      <span style={{ fontSize:9, letterSpacing:1, textTransform:"uppercase", opacity:0.8 }}>{label}</span>
    </div>
  );
}

// ── DAY CARD (punch log) ─────────────────────────────────────────────────────
function DayCard({ col, punch, isToday }) {
  const hasExc = punch?.exceptions?.length > 0;
  const isCrit = punch?.exceptions?.some(e => CRITICAL_TYPES.includes(e));
  return (
    <div style={{ ...s.dayCard, ...(isToday?{border:"1px solid rgba(0,200,150,0.3)",background:"rgba(0,200,150,0.04)"}:{}), ...(isCrit?{border:"1px solid rgba(255,90,90,0.3)",background:"rgba(255,90,90,0.04)"}:{}) }}>
      <div style={s.dayCardHeader}>
        <span style={{ fontWeight:700, color:isToday?"#00C896":"#888" }}>{col.label}</span>
        <span style={{ fontSize:11, color:"#444" }}>{col.dateDisplay}</span>
      </div>
      {!punch ? <span style={{ fontSize:12, color:"#2A2A2E", marginTop:8, display:"block" }}>No shift</span> : (
        <>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <span style={{ fontSize:9, color:"#333", flex:1 }}></span>
            <span style={{ fontSize:9, color:"#333", width:62, textAlign:"center", letterSpacing:1, textTransform:"uppercase" }}>Sched</span>
            <span style={{ fontSize:9, color:"#444", width:62, textAlign:"center", letterSpacing:1, textTransform:"uppercase" }}>Actual</span>
          </div>
          <div style={s.punchRow}>
            <span style={s.punchLabel}>In</span>
            <span style={{ ...s.punchVal, color:"#444", width:62, textAlign:"center" }}>{fmt12(punch.scheduledIn)}</span>
            <span style={{ ...s.punchVal, width:62, textAlign:"center", color: punch.clockIn?(punch.exceptions.includes("LATE_IN")?"#F5A623":punch.exceptions.includes("EARLY_IN")?"#7EC8E3":"#00C896"):"#FF5A5A" }}>
              {punch.clockIn ? fmt12(punch.clockIn) : "—"}{punch.manual&&punch.clockIn?<span style={{fontSize:9,color:"#F5A623",marginLeft:2}}>M</span>:null}
            </span>
          </div>
          {punch.lunch && <div style={s.punchRow}><span style={s.punchLabel}>Lunch</span><span style={{ ...s.punchVal, color:"#2A2A2E", width:62, textAlign:"center" }}>—</span><span style={{ ...s.punchVal, color:"#F5A623", width:62, textAlign:"center" }}>{fmt12(punch.lunch)}</span></div>}
          <div style={s.punchRow}>
            <span style={s.punchLabel}>Out</span>
            <span style={{ ...s.punchVal, color:"#444", width:62, textAlign:"center" }}>{fmt12(punch.scheduledOut)}</span>
            <span style={{ ...s.punchVal, width:62, textAlign:"center", color: punch.clockOut?(punch.exceptions.includes("LATE_OUT")?"#F5A623":punch.exceptions.includes("EARLY_OUT")?"#C084FC":"#7EC8E3"):"#FF5A5A" }}>
              {punch.clockOut ? fmt12(punch.clockOut) : "—"}{punch.manual&&punch.clockOut?<span style={{fontSize:9,color:"#F5A623",marginLeft:2}}>M</span>:null}
            </span>
          </div>
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", marginTop:8, paddingTop:8 }}>
            <div style={s.punchRow}><span style={s.punchLabel}>Total</span><span style={{ ...s.punchVal, color:"#F0EDE6", fontWeight:700, marginLeft:"auto" }}>{calcHours(punch.clockIn,punch.clockOut)||"—"}</span></div>
          </div>
          {hasExc && <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:4 }}>
            {punch.exceptions.map(e => { const ex = EXCEPTION_LABELS[e]; return ex?(<span key={e} style={{ fontSize:10, color:ex.color, background:`${ex.color}18`, padding:"2px 6px", borderRadius:4, fontWeight:700 }}>{ex.label}</span>):null; })}
          </div>}
        </>
      )}
    </div>
  );
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────────
function Overview({ employees, punches }) {
  const critical = punches.filter(p => p.exceptions.some(e => CRITICAL_TYPES.includes(e)));
  const minor    = punches.filter(p => p.exceptions.some(e => !CRITICAL_TYPES.includes(e)));
  return (
    <div style={s.page}>
      <h1 style={s.pageTitle}>Overview</h1>
      <div style={s.cards}>
        <div style={s.card}><p style={s.cardLabel}>Employees</p><p style={s.cardVal}>{employees.length}</p></div>
        <div style={{ ...s.card, borderColor:critical.length>0?"rgba(255,90,90,0.3)":undefined }}>
          <p style={s.cardLabel}>Critical Exceptions</p>
          <p style={{ ...s.cardVal, color:critical.length>0?"#FF5A5A":"#00C896" }}>{critical.length}</p>
        </div>
        <div style={s.card}><p style={s.cardLabel}>Minor Exceptions</p><p style={{ ...s.cardVal, color:minor.length>0?"#F5A623":"#00C896" }}>{minor.length}</p></div>
        <div style={s.card}><p style={s.cardLabel}>Total Punches</p><p style={s.cardVal}>{punches.length}</p></div>
      </div>
      {critical.length > 0 && (
        <div style={s.alertBox}>
          <p style={s.alertTitle}>⚠ Critical Exceptions — Action Required</p>
          {critical.map(p => (
            <div key={p.id} style={s.alertRow}>
              <span style={{ color:"#FF5A5A", fontWeight:700 }}>{p.employee}</span>
              <span style={{ color:"#888", margin:"0 8px" }}>{p.day} {p.date}</span>
              <span style={{ color:"#555" }}>{p.exceptions.filter(e=>CRITICAL_TYPES.includes(e)).join(", ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── EMPLOYEES ────────────────────────────────────────────────────────────────
function Employees({ employees, setEmployees }) {
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing]   = useState({});
  const [savedId, setSavedId]   = useState(null);
  const [newEmp, setNewEmp]     = useState({ name:"", position:"", rate:"" });

  const toggle = (id) => setExpanded(p => ({ ...p, [id]:!p[id] }));

  const startEdit = (emp) => setEditing(p => ({ ...p, [emp.id]:{ name:emp.name, position:emp.position, rate:emp.rate } }));

  const saveEdit = (id) => {
    const e = editing[id]; if (!e) return;
    if (!e.name.trim()) { alert("Name cannot be empty."); return; }
    if (employees.some(emp => emp.id !== id && emp.name.toLowerCase() === e.name.trim().toLowerCase())) { alert(`"${e.name.trim()}" already exists.`); return; }
    setEmployees(p => p.map(emp => emp.id===id ? { ...emp, name:e.name.trim(), position:e.position, rate:e.rate!==""&&!isNaN(parseFloat(e.rate))?parseFloat(e.rate):emp.rate } : emp));
    setEditing(p => { const n={...p}; delete n[id]; return n; });
    setSavedId(id); setTimeout(()=>setSavedId(null), 2000);
  };

  const cancelEdit = (id) => setEditing(p => { const n={...p}; delete n[id]; return n; });

  const remove = (id, name) => {
    if (!window.confirm(`Remove ${name}? This cannot be undone.`)) return;
    setEmployees(p => p.filter(e => e.id!==id));
    setExpanded(p => { const n={...p}; delete n[id]; return n; });
  };

  const add = () => {
    if (!newEmp.name.trim()) return;
    if (employees.some(e => e.name.toLowerCase()===newEmp.name.trim().toLowerCase())) { alert(`"${newEmp.name.trim()}" already exists.`); return; }
    setEmployees(p => [...p, { id:Date.now(), name:newEmp.name.trim(), position:newEmp.position.trim()||"Crew", rate:newEmp.rate!==""&&!isNaN(parseFloat(newEmp.rate))?parseFloat(newEmp.rate):0, custom:[{label:"Shift A",start:"11:00",end:"15:00"},{label:"Shift B",start:"15:00",end:"19:00"}] }]);
    setNewEmp({ name:"", position:"", rate:"" });
  };

  return (
    <div style={s.page}>
      <h1 style={s.pageTitle}>Employees</h1>
      <div style={s.addEmpForm}>
        <p style={s.sectionLabel}>Add New Employee</p>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <input style={{ ...s.input, flex:2, minWidth:120 }} placeholder="Full name" value={newEmp.name} onChange={e=>setNewEmp(p=>({...p,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&add()} />
          <input style={{ ...s.input, flex:2, minWidth:120 }} placeholder="Position" value={newEmp.position} onChange={e=>setNewEmp(p=>({...p,position:e.target.value}))} />
          <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
            <span style={{ position:"absolute", left:12, color:"#555", fontSize:13 }}>$</span>
            <input style={{ ...s.input, width:90, paddingLeft:22 }} placeholder="Rate/hr" value={newEmp.rate} type="number" min="0" step="0.25" onChange={e=>setNewEmp(p=>({...p,rate:e.target.value}))} />
          </div>
          <button style={s.addBtn} onClick={add}>+ Add Employee</button>
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {employees.map(emp => {
          const isOpen = expanded[emp.id], isEdit = !!editing[emp.id], ed = editing[emp.id]||{};
          return (
            <div key={emp.id} style={{ ...s.empCard, ...(isOpen?s.empCardOpen:{}) }}>
              <div style={s.empCardHeader} onClick={()=>!isEdit&&toggle(emp.id)}>
                <div style={{ display:"flex", alignItems:"center", gap:12, flex:1 }}>
                  <span style={s.empAvatar}>{emp.name.charAt(0)}</span>
                  <div><span style={s.empCardName}>{emp.name}</span><span style={s.empCardPos}>{emp.position}</span></div>
                </div>
                <span style={{ color:"#444", fontSize:14, transition:"transform 0.2s", transform:isOpen?"rotate(180deg)":"rotate(0)" }}>▾</span>
              </div>
              {isOpen && (
                <div style={s.empCardBody}>
                  {isEdit ? (
                    <div>
                      <p style={s.sectionLabel}>Editing {emp.name}</p>
                      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
                        <div style={{ display:"flex", flexDirection:"column", gap:4, flex:2, minWidth:120 }}>
                          <label style={s.fieldLabel}>Name</label>
                          <input style={s.input} value={ed.name} onChange={e=>setEditing(p=>({...p,[emp.id]:{...ed,name:e.target.value}}))} />
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4, flex:2, minWidth:120 }}>
                          <label style={s.fieldLabel}>Position</label>
                          <input style={s.input} value={ed.position} onChange={e=>setEditing(p=>({...p,[emp.id]:{...ed,position:e.target.value}}))} />
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4, minWidth:100 }}>
                          <label style={s.fieldLabel}>Rate / hr</label>
                          <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
                            <span style={{ position:"absolute", left:12, color:"#555", fontSize:13 }}>$</span>
                            <input style={{ ...s.input, width:90, paddingLeft:22 }} type="number" min="0" step="0.25" value={ed.rate} onChange={e=>setEditing(p=>({...p,[emp.id]:{...ed,rate:e.target.value}}))} />
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          <button style={s.saveBtn} onClick={()=>saveEdit(emp.id)}>Save</button>
                          <button style={s.ghostBtn} onClick={()=>cancelEdit(emp.id)}>Cancel</button>
                          {savedId===emp.id&&<span style={{ fontSize:11, color:"#00C896" }}>✓ Saved</span>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display:"flex", gap:32, flexWrap:"wrap", marginBottom:16 }}>
                        <div style={s.detailItem}><span style={s.fieldLabel}>Position</span><span style={s.detailVal}>{emp.position||"—"}</span></div>
                        <div style={s.detailItem}><span style={s.fieldLabel}>Hourly Rate</span><span style={{ ...s.detailVal, color:"#00C896" }}>${Number(emp.rate).toFixed(2)}/hr</span></div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button style={s.ghostBtn} onClick={e=>{e.stopPropagation();startEdit(emp);}}>Edit</button>
                        <button style={s.deleteBtn} onClick={e=>{e.stopPropagation();remove(emp.id,emp.name);}}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── SCHEDULE ─────────────────────────────────────────────────────────────────
function Schedule({ employees, setEmployees, baseShifts, setBaseShifts }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedules, setSchedules]   = useState({ 0:buildEmptyWeek(employees) });
  const weekDates = getWeekDates(weekOffset);
  const todayIdx  = (() => { const d=new Date().getDay(); return d===0?6:d-1; })();
  const getGrid   = () => schedules[weekOffset]||buildEmptyWeek(employees);

  const cycleShift = (empId, day) => {
    setSchedules(prev => {
      const grid = prev[weekOffset]||buildEmptyWeek(employees);
      const cur  = grid[empId]?.[day]||"OFF";
      const next = CYCLE_KEYS[(CYCLE_KEYS.indexOf(cur)+1)%CYCLE_KEYS.length];
      return { ...prev, [weekOffset]:{ ...grid, [empId]:{ ...(grid[empId]||{}), [day]:next } } };
    });
  };
  const updateCustom = (empId,idx,field,value) => setEmployees(p=>p.map(e=>{if(e.id!==empId)return e;const c=[...e.custom];c[idx]={...c[idx],[field]:value};return{...e,custom:c};}));
  const updateBase   = (key,field,value) => setBaseShifts(p=>({...p,[key]:{...p[key],[field]:value}}));
  const copyWeek     = () => { setSchedules(p=>({...p,[weekOffset+1]:JSON.parse(JSON.stringify(getGrid()))})); setWeekOffset(w=>w+1); };
  const clearWeek    = () => { if(!window.confirm("Clear all shifts for this week?"))return; setSchedules(p=>({...p,[weekOffset]:buildEmptyWeek(employees)})); };
  const getCount     = (id) => Object.values(getGrid()[id]||{}).filter(v=>v!=="OFF").length;
  const grid = getGrid();

  return (
    <div style={s.page}>
      <div style={s.schedHeader}>
        <div><h1 style={s.pageTitle}>Weekly Schedule</h1><p style={{fontSize:13,color:"#555",margin:0}}>{getWeekLabel(weekOffset)}</p></div>
        <div style={s.headerActions}>
          <button style={s.ghostBtn} onClick={()=>setWeekOffset(0)}>Today</button>
          <button style={s.navBtn} onClick={()=>setWeekOffset(w=>w-1)}>‹ Prev</button>
          <button style={s.navBtn} onClick={()=>setWeekOffset(w=>w+1)}>Next ›</button>
          <button style={s.ghostBtn} onClick={copyWeek}>Copy → Next Week</button>
          <button style={s.dangerBtn} onClick={clearWeek}>Clear Week</button>
        </div>
      </div>
      <div style={s.legend}>
        {Object.entries(baseShifts).map(([k,v])=>(<div key={k} style={s.legendItem}><span style={{...s.dot,background:v.color}}/><span style={s.legendName}>{v.label}</span><span style={s.legendTime}>{fmt12(v.start)} – {fmt12(v.end)}</span></div>))}
        {CUSTOM_COLORS.map((cc,i)=>(<div key={i} style={s.legendItem}><span style={{...s.dot,background:cc.color}}/><span style={s.legendName}>Custom {i+1}</span><span style={s.legendTime}>per employee ↓</span></div>))}
        <span style={{color:"#3A3A3E",fontSize:11,marginLeft:"auto"}}>Click to cycle</span>
      </div>
      <div style={{overflowX:"auto",marginBottom:28}}>
        <table style={{borderCollapse:"collapse",width:"100%",minWidth:680}}>
          <thead><tr>
            <th style={s.thEmp}>Employee</th>
            {DAYS.map((day,i)=>{const isToday=weekOffset===0&&i===todayIdx;return(<th key={day} style={{...s.th,...(isToday?s.thToday:{})}}><div style={{fontWeight:700}}>{day}</div><div style={{fontSize:11,color:"#444",marginTop:2}}>{weekDates[i].toLocaleDateString("en-US",{month:"numeric",day:"numeric"})}</div></th>);})}
            <th style={{padding:"10px 12px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,0.08)",fontSize:11,color:"#555",minWidth:40}}>#</th>
          </tr></thead>
          <tbody>
            {employees.map((emp,ei)=>(
              <tr key={emp.id} style={ei%2!==0?{background:"rgba(255,255,255,0.01)"}:{}}>
                <td style={s.tdEmp}>{emp.name}<span style={{fontSize:10,color:"#555",marginLeft:6}}>{emp.position}</span></td>
                {DAYS.map((day,i)=>{const isToday=weekOffset===0&&i===todayIdx;return(<td key={day} style={{padding:"6px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,0.04)",...(isToday?{background:"rgba(0,200,150,0.02)"}:{})}}><ShiftBlock shiftKey={grid[emp.id]?.[day]||"OFF"} emp={emp} onClick={()=>cycleShift(emp.id,day)} baseShifts={baseShifts}/></td>);})}
                <td style={{padding:"6px 12px",textAlign:"center",fontSize:14,borderBottom:"1px solid rgba(255,255,255,0.04)"}}><span style={{color:getCount(emp.id)>0?"#F0EDE6":"#2A2A2E",fontWeight:700}}>{getCount(emp.id)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={s.sectionLabel}>Open &amp; Close Times</p>
      <div style={{...s.customGrid,marginBottom:28}}>
        {["OPEN","CLOSE"].map(key=>{const bs=baseShifts[key];return(
          <div key={key} style={s.customCard}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{...s.dot,background:bs.color}}/><p style={{...s.customEmpName,margin:0}}>{bs.label}</p></div>
            <div style={s.customRow}>
              <span style={{fontSize:11,color:"#555",width:36}}>Start</span>
              <input type="time" style={s.timeInput} value={bs.start} onChange={e=>updateBase(key,"start",e.target.value)}/>
              <span style={{color:"#444",fontSize:11}}>–</span>
              <input type="time" style={s.timeInput} value={bs.end} onChange={e=>updateBase(key,"end",e.target.value)}/>
              <span style={{color:"#555",fontSize:11}}>{fmt12(bs.start)} – {fmt12(bs.end)}</span>
            </div>
          </div>
        );})}
      </div>
      <p style={s.sectionLabel}>Custom Shift Times</p>
      <div style={s.customGrid}>
        {employees.map(emp=>(
          <div key={emp.id} style={s.customCard}>
            <p style={s.customEmpName}>{emp.name}</p>
            {emp.custom.map((c,idx)=>{const cc=CUSTOM_COLORS[idx];return(
              <div key={idx} style={s.customRow}>
                <span style={{...s.dot,background:cc.color,flexShrink:0}}/>
                <input style={s.labelInput} value={c.label} onChange={e=>updateCustom(emp.id,idx,"label",e.target.value)} placeholder="Name"/>
                <input type="time" style={s.timeInput} value={c.start} onChange={e=>updateCustom(emp.id,idx,"start",e.target.value)}/>
                <span style={{color:"#444",fontSize:11}}>–</span>
                <input type="time" style={s.timeInput} value={c.end} onChange={e=>updateCustom(emp.id,idx,"end",e.target.value)}/>
                <span style={{color:"#555",fontSize:11}}>{fmt12(c.start)} – {fmt12(c.end)}</span>
              </div>
            );})}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PUNCH LOG ────────────────────────────────────────────────────────────────
function PunchLog({ punches, employees }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [expanded, setExpanded]     = useState({});
  const isoRange    = getWeekISO(weekOffset);
  const weekPunches = punches.filter(p=>p.date>=isoRange[0]&&p.date<=isoRange[6]);
  const todayIdx    = (() => { const d=new Date().getDay(); return d===0?6:d-1; })();
  const toggle      = (name) => setExpanded(p=>({...p,[name]:!p[name]}));
  const weekDates   = getWeekDates(weekOffset);
  const dayColumns  = weekDates.map((d,i)=>({ label:DAYS[i], date:toLocalISO(d), dateDisplay:d.toLocaleDateString("en-US",{month:"numeric",day:"numeric"}) }));

  const summaries = employees.map(emp => {
    const ep = weekPunches.filter(p=>p.employee===emp.name);
    const daysWorked = ep.filter(p=>p.clockIn&&p.clockOut).length;
    const totalHrs   = ep.reduce((acc,p)=>acc+calcHoursNum(p.clockIn,p.clockOut),0);
    const hh=Math.floor(totalHrs),mm=Math.round((totalHrs-hh)*60);
    const totalDisplay = totalHrs===0?"0h":mm===0?`${hh}h`:`${hh}h ${mm}m`;
    const hasCritical = ep.some(p=>p.exceptions.some(e=>CRITICAL_TYPES.includes(e)));
    const hasMinor    = ep.some(p=>p.exceptions.some(e=>!CRITICAL_TYPES.includes(e)));
    return { emp, ep, daysWorked, totalDisplay, hasCritical, hasMinor };
  });

  return (
    <div style={s.page}>
      <div style={s.schedHeader}>
        <div><h1 style={s.pageTitle}>Punch Log</h1><p style={{fontSize:13,color:"#555",margin:0}}>{getWeekLabel(weekOffset)}</p></div>
        <div style={s.headerActions}>
          <button style={s.ghostBtn} onClick={()=>setWeekOffset(0)}>This Week</button>
          <button style={s.navBtn} onClick={()=>setWeekOffset(w=>w-1)}>‹ Prev</button>
          <button style={s.navBtn} onClick={()=>setWeekOffset(w=>w+1)}>Next ›</button>
        </div>
      </div>
      {summaries.every(({daysWorked,hasCritical})=>daysWorked===0&&!hasCritical)&&(
        <div style={{color:"#444",fontSize:13,padding:"12px 0",marginBottom:16}}>No punch data recorded for this week yet.</div>
      )}
      <div style={s.cards}>
        {summaries.map(({emp,daysWorked,totalDisplay,hasCritical,hasMinor})=>(
          <div key={emp.id} onClick={()=>toggle(emp.name)} style={{...s.card,cursor:"pointer",borderColor:hasCritical?"rgba(255,90,90,0.3)":hasMinor?"rgba(245,166,35,0.2)":undefined}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><p style={s.cardLabel}>{emp.name}</p><span style={{fontSize:14,color:"#444",transform:expanded[emp.name]?"rotate(180deg)":"none"}}>▾</span></div>
            <p style={{...s.cardVal,fontSize:28,color:hasCritical?"#FF5A5A":"#F0EDE6"}}>{totalDisplay}</p>
            <div style={{display:"flex",gap:12,marginTop:6,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"#555"}}>{daysWorked} day{daysWorked!==1?"s":""}</span>
              {hasCritical&&<span style={{fontSize:11,color:"#FF5A5A",fontWeight:700}}>⚠ Missing punch</span>}
              {!hasCritical&&hasMinor&&<span style={{fontSize:11,color:"#F5A623"}}>△ Exception</span>}
              {!hasCritical&&!hasMinor&&daysWorked>0&&<span style={{fontSize:11,color:"#00C896"}}>✓ Clean</span>}
            </div>
          </div>
        ))}
      </div>
      {summaries.map(({emp,ep})=>expanded[emp.name]&&(
        <div key={emp.id} style={s.expandBox}>
          <div style={s.expandHeader}>
            <span style={s.expandName}>{emp.name}</span>
            <span style={{color:"#555",fontSize:12}}>{getWeekLabel(weekOffset)}</span>
            <button style={{...s.ghostBtn,marginLeft:"auto",padding:"4px 10px",fontSize:11}} onClick={()=>toggle(emp.name)}>Collapse ▴</button>
          </div>
          <div style={{...s.dayGrid,gridTemplateColumns:"repeat(5,1fr)",marginBottom:10}}>
            {dayColumns.slice(0,5).map((col,i)=>(
              <DayCard key={col.date} col={col} punch={ep.find(p=>p.date===col.date)} isToday={weekOffset===0&&i===todayIdx}/>
            ))}
          </div>
          <div style={{...s.dayGrid,gridTemplateColumns:"repeat(2,1fr)",maxWidth:"calc(40% + 10px)"}}>
            {dayColumns.slice(5).map((col,i)=>(
              <DayCard key={col.date} col={col} punch={ep.find(p=>p.date===col.date)} isToday={weekOffset===0&&(i+5)===todayIdx}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── PAYROLL ──────────────────────────────────────────────────────────────────
function Payroll({ employees, punches }) {
  const weeks = [
    { label:"Last Week",     offset:-1, tag:"LAST" },
    { label:"Current Week",  offset: 0, tag:"CURRENT" },
    { label:"Upcoming Week", offset: 1, tag:"UPCOMING" },
  ];

  function getPayrollDate(offset) {
    const dates = getWeekDates(offset);
    const payDay = new Date(dates[6]); payDay.setDate(payDay.getDate()+1);
    return payDay.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
  }

  function getWeekSummary(emp, offset) {
    const iso = getWeekISO(offset);
    const ep  = punches.filter(p=>p.employee===emp.name&&p.date>=iso[0]&&p.date<=iso[6]);
    const rawHrs  = ep.reduce((acc,p)=>acc+calcHoursNum(p.clockIn,p.clockOut),0);
    const rounded = roundHours(rawHrs);
    const pay     = rounded*emp.rate;
    const days    = ep.filter(p=>p.clockIn&&p.clockOut).length;
    const hh=Math.floor(rawHrs),mm=Math.round((rawHrs-hh)*60);
    const rawDisplay = rawHrs===0?"0h":mm===0?`${hh}h`:`${hh}h ${mm}m`;
    return { rawHrs, rawDisplay, rounded, pay, days };
  }

  return (
    <div style={s.page}>
      <h1 style={s.pageTitle}>Payroll</h1>
      <p style={{fontSize:13,color:"#555",marginTop:-16,marginBottom:28}}>Runs every Monday · Hours rounded to nearest full hour · Mon–Sun week</p>
      {weeks.map(({label,offset,tag})=>{
        const isLast=tag==="LAST", isCurrent=tag==="CURRENT";
        const weekTotal = employees.reduce((acc,emp)=>acc+getWeekSummary(emp,offset).pay,0);
        return (
          <div key={tag} style={{...s.payrollWeekBlock,...(isLast?{borderColor:"rgba(0,200,150,0.2)"}:{})}}>
            <div style={s.payrollWeekHeader}>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={s.payrollWeekLabel}>{label}</span>
                  {isLast&&<span style={{fontSize:11,color:"#00C896",background:"rgba(0,200,150,0.1)",padding:"3px 8px",borderRadius:6,fontWeight:700}}>PAY NOW</span>}
                  {isLast&&<button style={{fontSize:11,color:"#0D0D0F",background:"#00C896",border:"none",padding:"3px 10px",borderRadius:6,fontWeight:700,cursor:"pointer",fontFamily:"'Courier New',monospace",marginLeft:6}}
                    onClick={function(){
                      employees.forEach(function(emp){
                        var sm=getWeekSummary(emp,offset);
                        if(sm.rounded>0) sheetPost({action:"LOG_PAYROLL",employee:emp.name,position:emp.position,week:"Week "+offset,dateRange:getWeekLabel(offset),weekStart:getWeekISO(offset)[0],daysWorked:sm.days,rawHours:sm.rounded,roundedHours:sm.rounded,rate:emp.rate,totalPay:sm.pay,payrollDate:getPayrollDate(offset)}).catch(console.error);
                      });
                      alert("Payroll logged to Google Sheet");
                    }}>Log to Sheet</button>}
                  {isCurrent&&<span style={{fontSize:11,color:"#F5A623",background:"rgba(245,166,35,0.1)",padding:"3px 8px",borderRadius:6}}>In Progress</span>}
                  {tag==="UPCOMING"&&<span style={{fontSize:11,color:"#555",background:"rgba(255,255,255,0.04)",padding:"3px 8px",borderRadius:6}}>Scheduled</span>}
                </div>
                <p style={s.payrollRange}>{getWeekLabel(offset)}</p>
                <p style={s.payrollPayDate}>Payroll date: <span style={{color:isLast?"#00C896":"#555"}}>{getPayrollDate(offset)}</span></p>
              </div>
              <div style={s.payrollWeekTotal}>
                <span style={s.payrollWeekTotalLabel}>Week Total</span>
                <span style={{...s.payrollWeekTotalVal,color:isLast?"#00C896":"#F0EDE6"}}>${weekTotal.toFixed(2)}</span>
              </div>
            </div>
            <div style={s.payrollTable}>
              <div style={s.payrollThead}>
                <span style={{flex:1}}>Employee</span>
                <span style={{width:100}}>Position</span>
                <span style={{width:80,textAlign:"right"}}>Rate</span>
                <span style={{width:70,textAlign:"right"}}>Days</span>
                <span style={{width:90,textAlign:"right"}}>Raw Hrs</span>
                <span style={{width:90,textAlign:"right"}}>Rounded</span>
                <span style={{width:110,textAlign:"right"}}>Total Pay</span>
              </div>
              {employees.map(emp=>{
                const {rawDisplay,rounded,pay,days}=getWeekSummary(emp,offset);
                const hasHours=rounded>0;
                return (
                  <div key={emp.id} style={s.payrollRow}>
                    <div style={{flex:1,display:"flex",alignItems:"center",gap:8}}>
                      <span style={s.empAvatar}>{emp.name.charAt(0)}</span>
                      <span style={{color:"#F0EDE6",fontWeight:600}}>{emp.name}</span>
                    </div>
                    <span style={{width:100,color:"#666",fontSize:12}}>{emp.position}</span>
                    <span style={{width:80,color:"#555",fontSize:12,textAlign:"right"}}>${Number(emp.rate).toFixed(2)}/hr</span>
                    <span style={{width:70,color:hasHours?"#F0EDE6":"#333",textAlign:"right"}}>{days}</span>
                    <span style={{width:90,color:"#666",textAlign:"right",fontSize:13}}>{rawDisplay}</span>
                    <span style={{width:90,color:hasHours?"#F0EDE6":"#333",fontWeight:700,textAlign:"right"}}>{rounded}h</span>
                    <span style={{width:110,color:hasHours?(isLast?"#00C896":"#F0EDE6"):"#333",fontWeight:700,textAlign:"right",fontSize:15}}>{hasHours?`$${pay.toFixed(2)}`:"—"}</span>
                  </div>
                );
              })}
              <div style={{...s.payrollRow,borderTop:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.02)"}}>
                <span style={{flex:1,color:"#888",fontSize:12,letterSpacing:1}}>TOTAL</span>
                <span style={{width:100}}/><span style={{width:80}}/><span style={{width:70}}/><span style={{width:90}}/><span style={{width:90}}/>
                <span style={{width:110,textAlign:"right",color:isLast?"#00C896":"#F0EDE6",fontSize:16,fontWeight:700}}>${weekTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── EXCEPTIONS ───────────────────────────────────────────────────────────────
function Exceptions({ punches, setPunches, employees }) {
  const [resolutions, setResolutions] = useState({}); // { excKey: { status, note, manualTime } }
  const [activeModal, setActiveModal] = useState(null); // { punchId, excType, employee, date, day, scheduledIn, scheduledOut, type: 'critical'|'trend' }
  const [modalState, setModalState]   = useState({ resolution:"", note:"", manualIn:"", manualOut:"" });
  const [trendExpanded, setTrendExpanded] = useState({});
  const [trendWeek, setTrendWeek]     = useState({}); // { empName: weekOffset }

  const now = new Date();

  // ── Criticals: only last 2 weeks, auto-purge ──
  const criticalPunches = punches.filter(p => {
    if (!p.exceptions.some(e => CRITICAL_TYPES.includes(e))) return false;
    const pDate = new Date(p.date + "T12:00:00");
    return (now - pDate) <= TWO_WEEKS_MS;
  });

  // ── Trends: all non-critical exceptions ──
  const trendPunches = punches.filter(p => p.exceptions.some(e => !CRITICAL_TYPES.includes(e)));

  // Open modal
  const openModal = (punch, excType) => {
    setActiveModal({ punchId:punch.id, excType, employee:punch.employee, date:punch.date, day:punch.day, scheduledIn:punch.scheduledIn, scheduledOut:punch.scheduledOut, clockIn:punch.clockIn, clockOut:punch.clockOut });
    const existing = resolutions[excKey(punch.id, excType)] || {};
    setModalState({ resolution:existing.resolution||"", note:existing.note||"", manualIn:existing.manualIn||punch.scheduledIn||"", manualOut:existing.manualOut||punch.scheduledOut||"" });
  };

  const saveResolution = async () => {
    if (!activeModal) return;
    const k = excKey(activeModal.punchId, activeModal.excType);
    const resolvedAt = toLocalISO(now);
    const res = { ...modalState, resolvedAt };
    setResolutions(p => ({ ...p, [k]: res }));

    // If manual punch — update the punch record locally + write to sheet
    if (modalState.resolution === "manual") {
      setPunches(prev => prev.map(p => {
        if (p.id !== activeModal.punchId) return p;
        const updated = { ...p, manual: true };
        if (activeModal.excType === "NO_CLOCKIN")  { updated.clockIn  = modalState.manualIn;  updated.exceptions = p.exceptions.filter(e=>e!=="NO_CLOCKIN"); }
        if (activeModal.excType === "NO_CLOCKOUT") { updated.clockOut = modalState.manualOut; updated.exceptions = p.exceptions.filter(e=>e!=="NO_CLOCKOUT"); }
        return updated;
      }));
    }

    // Write resolution to sheet
    sheetPost({
      action:       "LOG_RESOLUTION",
      employee:     activeModal.employee,
      date:         activeModal.date,
      day:          activeModal.day,
      excType:      activeModal.excType,
      scheduledIn:  activeModal.scheduledIn,
      scheduledOut: activeModal.scheduledOut,
      clockIn:      activeModal.clockIn  || (modalState.resolution==="manual" ? modalState.manualIn  : ""),
      clockOut:     activeModal.clockOut || (modalState.resolution==="manual" ? modalState.manualOut : ""),
      resolution:   modalState.resolution,
      note:         modalState.note,
      resolvedAt,
      manualIn:     modalState.manualIn,
      manualOut:    modalState.manualOut,
    }).catch(console.error);

    setActiveModal(null);
  };

  const getRes = (punchId, excType) => resolutions[excKey(punchId, excType)];

  const resColor = (r) => r==="absent"?"#FF5A5A":r==="manual"?"#00C896":r==="excused"?"#F5A623":r==="acknowledged"?"#7EC8E3":null;
  const resLabel = (r) => r==="absent"?"Absent":r==="manual"?"Manual Punch":r==="excused"?"Excused":r==="acknowledged"?"Acknowledged":null;

  // Trend week offset per employee
  const getTrendOffset = (name) => trendWeek[name] ?? 0;
  const setTrendOffset = (name, val) => setTrendWeek(p => ({ ...p, [name]: val }));

  return (
    <div style={s.page}>
      <h1 style={s.pageTitle}>Exceptions</h1>

      {/* ── CRITICALS ── */}
      <div style={s.excSection}>
        <div style={s.excSectionHeader}>
          <span style={{ ...s.excSectionTitle, color:"#FF5A5A" }}>Critical</span>
          <span style={s.excSectionSub}>Missing punches · Auto-clears after 2 weeks · {criticalPunches.length} active</span>
        </div>

        {criticalPunches.length === 0 ? (
          <div style={s.emptyState}>✓ No critical exceptions — all clear.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {criticalPunches.map(punch =>
              punch.exceptions.filter(e=>CRITICAL_TYPES.includes(e)).map(excType => {
                const res = getRes(punch.id, excType);
                const exInfo = EXCEPTION_LABELS[excType];
                const daysLeft = Math.ceil((TWO_WEEKS_MS - (now - new Date(punch.date+"T12:00:00"))) / (1000*60*60*24));
                return (
                  <div key={`${punch.id}-${excType}`} style={{ ...s.excCard, borderLeft:`3px solid ${res?resColor(res.resolution):"#FF5A5A"}` }}>
                    <div style={s.excCardTop}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, flexWrap:"wrap" }}>
                        <span style={s.excEmpName}>{punch.employee}</span>
                        <span style={{ fontSize:12, color:"#666" }}>{punch.day} · {punch.date}</span>
                        <span style={{ fontSize:11, color:exInfo.color, background:`${exInfo.color}18`, padding:"2px 8px", borderRadius:5, fontWeight:700 }}>{exInfo.label}</span>
                        <span style={{ fontSize:11, color:"#555" }}>Sched: {fmt12(punch.scheduledIn)} – {fmt12(punch.scheduledOut)}</span>
                        <span style={{ fontSize:10, color:"#3A3A3A" }}>Purges in {daysLeft}d</span>
                      </div>
                      {res ? (
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:11, color:resColor(res.resolution), background:`${resColor(res.resolution)}18`, padding:"3px 10px", borderRadius:6, fontWeight:700 }}>{resLabel(res.resolution)}</span>
                          {res.note && <span style={{ fontSize:11, color:"#555", fontStyle:"italic" }}>"{res.note}"</span>}
                          <button style={{...s.ghostBtn,padding:"4px 10px",fontSize:11}} onClick={()=>openModal(punch,excType)}>Edit</button>
                        </div>
                      ) : (
                        <button style={{...s.actionBtn,background:"rgba(255,90,90,0.12)",border:"1px solid rgba(255,90,90,0.3)",color:"#FF5A5A"}} onClick={()=>openModal(punch,excType)}>Resolve ›</button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── TRENDS ── */}
      <div style={s.excSection}>
        <div style={s.excSectionHeader}>
          <span style={{ ...s.excSectionTitle, color:"#F5A623" }}>Reportable Trends</span>
          <span style={s.excSectionSub}>Per employee · Includes criticals within 2-week window</span>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {employees.map(emp => {
            const isOpen   = trendExpanded[emp.name];
            const wOffset  = getTrendOffset(emp.name);
            const wISO     = getWeekISO(wOffset);

            // Minor trend exceptions for this employee
            const empTrends = trendPunches.filter(p => p.employee===emp.name);

            // Criticals within 2-week window for this employee (for reference)
            const empCriticals = punches.filter(p => {
              if (p.employee !== emp.name) return false;
              if (!p.exceptions.some(e=>CRITICAL_TYPES.includes(e))) return false;
              const pDate = new Date(p.date+"T12:00:00");
              return (now - pDate) <= TWO_WEEKS_MS;
            });

            // Filter to selected week
            const weekTrends    = empTrends.filter(p=>p.date>=wISO[0]&&p.date<=wISO[6]);
            const weekCriticals = empCriticals.filter(p=>p.date>=wISO[0]&&p.date<=wISO[6]);
            const totalCount    = empTrends.length + empCriticals.length;

            return (
              <div key={emp.id} style={{ ...s.empCard, ...(isOpen?s.empCardOpen:{}) }}>
                <div style={s.empCardHeader} onClick={()=>setTrendExpanded(p=>({...p,[emp.name]:!p[emp.name]}))}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, flex:1 }}>
                    <span style={s.empAvatar}>{emp.name.charAt(0)}</span>
                    <span style={s.empCardName}>{emp.name}</span>
                    <span style={{ fontSize:12, color:"#666" }}>{emp.position}</span>
                    {totalCount > 0 && <span style={{ fontSize:11, color:"#F5A623", background:"rgba(245,166,35,0.1)", padding:"2px 8px", borderRadius:5, fontWeight:700 }}>{totalCount} flag{totalCount!==1?"s":""}</span>}
                    {empCriticals.length > 0 && <span style={{ fontSize:11, color:"#FF5A5A", background:"rgba(255,90,90,0.1)", padding:"2px 8px", borderRadius:5, fontWeight:700 }}>⚠ {empCriticals.length} critical</span>}
                    {totalCount === 0 && <span style={{ fontSize:11, color:"#00C896" }}>✓ Clean</span>}
                  </div>
                  <span style={{ color:"#444", fontSize:14, transform:isOpen?"rotate(180deg)":"none" }}>▾</span>
                </div>

                {isOpen && (
                  <div style={s.empCardBody}>
                    {/* Week selector */}
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
                      <button style={s.navBtn} onClick={()=>setTrendOffset(emp.name,wOffset-1)}>‹</button>
                      <span style={{ fontSize:13, color:"#888", minWidth:220, textAlign:"center" }}>{getWeekLabel(wOffset)}</span>
                      <button style={s.navBtn} onClick={()=>setTrendOffset(emp.name,wOffset+1)}>›</button>
                      {wOffset!==0&&<button style={{...s.ghostBtn,padding:"4px 10px",fontSize:11}} onClick={()=>setTrendOffset(emp.name,0)}>This Week</button>}
                    </div>

                    {/* Criticals this week (reference) */}
                    {weekCriticals.length > 0 && (
                      <div style={{ marginBottom:16 }}>
                        <p style={{ ...s.sectionLabel, color:"#FF5A5A", marginBottom:8 }}>Critical References This Week</p>
                        {weekCriticals.map(punch =>
                          punch.exceptions.filter(e=>CRITICAL_TYPES.includes(e)).map(excType => {
                            const res = getRes(punch.id, excType);
                            return (
                              <div key={`${punch.id}-${excType}`} style={{ ...s.excCard, borderLeft:"3px solid #FF5A5A", marginBottom:8 }}>
                                <div style={s.excCardTop}>
                                  <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, flexWrap:"wrap" }}>
                                    <span style={{ fontSize:12, color:"#888" }}>{punch.day} · {punch.date}</span>
                                    <span style={{ fontSize:11, color:"#FF5A5A", background:"rgba(255,90,90,0.1)", padding:"2px 8px", borderRadius:5, fontWeight:700 }}>{EXCEPTION_LABELS[excType].label}</span>
                                    <span style={{ fontSize:11, color:"#555" }}>Sched: {fmt12(punch.scheduledIn)} – {fmt12(punch.scheduledOut)}</span>
                                  </div>
                                  {res ? (
                                    <span style={{ fontSize:11, color:resColor(res.resolution), background:`${resColor(res.resolution)}18`, padding:"3px 10px", borderRadius:6, fontWeight:700 }}>{resLabel(res.resolution)}</span>
                                  ) : (
                                    <span style={{ fontSize:11, color:"#555" }}>Unresolved</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* Trends this week */}
                    {weekTrends.length === 0 && weekCriticals.length === 0 ? (
                      <div style={s.emptyState}>No exceptions for this week.</div>
                    ) : weekTrends.length === 0 ? null : (
                      <div>
                        <p style={{ ...s.sectionLabel, marginBottom:8 }}>Trend Flags This Week</p>
                        {weekTrends.map(punch =>
                          punch.exceptions.filter(e=>!CRITICAL_TYPES.includes(e)).map(excType => {
                            const res = getRes(punch.id, excType);
                            const exInfo = EXCEPTION_LABELS[excType];
                            return (
                              <div key={`${punch.id}-${excType}`} style={{ ...s.excCard, borderLeft:`3px solid ${res?resColor(res.resolution):exInfo.color}`, marginBottom:8 }}>
                                <div style={s.excCardTop}>
                                  <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, flexWrap:"wrap" }}>
                                    <span style={{ fontSize:12, color:"#888" }}>{punch.day} · {punch.date}</span>
                                    <span style={{ fontSize:11, color:exInfo.color, background:`${exInfo.color}18`, padding:"2px 8px", borderRadius:5, fontWeight:700 }}>{exInfo.label}</span>
                                    <span style={{ fontSize:11, color:"#555" }}>
                                      Sched: {fmt12(punch.scheduledIn)} – {fmt12(punch.scheduledOut)}
                                    </span>
                                    <span style={{ fontSize:11, color:"#777" }}>
                                      Actual: {fmt12(punch.clockIn)} – {fmt12(punch.clockOut)}
                                    </span>
                                  </div>
                                  {res ? (
                                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                      <span style={{ fontSize:11, color:resColor(res.resolution), background:`${resColor(res.resolution)}18`, padding:"3px 10px", borderRadius:6, fontWeight:700 }}>{resLabel(res.resolution)}</span>
                                      {res.note && <span style={{ fontSize:11, color:"#555", fontStyle:"italic" }}>"{res.note}"</span>}
                                      <button style={{...s.ghostBtn,padding:"4px 10px",fontSize:11}} onClick={()=>openModal(punch,excType)}>Edit</button>
                                    </div>
                                  ) : (
                                    <button style={{...s.actionBtn,background:`${exInfo.color}12`,border:`1px solid ${exInfo.color}44`,color:exInfo.color}} onClick={()=>openModal(punch,excType)}>Acknowledge ›</button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RESOLUTION MODAL ── */}
      {activeModal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background: CRITICAL_TYPES.includes(activeModal.excType)?"#FF5A5A":"#F5A623" }} />
            <p style={s.modalEmp}>{activeModal.employee}</p>
            <p style={s.modalSub}>{activeModal.day} · {activeModal.date}</p>
            <p style={{ fontSize:12, color:"#555", marginBottom:20 }}>
              Scheduled: {fmt12(activeModal.scheduledIn)} – {fmt12(activeModal.scheduledOut)}
            </p>
            <span style={{ fontSize:11, color: EXCEPTION_LABELS[activeModal.excType]?.color, background:`${EXCEPTION_LABELS[activeModal.excType]?.color}18`, padding:"3px 10px", borderRadius:6, fontWeight:700, marginBottom:20, display:"inline-block" }}>
              {EXCEPTION_LABELS[activeModal.excType]?.label}
            </span>

            {/* Resolution options */}
            <p style={{ ...s.sectionLabel, marginBottom:10, marginTop:16 }}>
              {CRITICAL_TYPES.includes(activeModal.excType) ? "What happened?" : "Acknowledge this flag?"}
            </p>

            {CRITICAL_TYPES.includes(activeModal.excType) ? (
              <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                {[
                  { val:"absent",  label:"Absent",       color:"#FF5A5A" },
                  { val:"manual",  label:"Manual Punch",  color:"#00C896" },
                  { val:"excused", label:"Excused",       color:"#F5A623" },
                ].map(opt=>(
                  <button key={opt.val} onClick={()=>setModalState(p=>({...p,resolution:opt.val}))}
                    style={{ padding:"10px 16px", borderRadius:8, border:`1px solid ${modalState.resolution===opt.val?opt.color:"rgba(255,255,255,0.1)"}`, background:modalState.resolution===opt.val?`${opt.color}18`:"transparent", color:modalState.resolution===opt.val?opt.color:"#666", fontSize:13, fontWeight:modalState.resolution===opt.val?700:400, cursor:"pointer", fontFamily:"'Courier New',monospace" }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ marginBottom:16 }}>
                <button onClick={()=>setModalState(p=>({...p,resolution:"acknowledged"}))}
                  style={{ padding:"10px 16px", borderRadius:8, border:`1px solid ${modalState.resolution==="acknowledged"?"#7EC8E3":"rgba(255,255,255,0.1)"}`, background:modalState.resolution==="acknowledged"?"rgba(126,200,227,0.12)":"transparent", color:modalState.resolution==="acknowledged"?"#7EC8E3":"#666", fontSize:13, fontWeight:modalState.resolution==="acknowledged"?700:400, cursor:"pointer", fontFamily:"'Courier New',monospace" }}>
                  Acknowledge
                </button>
              </div>
            )}

            {/* Manual punch time inputs */}
            {modalState.resolution === "manual" && (
              <div style={{ background:"rgba(0,200,150,0.05)", border:"1px solid rgba(0,200,150,0.2)", borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
                <p style={{ ...s.sectionLabel, color:"#00C896", marginBottom:12 }}>Enter Actual Time</p>
                {activeModal.excType === "NO_CLOCKIN" && (
                  <div style={s.customRow}>
                    <span style={{ fontSize:12, color:"#888", width:60 }}>Clock In</span>
                    <input type="time" style={s.timeInput} value={modalState.manualIn} onChange={e=>setModalState(p=>({...p,manualIn:e.target.value}))}/>
                    <span style={{ fontSize:12, color:"#555" }}>{fmt12(modalState.manualIn)}</span>
                  </div>
                )}
                {activeModal.excType === "NO_CLOCKOUT" && (
                  <div style={s.customRow}>
                    <span style={{ fontSize:12, color:"#888", width:60 }}>Clock Out</span>
                    <input type="time" style={s.timeInput} value={modalState.manualOut} onChange={e=>setModalState(p=>({...p,manualOut:e.target.value}))}/>
                    <span style={{ fontSize:12, color:"#555" }}>{fmt12(modalState.manualOut)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Note */}
            <textarea
              style={{ ...s.input, width:"100%", minHeight:72, resize:"vertical", boxSizing:"border-box", marginBottom:20, fontSize:12 }}
              placeholder="Add a note (optional)..."
              value={modalState.note}
              onChange={e=>setModalState(p=>({...p,note:e.target.value}))}
            />

            <div style={{ display:"flex", gap:10 }}>
              <button style={s.ghostBtn} onClick={()=>setActiveModal(null)}>Cancel</button>
              <button
                disabled={!modalState.resolution}
                style={{ ...s.saveBtn, flex:1, opacity:modalState.resolution?1:0.4, fontSize:14 }}
                onClick={saveResolution}>
                Save Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN DASHBOARD ───────────────────────────────────────────────────────────
function TealuxAdmin() {
  const [active, setActive]         = useState("overview");
  const [employees, setEmployees]   = useState(INIT_EMPLOYEES);
  const [punches, setPunches]       = useState(INIT_PUNCHES);
  const [baseShifts, setBaseShifts] = useState(BASE_SHIFTS);

  const criticalCount = punches.filter(p => {
    if (!p.exceptions.some(e=>CRITICAL_TYPES.includes(e))) return false;
    const pDate = new Date(p.date+"T12:00:00");
    return (new Date() - pDate) <= TWO_WEEKS_MS;
  }).length;

  const navItems = [
    { id:"overview",   icon:"◈", label:"Overview"  },
    { id:"employees",  icon:"◉", label:"Employees" },
    { id:"schedules",  icon:"▦", label:"Schedules" },
    { id:"punchlog",   icon:"≡", label:"Punch Log" },
    { id:"payroll",    icon:"◎", label:"Payroll"   },
    { id:"exceptions", icon:"⚠", label:"Exceptions", badge:criticalCount },
  ];

  const pages = {
    overview:   <Overview   employees={employees} punches={punches} />,
    employees:  <Employees  employees={employees} setEmployees={setEmployees} />,
    schedules:  <Schedule   employees={employees} setEmployees={setEmployees} baseShifts={baseShifts} setBaseShifts={setBaseShifts} />,
    punchlog:   <PunchLog   punches={punches} employees={employees} />,
    payroll:    <Payroll    employees={employees} punches={punches} />,
    exceptions: <Exceptions punches={punches} setPunches={setPunches} employees={employees} />,
  };

  return (
    <div style={s.root}>
      <div style={s.nav}>
        <div style={s.navLogo}><span style={s.navLogoT}>T</span><span style={s.navLogoRest}>EALUX</span></div>
        <span style={s.navSub}>Admin Dashboard</span>
        <div style={s.navItems}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>setActive(item.id)} style={{...s.navItem,...(active===item.id?s.navItemActive:{})}}>
              <span style={s.navIcon}>{item.icon}</span>{item.label}
              {item.badge>0&&<span style={s.badge}>{item.badge}</span>}
            </button>
          ))}
        </div>
        <div style={s.navFooter}><span style={{color:"#2A2A2E",fontSize:11}}>Tealux Cafe Tampa</span></div>
      </div>
      <div style={s.main}>{pages[active]}</div>
    </div>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const s = {
  root:          { display:"flex", minHeight:"100vh", background:"#0D0D0F", color:"#F0EDE6", fontFamily:"'Courier New',monospace" },
  nav:           { width:220, minHeight:"100vh", background:"#111114", borderRight:"1px solid rgba(255,255,255,0.06)", display:"flex", flexDirection:"column", padding:"32px 0", flexShrink:0, position:"sticky", top:0, height:"100vh", overflowY:"auto" },
  navLogo:       { display:"flex", alignItems:"baseline", gap:2, paddingLeft:24, marginBottom:2 },
  navLogoT:      { fontSize:28, fontWeight:900, color:"#00C896", fontFamily:"Georgia,serif" },
  navLogoRest:   { fontSize:18, fontWeight:700, letterSpacing:4, color:"#F0EDE6" },
  navSub:        { fontSize:10, letterSpacing:3, color:"#444", textTransform:"uppercase", paddingLeft:24, marginBottom:32 },
  navItems:      { display:"flex", flexDirection:"column", gap:2, padding:"0 12px" },
  navItem:       { display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:8, background:"transparent", border:"none", color:"#555", fontSize:13, cursor:"pointer", textAlign:"left", fontFamily:"'Courier New',monospace" },
  navItemActive: { background:"rgba(0,200,150,0.08)", color:"#00C896" },
  navIcon:       { fontSize:14, width:18 },
  badge:         { marginLeft:"auto", background:"#FF5A5A", color:"#fff", borderRadius:10, fontSize:10, fontWeight:700, padding:"2px 6px" },
  navFooter:     { marginTop:"auto", paddingLeft:24, paddingTop:24 },
  main:          { flex:1, overflowY:"auto", maxHeight:"100vh" },
  page:          { padding:"40px 32px", maxWidth:1000 },
  pageTitle:     { fontSize:22, fontWeight:700, color:"#F0EDE6", marginBottom:24, marginTop:0, letterSpacing:1 },
  schedHeader:   { display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:16, marginBottom:24 },
  headerActions: { display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" },
  navBtn:        { background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"#F0EDE6", borderRadius:8, padding:"8px 14px", fontSize:13, cursor:"pointer", fontFamily:"'Courier New',monospace" },
  ghostBtn:      { background:"transparent", border:"1px solid rgba(255,255,255,0.12)", color:"#888", borderRadius:8, padding:"8px 14px", fontSize:12, cursor:"pointer", fontFamily:"'Courier New',monospace" },
  dangerBtn:     { background:"transparent", border:"1px solid rgba(255,90,90,0.25)", color:"#FF5A5A", borderRadius:8, padding:"8px 14px", fontSize:12, cursor:"pointer", fontFamily:"'Courier New',monospace" },
  saveBtn:       { background:"#00C896", color:"#0D0D0F", border:"none", borderRadius:8, padding:"10px 14px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Courier New',monospace" },
  deleteBtn:     { background:"rgba(255,90,90,0.1)", border:"1px solid rgba(255,90,90,0.2)", borderRadius:8, color:"#FF5A5A", padding:"8px 14px", fontSize:12, cursor:"pointer", fontFamily:"'Courier New',monospace" },
  addBtn:        { background:"#00C896", color:"#0D0D0F", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Courier New',monospace", whiteSpace:"nowrap" },
  actionBtn:     { padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Courier New',monospace", whiteSpace:"nowrap" },
  input:         { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"#F0EDE6", padding:"10px 14px", fontSize:13, fontFamily:"'Courier New',monospace", outline:"none" },
  cards:         { display:"flex", gap:16, flexWrap:"wrap", marginBottom:24 },
  card:          { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"20px 24px", minWidth:160, flex:1 },
  cardLabel:     { fontSize:11, color:"#555", letterSpacing:2, textTransform:"uppercase", marginBottom:8, marginTop:0 },
  cardVal:       { fontSize:36, fontWeight:700, color:"#F0EDE6", margin:0 },
  alertBox:      { background:"rgba(255,90,90,0.06)", border:"1px solid rgba(255,90,90,0.2)", borderRadius:12, padding:"20px 24px", marginTop:8 },
  alertTitle:    { color:"#FF5A5A", fontSize:13, fontWeight:700, letterSpacing:2, textTransform:"uppercase", marginBottom:12, marginTop:0 },
  alertRow:      { display:"flex", gap:8, alignItems:"center", padding:"6px 0", fontSize:13, borderBottom:"1px solid rgba(255,90,90,0.1)" },
  legend:        { display:"flex", gap:20, alignItems:"center", flexWrap:"wrap", padding:"12px 16px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, marginBottom:20 },
  legendItem:    { display:"flex", alignItems:"center", gap:6 },
  dot:           { width:8, height:8, borderRadius:"50%" },
  legendName:    { fontSize:12, color:"#F0EDE6", fontWeight:600 },
  legendTime:    { fontSize:11, color:"#555" },
  thEmp:         { padding:"10px 16px", textAlign:"left", borderBottom:"1px solid rgba(255,255,255,0.08)", fontSize:11, color:"#555", letterSpacing:2, textTransform:"uppercase", minWidth:150 },
  th:            { padding:"10px 6px", textAlign:"center", borderBottom:"1px solid rgba(255,255,255,0.08)", fontSize:12, color:"#666", minWidth:82 },
  thToday:       { borderBottom:"2px solid #00C896", color:"#00C896" },
  tdEmp:         { padding:"8px 16px", fontSize:13, fontWeight:600, color:"#F0EDE6", borderBottom:"1px solid rgba(255,255,255,0.04)", whiteSpace:"nowrap" },
  sectionLabel:  { fontSize:11, color:"#555", letterSpacing:3, textTransform:"uppercase", marginBottom:16, marginTop:0 },
  customGrid:    { display:"flex", flexWrap:"wrap", gap:16, marginBottom:28 },
  customCard:    { background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"16px 20px", minWidth:280, flex:"1 1 280px" },
  customEmpName: { fontSize:13, fontWeight:700, color:"#F0EDE6", margin:"0 0 12px" },
  customRow:     { display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" },
  labelInput:    { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, color:"#F0EDE6", padding:"6px 10px", fontSize:12, fontFamily:"'Courier New',monospace", outline:"none", width:80 },
  timeInput:     { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, color:"#F0EDE6", padding:"6px 8px", fontSize:12, fontFamily:"'Courier New',monospace", outline:"none", width:100, colorScheme:"dark" },
  fieldLabel:    { fontSize:10, color:"#555", letterSpacing:2, textTransform:"uppercase" },
  addEmpForm:    { background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"20px 24px", marginBottom:24 },
  empCard:       { background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, overflow:"hidden" },
  empCardOpen:   { border:"1px solid rgba(255,255,255,0.12)" },
  empCardHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", cursor:"pointer", gap:12 },
  empCardName:   { fontSize:15, fontWeight:700, color:"#F0EDE6", marginRight:8 },
  empCardPos:    { fontSize:12, color:"#555" },
  empCardBody:   { borderTop:"1px solid rgba(255,255,255,0.06)", padding:"20px 24px", background:"rgba(0,0,0,0.2)" },
  empAvatar:     { width:32, height:32, borderRadius:"50%", background:"rgba(0,200,150,0.12)", border:"1px solid rgba(0,200,150,0.2)", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#00C896", flexShrink:0 },
  detailItem:    { display:"flex", flexDirection:"column", gap:4 },
  detailVal:     { fontSize:15, fontWeight:600, color:"#F0EDE6" },
  expandBox:     { background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"20px 24px", marginBottom:16 },
  expandHeader:  { display:"flex", alignItems:"center", gap:16, marginBottom:16, flexWrap:"wrap" },
  expandName:    { fontSize:16, fontWeight:700, color:"#F0EDE6" },
  dayGrid:       { display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:10 },
  dayCard:       { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"12px 10px" },
  dayCardHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 },
  punchRow:      { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 },
  punchLabel:    { fontSize:10, color:"#555", letterSpacing:1, textTransform:"uppercase" },
  punchVal:      { fontSize:12, fontWeight:600 },
  payrollWeekBlock:      { background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:"24px", marginBottom:24 },
  payrollWeekHeader:     { display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:16, marginBottom:20 },
  payrollWeekLabel:      { fontSize:16, fontWeight:700, color:"#F0EDE6" },
  payrollRange:          { fontSize:13, color:"#555", margin:"4px 0 2px" },
  payrollPayDate:        { fontSize:12, color:"#555", margin:0 },
  payrollWeekTotal:      { textAlign:"right" },
  payrollWeekTotalLabel: { display:"block", fontSize:10, color:"#555", letterSpacing:2, textTransform:"uppercase", marginBottom:4 },
  payrollWeekTotalVal:   { fontSize:28, fontWeight:700 },
  payrollTable:          { background:"rgba(255,255,255,0.01)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, overflow:"hidden" },
  payrollThead:          { display:"flex", gap:16, padding:"10px 20px", background:"rgba(255,255,255,0.03)", borderBottom:"1px solid rgba(255,255,255,0.06)", fontSize:11, color:"#555", letterSpacing:2, textTransform:"uppercase", alignItems:"center" },
  payrollRow:            { display:"flex", gap:16, padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.04)", alignItems:"center", fontSize:13 },
  // Exceptions
  excSection:       { marginBottom:40 },
  excSectionHeader: { display:"flex", alignItems:"baseline", gap:12, marginBottom:16 },
  excSectionTitle:  { fontSize:16, fontWeight:700, letterSpacing:1 },
  excSectionSub:    { fontSize:12, color:"#555" },
  excCard:          { background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"14px 18px" },
  excCardTop:       { display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" },
  excEmpName:       { fontSize:14, fontWeight:700, color:"#F0EDE6" },
  emptyState:       { color:"#444", fontSize:13, padding:"16px 0" },
  // Modal
  overlay:   { position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
  modal:     { background:"#17171A", border:"1px solid rgba(255,255,255,0.1)", borderRadius:20, padding:"40px 32px", maxWidth:400, width:"90%", display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" },
  modalEmp:  { fontSize:20, fontWeight:700, color:"#F0EDE6", margin:"0 0 4px" },
  modalSub:  { fontSize:13, color:"#666", margin:"0 0 8px" },
};

const blk = {
  block: { borderRadius:8, padding:"8px 6px", display:"flex", flexDirection:"column", alignItems:"center", gap:2, userSelect:"none", minHeight:52, justifyContent:"center" },
};


const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(TealuxAdmin));
