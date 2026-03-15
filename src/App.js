import { useState, useEffect, useRef } from “react”;

const CLASSIFIER_PROMPT = `You are a macro logging assistant. Analyze the user’s food input and return ONLY raw JSON.

Determine:

1. intent: “logged” (ate it), “planned” (will eat it), “hypothetical” (exploring/what if)
1. foods: array of individual food items mentioned
1. specificity: “specific” (brand/type/size/weight known) or “vague” (missing key details)
1. missing: what details are missing if vague (e.g. “portion size”, “brand”, “cooking method”, “type of cut”)
1. multi: true if more than one distinct food item

Return:
{
“intent”: “logged” | “planned” | “hypothetical”,
“foods”: [“food1”, “food2”],
“specificity”: “specific” | “vague”,
“missing”: [“detail1”, “detail2”],
“multi”: true | false,
“raw_input”: “the original input”
}

Only return raw JSON. No markdown. No explanation.`;

const MACRO_PROMPT = `You are a macro nutrition calculator. Return ONLY a raw JSON array of food entries.

For each food item, return:
{
“food”: “descriptive name with portion/brand if known”,
“calories”: number,
“protein”: number,
“carbs”: number,
“fat”: number,
“confidence”: “high” | “medium” | “low”
}

Rules:

- All macros are integers
- Return an array even for a single item: [{ … }]
- No markdown, no explanation, raw JSON array only`;

const MEAL_SUGGESTION_PROMPT = `You are a meal planning assistant. The user listed foods they plan to eat. Suggest 2-3 practical meal structures using those ingredients with rough portion guidance. Be concise and practical.`;

const STORAGE_KEY = “macro_app_v2”;
function loadData() { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveData(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }
function todayStr() { return new Date().toISOString().split(“T”)[0]; }

function Bar({ label, value, goal, color }) {
const pct = Math.min((value / goal) * 100, 100);
const over = value > goal;
return (
<div style={{ marginBottom: 10 }}>
<div style={{ display: “flex”, justifyContent: “space-between”, fontSize: 12, marginBottom: 4, fontFamily: “monospace” }}>
<span style={{ color: “#fff”, fontWeight: 600, letterSpacing: 1 }}>{label}</span>
<span style={{ color: over ? “#ff6b6b” : “#fff” }}>{value}<span style={{ color: “#555” }}>/{goal}g</span></span>
</div>
<div style={{ height: 6, background: “#1e1e1e”, borderRadius: 99, overflow: “hidden” }}>
<div style={{ height: “100%”, width: `${pct}%`, borderRadius: 99, background: over ? “#ff6b6b” : color, transition: “width 0.5s cubic-bezier(.4,0,.2,1)” }} />
</div>
</div>
);
}

function CalorieDial({ calories, goal }) {
const pct = Math.min(calories / goal, 1);
const over = calories > goal;
const r = 54, circ = 2 * Math.PI * r, dash = pct * circ;
return (
<div style={{ display: “flex”, flexDirection: “column”, alignItems: “center”, marginBottom: 8 }}>
<div style={{ position: “relative”, width: 140, height: 140 }}>
<svg width=“140” height=“140” style={{ transform: “rotate(-90deg)” }}>
<circle cx="70" cy="70" r={r} fill="none" stroke="#1e1e1e" strokeWidth="10" />
<circle cx=“70” cy=“70” r={r} fill=“none” stroke={over ? “#ff6b6b” : “#c8f060”} strokeWidth=“10”
strokeDasharray={`${dash} ${circ}`} strokeLinecap=“round”
style={{ transition: “stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1)” }} />
</svg>
<div style={{ position: “absolute”, inset: 0, display: “flex”, flexDirection: “column”, alignItems: “center”, justifyContent: “center” }}>
<span style={{ fontSize: 28, fontWeight: 800, color: over ? “#ff6b6b” : “#fff”, fontFamily: “monospace”, letterSpacing: -1 }}>{calories}</span>
<span style={{ fontSize: 11, color: “#555”, letterSpacing: 2, textTransform: “uppercase” }}>of {goal}</span>
</div>
</div>
<span style={{ fontSize: 11, color: “#555”, letterSpacing: 3, textTransform: “uppercase”, marginTop: 2 }}>calories</span>
</div>
);
}

const IS = {
logged:       { bg: “#0d1f0d”, border: “#2a5a2a”, badge: “#c8f060”, badgeText: “#0d1f0d”, label: “EATEN” },
planned:      { bg: “#0d1520”, border: “#1a3a5a”, badge: “#60b8f0”, badgeText: “#0a1020”, label: “PLANNED” },
hypothetical: { bg: “#1a1020”, border: “#3a1a5a”, badge: “#c060f0”, badgeText: “#100a20”, label: “WHAT IF” },
};

function FoodEntry({ entry, onRemove }) {
const s = IS[entry.intent] || IS.logged;
return (
<div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: “12px 14px”, marginBottom: 8, display: “flex”, alignItems: “center”, gap: 10 }}>
<div style={{ flex: 1 }}>
<div style={{ display: “flex”, alignItems: “center”, gap: 8, marginBottom: 4 }}>
<span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, padding: “2px 7px”, borderRadius: 99, background: s.badge, color: s.badgeText, fontFamily: “monospace” }}>{s.label}</span>
<span style={{ fontSize: 13, color: “#e0e0e0”, fontWeight: 600 }}>{entry.food}</span>
</div>
<div style={{ display: “flex”, gap: 14, fontSize: 11, color: “#666”, fontFamily: “monospace” }}>
<span style={{ color: “#c8f060” }}>{entry.calories} cal</span>
<span>P: {entry.protein}g</span>
<span>C: {entry.carbs}g</span>
<span>F: {entry.fat}g</span>
{entry.confidence === “low” && <span style={{ color: “#555” }}>(rough est.)</span>}
</div>
</div>
<button onClick={onRemove} style={{ background: “none”, border: “none”, color: “#333”, cursor: “pointer”, fontSize: 18, padding: “2px 6px”, borderRadius: 6, transition: “color 0.2s” }}
onMouseEnter={e => e.target.style.color = “#ff6b6b”} onMouseLeave={e => e.target.style.color = “#333”}>x</button>
</div>
);
}

function Btn({ children, onClick, disabled, bg = “#111”, border = “#333”, color = “#888” }) {
return (
<button onClick={onClick} disabled={disabled} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, color, fontSize: 12, fontWeight: 700, padding: “8px 14px”, cursor: disabled ? “not-allowed” : “pointer”, fontFamily: “monospace”, letterSpacing: 1, textTransform: “uppercase”, opacity: disabled ? 0.5 : 1 }}>
{children}
</button>
);
}

function ClarifyBubble({ classification, onClarify, onEstimate, onDismiss, loading }) {
const { intent, foods, missing, multi } = classification;
const isPlannedMulti = intent === “planned” && multi;
return (
<div style={{ background: “#111”, border: “1px solid #2a2a2a”, borderRadius: 16, padding: “16px”, marginBottom: 10 }}>
<div style={{ fontSize: 11, color: “#c8f060”, letterSpacing: 3, textTransform: “uppercase”, fontFamily: “monospace”, marginBottom: 8 }}>
{isPlannedMulti ? “Meal Planning” : “A little more info?”}
</div>
{isPlannedMulti ? (
<p style={{ color: “#bbb”, fontSize: 13, lineHeight: 1.6, margin: “0 0 14px” }}>
You listed <strong style={{ color: “#fff” }}>{foods.join(”, “)}</strong>. Want meal structure ideas, or log each item separately?
</p>
) : (
<p style={{ color: “#bbb”, fontSize: 13, lineHeight: 1.6, margin: “0 0 14px” }}>
For better accuracy I need: <strong style={{ color: “#fff” }}>{missing?.join(”, “)}</strong>. Add detail or just estimate.
</p>
)}
<div style={{ display: “flex”, gap: 8, flexWrap: “wrap” }}>
{isPlannedMulti && <Btn onClick={() => onClarify(“suggest_meal”)} disabled={loading} bg=”#0d1520” border=”#1a3a5a” color=”#60b8f0”>Suggest meal structure</Btn>}
<Btn onClick={() => onClarify(“clarify”)} disabled={loading}>{isPlannedMulti ? “Log separately” : “Add detail”}</Btn>
<Btn onClick={onEstimate} disabled={loading} bg="#0d1f0d" border="#2a5a2a" color="#c8f060">Just estimate</Btn>
<button onClick={onDismiss} style={{ background: “none”, border: “none”, color: “#444”, fontSize: 11, cursor: “pointer”, padding: “6px 4px”, fontFamily: “monospace” }}>cancel</button>
</div>
</div>
);
}

function MealSuggestionBubble({ suggestion, foods, onLogItem, onDismiss }) {
return (
<div style={{ background: “#0d1520”, border: “1px solid #1a3a5a”, borderRadius: 16, padding: “16px”, marginBottom: 10 }}>
<div style={{ fontSize: 11, color: “#60b8f0”, letterSpacing: 3, textTransform: “uppercase”, fontFamily: “monospace”, marginBottom: 10 }}>Meal Ideas</div>
<div style={{ color: “#bbb”, fontSize: 13, lineHeight: 1.7, whiteSpace: “pre-wrap”, marginBottom: 14 }}>{suggestion}</div>
<p style={{ color: “#555”, fontSize: 12, margin: “0 0 10px” }}>Or tap an ingredient to log it individually:</p>
<div style={{ display: “flex”, gap: 8, flexWrap: “wrap”, marginBottom: 10 }}>
{foods.map(f => <Btn key={f} onClick={() => onLogItem(f)}>{f}</Btn>)}
</div>
<button onClick={onDismiss} style={{ background: “none”, border: “none”, color: “#444”, fontSize: 11, cursor: “pointer”, fontFamily: “monospace” }}>dismiss</button>
</div>
);
}

function Onboarding({ onComplete }) {
const [step, setStep] = useState(0);
const [goals, setGoals] = useState({ calories: “”, protein: “”, carbs: “”, fat: “” });
const [dayReset, setDayReset] = useState(””);
const [defaultMode, setDefaultMode] = useState(“ask”);
const [customTime, setCustomTime] = useState(“06:00”);

const fields = [
{ key: “calories”, label: “Daily Calorie Goal”, unit: “kcal”, placeholder: “e.g. 2200” },
{ key: “protein”,  label: “Protein Goal”,       unit: “g”,    placeholder: “e.g. 180” },
{ key: “carbs”,    label: “Carb Goal”,           unit: “g”,    placeholder: “e.g. 220” },
{ key: “fat”,      label: “Fat Goal”,            unit: “g”,    placeholder: “e.g. 70”  },
];

const iStyle = { flex: 1, background: “#111”, border: “1px solid #222”, borderRadius: 10, color: “#fff”, fontSize: 16, padding: “12px 14px”, outline: “none”, fontFamily: “monospace”, boxSizing: “border-box”, width: “100%” };
const selOpt = (val, selected) => ({ border: `1px solid ${selected ? "#c8f060" : "#1e1e1e"}`, borderRadius: 12, padding: “14px 16px”, marginBottom: 10, cursor: “pointer”, background: selected ? “#0d1a00” : “#0f0f0f”, transition: “all 0.15s” });
const nextBtn = (enabled, onClick) => ({ width: “100%”, padding: “14px”, marginTop: 10, background: enabled ? “#c8f060” : “#1a1a1a”, color: enabled ? “#0a0a0a” : “#333”, border: “none”, borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: enabled ? “pointer” : “not-allowed”, fontFamily: “monospace” });
const backBtn = { flex: 1, padding: “14px”, background: “#111”, color: “#666”, border: “1px solid #222”, borderRadius: 12, fontSize: 14, cursor: “pointer”, fontFamily: “monospace” };
const allFilled = fields.every(f => goals[f.key] !== “”);

function finish() {
onComplete({ goals: { calories: parseInt(goals.calories), protein: parseInt(goals.protein), carbs: parseInt(goals.carbs), fat: parseInt(goals.fat) }, dayReset, customResetTime: dayReset === “custom” ? customTime : null, defaultMode });
}

const heading = (step, title, sub) => (
<div style={{ marginBottom: 28 }}>
<div style={{ fontSize: 11, color: “#c8f060”, letterSpacing: 4, textTransform: “uppercase”, marginBottom: 8, fontFamily: “monospace” }}>Step {step} of 3</div>
<h1 style={{ color: “#fff”, fontSize: 28, fontWeight: 800, margin: 0 }}>{title}</h1>
<p style={{ color: “#555”, fontSize: 13, marginTop: 8 }}>{sub}</p>
</div>
);

return (
<div style={{ minHeight: “100dvh”, background: “#0a0a0a”, display: “flex”, flexDirection: “column”, alignItems: “center”, justifyContent: “center”, padding: “32px 20px”, boxSizing: “border-box” }}>
<div style={{ width: “100%”, maxWidth: 400 }}>
{step === 0 && <>
{heading(1, “Set your daily goals.”, “You can update these anytime in settings.”)}
{fields.map(f => (
<div key={f.key} style={{ marginBottom: 14 }}>
<label style={{ fontSize: 11, color: “#666”, letterSpacing: 2, textTransform: “uppercase”, display: “block”, marginBottom: 6, fontFamily: “monospace” }}>{f.label}</label>
<div style={{ display: “flex”, gap: 8, alignItems: “center” }}>
<input type=“number” placeholder={f.placeholder} value={goals[f.key]} onChange={e => setGoals(g => ({ …g, [f.key]: e.target.value }))} style={iStyle} />
<span style={{ color: “#444”, fontSize: 13, minWidth: 28, fontFamily: “monospace” }}>{f.unit}</span>
</div>
</div>
))}
<button disabled={!allFilled} onClick={() => setStep(1)} style={nextBtn(allFilled)}>Next</button>
</>}

```
    {step === 1 && <>
      {heading(2, "When does your day start?", "This is when your log resets to zero.")}
      {[
        { val: "midnight", label: "Midnight",             desc: "Resets automatically at 12:00 AM" },
        { val: "wakeup",   label: "Ask me each morning",  desc: "Prompts you when you open the app after sleeping" },
        { val: "custom",   label: "Custom time",          desc: "Pick your own reset time" },
      ].map(o => (
        <div key={o.val} onClick={() => setDayReset(o.val)} style={selOpt(o.val, dayReset === o.val)}>
          <div style={{ color: dayReset === o.val ? "#c8f060" : "#fff", fontWeight: 700, fontSize: 14 }}>{o.label}</div>
          <div style={{ color: "#555", fontSize: 12, marginTop: 2 }}>{o.desc}</div>
        </div>
      ))}
      {dayReset === "custom" && <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)} style={{ ...iStyle, marginBottom: 10 }} />}
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button onClick={() => setStep(0)} style={backBtn}>Back</button>
        <button disabled={!dayReset} onClick={() => setStep(2)} style={{ ...nextBtn(dayReset), flex: 2 }}>Next</button>
      </div>
    </>}

    {step === 2 && <>
      {heading(3, "How precise do you want to be?", "You can always override this per entry.")}
      {[
        { val: "ask",      label: "Ask me each time",     desc: "Shows estimate vs. clarify options when input is vague" },
        { val: "clarify",  label: "Always clarify first", desc: "Ask for more detail before logging anything vague" },
        { val: "estimate", label: "Always estimate",      desc: "Just log your best guess and move on" },
      ].map(o => (
        <div key={o.val} onClick={() => setDefaultMode(o.val)} style={selOpt(o.val, defaultMode === o.val)}>
          <div style={{ color: defaultMode === o.val ? "#c8f060" : "#fff", fontWeight: 700, fontSize: 14 }}>{o.label}</div>
          <div style={{ color: "#555", fontSize: 12, marginTop: 2 }}>{o.desc}</div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button onClick={() => setStep(1)} style={backBtn}>Back</button>
        <button onClick={finish} style={{ ...nextBtn(true), flex: 2 }}>{"Let's go"}</button>
      </div>
    </>}
  </div>
</div>
```

);
}

function DayModal({ lastDate, onNewDay, onContinue }) {
return (
<div style={{ position: “fixed”, inset: 0, background: “rgba(0,0,0,0.85)”, display: “flex”, alignItems: “center”, justifyContent: “center”, zIndex: 100, padding: 24 }}>
<div style={{ background: “#111”, border: “1px solid #222”, borderRadius: 20, padding: 28, maxWidth: 340, width: “100%” }}>
<div style={{ fontSize: 11, color: “#c8f060”, letterSpacing: 4, textTransform: “uppercase”, marginBottom: 10, fontFamily: “monospace” }}>New Day?</div>
<p style={{ color: “#e0e0e0”, fontSize: 16, lineHeight: 1.5, margin: “0 0 24px” }}>
Your last log was on <span style={{ color: “#fff”, fontWeight: 700 }}>{lastDate}</span>. Start fresh?
</p>
<div style={{ display: “flex”, gap: 10 }}>
<button onClick={onContinue} style={{ flex: 1, padding: “13px”, background: “#1a1a1a”, color: “#888”, border: “1px solid #222”, borderRadius: 12, fontSize: 13, cursor: “pointer”, fontFamily: “monospace” }}>Continue {lastDate}</button>
<button onClick={onNewDay} style={{ flex: 1, padding: “13px”, background: “#c8f060”, color: “#0a0a0a”, border: “none”, borderRadius: 12, fontSize: 13, fontWeight: 800, cursor: “pointer”, fontFamily: “monospace” }}>New Day</button>
</div>
</div>
</div>
);
}

async function apiCall(system, userText, maxTokens = 400) {
const res = await fetch(“https://api.anthropic.com/v1/messages”, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({ model: “claude-sonnet-4-20250514”, max_tokens: maxTokens, system, messages: [{ role: “user”, content: userText }] })
});
const data = await res.json();
return data.content?.find(b => b.type === “text”)?.text || “”;
}

export default function App() {
const [appData, setAppData] = useState(null);
const [showDayModal, setShowDayModal] = useState(false);
const [input, setInput] = useState(””);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(””);
const [tab, setTab] = useState(“log”);
const [pendingClass, setPendingClass] = useState(null);
const [pendingInput, setPendingInput] = useState(””);
const [mealSuggestion, setMealSuggestion] = useState(null);
const [waitingForDetail, setWaitingForDetail] = useState(false);
const inputRef = useRef(null);

useEffect(() => {
const saved = loadData();
if (!saved?.settings) { setAppData({ settings: null, days: {} }); return; }
const today = todayStr();
const lastDay = saved.currentDay;
if (lastDay && lastDay !== today && saved.settings.dayReset !== “midnight”) {
setAppData(saved); setShowDayModal(true);
} else {
setAppData({ …saved, currentDay: saved.currentDay || today });
}
}, []);

useEffect(() => { if (appData) saveData(appData); }, [appData]);

const currentDay = appData?.currentDay || todayStr();
const entries = appData?.days?.[currentDay] || [];
const goals = appData?.settings?.goals || { calories: 2000, protein: 150, carbs: 200, fat: 65 };
const defaultMode = appData?.settings?.defaultMode || “ask”;

const totals = entries.reduce((acc, e) => e.intent === “hypothetical” ? acc : ({ calories: acc.calories + e.calories, protein: acc.protein + e.protein, carbs: acc.carbs + e.carbs, fat: acc.fat + e.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

function addEntries(items, intent) {
const now = new Date().toLocaleTimeString([], { hour: “2-digit”, minute: “2-digit” });
const newEntries = items.map(item => ({ id: Date.now() + Math.random(), …item, intent, time: now }));
setAppData(d => ({ …d, days: { …d.days, [currentDay]: […newEntries, …(d.days[currentDay] || [])] } }));
}

function removeEntry(id) {
setAppData(d => ({ …d, days: { …d.days, [currentDay]: (d.days[currentDay] || []).filter(e => e.id !== id) } }));
}

async function processAndLog(text, forceEstimate = false) {
setLoading(true); setError(””);
try {
const classRaw = await apiCall(CLASSIFIER_PROMPT, text, 300);
const classification = JSON.parse(classRaw.replace(/`json|`/g, “”).trim());

```
  const shouldLog = classification.specificity === "specific" || forceEstimate || defaultMode === "estimate";

  if (shouldLog) {
    const macroRaw = await apiCall(MACRO_PROMPT, text, 600);
    const macros = JSON.parse(macroRaw.replace(/```json|```/g, "").trim());
    addEntries(macros, classification.intent);
    setInput(""); setPendingClass(null); setPendingInput(""); setWaitingForDetail(false);
    inputRef.current?.focus();
  } else {
    setPendingClass(classification); setPendingInput(text); setInput("");
  }
} catch (e) {
  setError("Could not parse that - try being a bit more specific.");
}
setLoading(false);
```

}

async function handleClarifyAction(action) {
if (action === “suggest_meal”) {
setLoading(true);
try {
const suggestion = await apiCall(MEAL_SUGGESTION_PROMPT, `Foods: ${pendingClass.foods.join(", ")}`, 400);
setMealSuggestion({ text: suggestion, foods: pendingClass.foods, intent: pendingClass.intent });
setPendingClass(null);
} catch { setError(“Could not get meal suggestions.”); }
setLoading(false);
} else {
setWaitingForDetail(true); setPendingClass(null);
setTimeout(() => inputRef.current?.focus(), 100);
}
}

async function handleSubmit() {
if (!input.trim() || loading) return;
if (waitingForDetail) {
setWaitingForDetail(false);
await processAndLog(pendingInput + “ - more detail: “ + input.trim(), false);
} else {
await processAndLog(input.trim());
}
}

function handleNewDay() {
const today = todayStr();
setAppData(d => ({ …d, currentDay: today, days: { …d.days, [today]: [] } }));
setShowDayModal(false);
}

if (!appData) return <div style={{ minHeight: “100dvh”, background: “#0a0a0a” }} />;
if (!appData.settings) return <Onboarding onComplete={s => { const t = todayStr(); setAppData({ settings: s, days: { [t]: [] }, currentDay: t }); }} />;

const sortedDays = Object.keys(appData.days || {}).sort((a, b) => b.localeCompare(a));
const inputPlaceholder = waitingForDetail ? “Add more detail (brand, size, weight)…” : loading ? “Analyzing…” : “What did you eat? What are you planning?”;

return (
<div style={{ minHeight: “100dvh”, background: “#0a0a0a”, color: “#fff”, fontFamily: “system-ui, sans-serif”, maxWidth: 430, margin: “0 auto”, boxSizing: “border-box” }}>
{showDayModal && <DayModal lastDate={appData.currentDay} onNewDay={handleNewDay} onContinue={() => setShowDayModal(false)} />}

```
  <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
    <div>
      <div style={{ fontSize: 11, color: "#c8f060", letterSpacing: 4, textTransform: "uppercase", fontFamily: "monospace" }}>
        {new Date(currentDay + "T12:00:00").toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
      </div>
      <h1 style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Macro Log</h1>
    </div>
    <button onClick={() => setShowDayModal(true)} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, color: "#666", fontSize: 11, padding: "7px 12px", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontFamily: "monospace" }}>New Day</button>
  </div>

  <div style={{ display: "flex", padding: "16px 20px 0" }}>
    {["log", "history"].map(t => (
      <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "10px", background: tab === t ? "#111" : "transparent", border: tab === t ? "1px solid #222" : "1px solid transparent", borderRadius: t === "log" ? "10px 0 0 10px" : "0 10px 10px 0", color: tab === t ? "#fff" : "#444", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace", transition: "all 0.15s" }}>{t}</button>
    ))}
  </div>

  {tab === "log" && (
    <div style={{ padding: "16px 20px 140px" }}>
      <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 16, padding: "20px 20px 16px", marginBottom: 16 }}>
        <CalorieDial calories={totals.calories} goal={goals.calories} />
        <Bar label="PROTEIN" value={totals.protein} goal={goals.protein} color="#60f0b8" />
        <Bar label="CARBS"   value={totals.carbs}   goal={goals.carbs}   color="#f0c060" />
        <Bar label="FAT"     value={totals.fat}     goal={goals.fat}     color="#f06090" />
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        {Object.entries(IS).map(([k, s]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: s.badge }} />
            <span style={{ fontSize: 10, color: "#555", letterSpacing: 1, textTransform: "uppercase", fontFamily: "monospace" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {pendingClass && (
        <ClarifyBubble classification={pendingClass} onClarify={handleClarifyAction} onEstimate={() => processAndLog(pendingInput, true)} onDismiss={() => { setPendingClass(null); setPendingInput(""); }} loading={loading} />
      )}

      {mealSuggestion && (
        <MealSuggestionBubble suggestion={mealSuggestion.text} foods={mealSuggestion.foods} onLogItem={food => { setInput(food); setMealSuggestion(null); inputRef.current?.focus(); }} onDismiss={() => setMealSuggestion(null)} />
      )}

      {waitingForDetail && (
        <div style={{ background: "#0d1520", border: "1px solid #1a3a5a", borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#60b8f0", fontFamily: "monospace" }}>
          Adding detail to: <span style={{ color: "#fff" }}>{pendingInput}</span>
          <button onClick={() => { setWaitingForDetail(false); setPendingInput(""); }} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 11, marginLeft: 10 }}>cancel</button>
        </div>
      )}

      {entries.length === 0 && !pendingClass && !mealSuggestion && (
        <div style={{ textAlign: "center", color: "#333", fontSize: 13, padding: "40px 0", fontFamily: "monospace" }}>Nothing logged yet. Type below to get started.</div>
      )}

      {entries.map(e => <FoodEntry key={e.id} entry={e} onRemove={() => removeEntry(e.id)} />)}
    </div>
  )}

  {tab === "history" && (
    <div style={{ padding: "16px 20px 120px" }}>
      {sortedDays.length === 0 && <div style={{ textAlign: "center", color: "#333", fontSize: 13, padding: "40px 0" }}>No history yet.</div>}
      {sortedDays.map(day => {
        const de = appData.days[day] || [];
        const dt = de.reduce((a, e) => e.intent === "hypothetical" ? a : ({ calories: a.calories + e.calories, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
        const isToday = day === currentDay;
        return (
          <div key={day} style={{ background: "#0f0f0f", border: `1px solid ${isToday ? "#2a3a1a" : "#1a1a1a"}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: isToday ? "#c8f060" : "#888", fontWeight: 700, fontFamily: "monospace", letterSpacing: 1 }}>
                {isToday ? "TODAY" : new Date(day + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <span style={{ fontSize: 13, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>{dt.calories} <span style={{ color: "#555", fontWeight: 400 }}>cal</span></span>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#555", fontFamily: "monospace" }}>
              <span>P: <span style={{ color: "#888" }}>{dt.protein}g</span></span>
              <span>C: <span style={{ color: "#888" }}>{dt.carbs}g</span></span>
              <span>F: <span style={{ color: "#888" }}>{dt.fat}g</span></span>
              <span style={{ marginLeft: "auto", color: "#333" }}>{de.length} items</span>
            </div>
          </div>
        );
      })}
    </div>
  )}

  <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "linear-gradient(to top, #0a0a0a 70%, transparent)", padding: "16px 20px 28px", boxSizing: "border-box" }}>
    {error && <div style={{ color: "#ff6b6b", fontSize: 12, marginBottom: 8, fontFamily: "monospace", textAlign: "center" }}>{error}</div>}
    <div style={{ display: "flex", gap: 10 }}>
      <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder={inputPlaceholder} disabled={loading}
        style={{ flex: 1, background: waitingForDetail ? "#0d1520" : "#111", border: `1px solid ${waitingForDetail ? "#1a3a5a" : "#222"}`, borderRadius: 14, color: "#fff", fontSize: 15, padding: "14px 16px", outline: "none", fontFamily: "system-ui, sans-serif", boxSizing: "border-box", transition: "all 0.2s" }} />
      <button onClick={handleSubmit} disabled={!input.trim() || loading}
        style={{ width: 50, height: 50, borderRadius: 14, border: "none", background: input.trim() && !loading ? "#c8f060" : "#1a1a1a", color: input.trim() && !loading ? "#0a0a0a" : "#333", fontSize: 20, cursor: input.trim() && !loading ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0 }}>
        {loading ? "..." : "+"}
      </button>
    </div>
  </div>
</div>
```

);
}
