// ===== iamJeb – Minecraft Public Dashboard (no server tweaks needed) =====
import express from "express";
import { status as mcStatus } from "minecraft-server-util";

const app = express();

// ---------- Config ----------
const HOST = process.env.SERVER_HOST || "localhost";
const PORT = parseInt(process.env.SERVER_PORT || "25565", 10);
const REFRESH_MS = parseInt(process.env.REFRESH_MS || "60000", 10);
const SERVER_TZ = process.env.SERVER_TZ || "America/Los_Angeles"; // display only
const QUERY_TIMEOUT_MS = 3000;

// ---------- In-memory state (survives across requests on this instance) ----------
const latencyHistory = [];              // [{t:number, ms:number}]
const MAX_HISTORY = 15;

let lastPlayersSet = new Set();         // tracks joins/leaves between polls
const events = [];                      // [{t:number, who:string, type:'join'|'leave'}]
const MAX_EVENTS = 20;

let online = false;
let lastOnlineChange = Date.now();      // when the current online/offline state started
let lastSuccessfulPingAt = 0;           // when we last got a valid status

// Poll function we call on each page hit (lightweight)
async function poll() {
  try {
    const result = await mcStatus(HOST, PORT, { timeout: QUERY_TIMEOUT_MS });

    // Online/offline transition tracking
    if (!online) {
      online = true;
      lastOnlineChange = Date.now();
    }

    lastSuccessfulPingAt = Date.now();

    // Latency history
    const latency = typeof result.roundTripLatency === "number"
      ? Math.round(result.roundTripLatency)
      : null;

    if (latency !== null) {
      latencyHistory.push({ t: Date.now(), ms: latency });
      if (latencyHistory.length > MAX_HISTORY) latencyHistory.shift();
    }

    // Players
    const sample = Array.isArray(result.players?.sample)
      ? result.players.sample.map(p => p.name)
      : [];

    const currentSet = new Set(sample);

    // Detect joins/leaves
    for (const name of currentSet) {
      if (!lastPlayersSet.has(name)) {
        events.push({ t: Date.now(), who: name, type: "join" });
      }
    }
    for (const name of lastPlayersSet) {
      if (!currentSet.has(name)) {
        events.push({ t: Date.now(), who: name, type: "leave" });
      }
    }
    while (events.length > MAX_EVENTS) events.shift();

    lastPlayersSet = currentSet;

    return {
      ok: true,
      latency,
      players: sample,
    };
  } catch (err) {
    // Mark offline on error/timeouts
    if (online) {
      online = false;
      lastOnlineChange = Date.now();
    }
    return { ok: false, err: err?.message || String(err) };
  }
}

// Format helpers
function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${ss}s`);
  return parts.join(" ");
}

function fmtTime(ts) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SERVER_TZ,
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "2-digit",
  }).format(ts);
}

// ---------- Routes ----------
app.get("/", async (req, res) => {
  const snapshot = await poll();

  // Prepare data for client-side chart
  const histLabels = latencyHistory.map(p => p.t);
  const histValues = latencyHistory.map(p => p.ms);

  const players = Array.from(lastPlayersSet);
  const statusBadge = online
    ? `<span class="pill ok">Online</span>`
    : `<span class="pill bad">Offline</span>`;

  const uptimeMs = online ? (Date.now() - lastOnlineChange) : 0;
  const uptime = online ? fmtDuration(uptimeMs) : "—";

  // HTML
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>iamJeb's Minecraft Server Public Dashboard</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root{
    --bg:#0b0b0f;
    --panel:#14141c;
    --glass:rgba(255,255,255,0.06);
    --txt:#e7e7ef;
    --muted:#a7a7bf;
    --ok:#22c55e;
    --bad:#ef4444;
    --accent:#7c3aed;
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:radial-gradient(1200px 800px at 10% -20%, #1b1530 0%, transparent 60%),
               radial-gradient(1200px 800px at 110% 120%, #13263a 0%, transparent 60%),
               var(--bg);
    color:var(--txt); font:16px/1.5 Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .wrap{max-width:1100px;margin:48px auto;padding:0 20px}
  .topbar{
    display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;margin-bottom:24px
  }
  h1{margin:0;font-weight:800;letter-spacing:.2px}
  .pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;
        background:var(--glass);backdrop-filter: blur(8px); border:1px solid rgba(255,255,255,.08)}
  .pill.ok{color:#0a2916;background:rgba(34,197,94,.18);border-color:rgba(34,197,94,.35)}
  .pill.bad{color:#2a0a0a;background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.35)}
  .grid{display:grid;gap:16px;grid-template-columns:repeat(12,1fr)}
  .card{grid-column:span 12;background:linear-gradient( to bottom right, rgba(255,255,255,.06), rgba(255,255,255,.03));
        border:1px solid rgba(255,255,255,.08); border-radius:18px; padding:18px 18px 14px; backdrop-filter: blur(8px)}
  .card h3{margin:0 0 12px 0;font-weight:700; color:#fff}
  .kpi{font-size:28px;font-weight:800}
  .muted{color:var(--muted);font-size:13px}
  @media(min-width:800px){
    .span-4{grid-column:span 4}
    .span-6{grid-column:span 6}
    .span-8{grid-column:span 8}
  }
  .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  .tag{padding:4px 10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.04)}
  .names {display:flex;flex-wrap:wrap;gap:8px}
  .countdown{font-variant-numeric:tabular-nums}
  .footer{margin-top:18px;color:var(--muted);font-size:12px;text-align:center}
  canvas{max-height:280px}
  .event{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed rgba(255,255,255,.08)}
  .event:last-child{border-bottom:0}
  .evt-tag{font-weight:700}
  .evt-join{color:var(--ok)}
  .evt-leave{color:var(--bad)}
</style>
</head>
<body>
<div class="wrap">

  <div class="topbar">
    <div>
      <h1>iamJeb's Minecraft Server Public Dashboard</h1>
      <div class="muted">Querying <b>${HOST}:${PORT}</b></div>
    </div>
    <div class="row">
      ${statusBadge}
      <span class="pill">Refresh in <span id="cd" class="countdown">${Math.floor(REFRESH_MS/1000)}</span>s</span>
    </div>
  </div>

  <div class="grid">

    <div class="card span-4">
      <h3>Status</h3>
      <div class="kpi">${online ? "Online ✅" : "Offline ❌"}</div>
      <div class="muted">Last check: ${fmtTime(Date.now())} (${SERVER_TZ})</div>
    </div>

    <div class="card span-4">
      <h3>Uptime</h3>
      <div class="kpi">${uptime}</div>
      <div class="muted">${online ? "Since last online: " + fmtTime(lastOnlineChange) : "—"}</div>
    </div>

    <div class="card span-4">
      <h3>Players Online</h3>
      <div class="kpi">${players.length}</div>
      <div class="names">
        ${players.length ? players.map(n => `<span class="tag">${escapeHtml(n)}</span>`).join("") : `<span class="muted">None</span>`}
      </div>
    </div>

    <div class="card span-8">
      <h3>Latency (ms) – last ${MAX_HISTORY} checks</h3>
      <canvas id="latChart"></canvas>
    </div>

    <div class="card span-4">
      <h3>Join / Leave (recent)</h3>
      ${events.length
        ? events.slice().reverse().map(e => `
            <div class="event">
              <div><span class="evt-tag ${e.type==='join' ? 'evt-join' : 'evt-leave'}">${e.type.toUpperCase()}</span> — ${escapeHtml(e.who)}</div>
              <div class="muted">${fmtTime(e.t)}</div>
            </div>
          `).join("")
        : `<div class="muted">No recent activity</div>`}
    </div>

  </div>

  <div class="footer">Auto refreshes every ${Math.floor(REFRESH_MS/1000)}s • Server time zone: ${SERVER_TZ}</div>
</div>

<script>
  // countdown
  (function(){
    const el = document.getElementById('cd');
    let left = ${Math.floor(REFRESH_MS/1000)};
    setInterval(()=>{
      left = Math.max(0, left - 1);
      el.textContent = left;
      if(left === 0) location.reload();
    }, 1000);
  })();

  // latency chart
  (function(){
    const labels = ${JSON.stringify(histLabels)};
    const values = ${JSON.stringify(histValues)};
    const ctx = document.getElementById('latChart').getContext('2d');
    const fmt = (ts) => new Date(ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(fmt),
        datasets: [{
          label: 'ms',
          data: values,
          tension: .3,
          borderWidth: 2,
          pointRadius: 2,
        }]
      },
      options: {
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.08)' } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.08)' } }
        }
      }
    });
  })();

  // keep dark bg for chart tooltips
  Chart.defaults.color = '#e7e7ef';
</script>
</body>
</html>`);
});

// Simple health probe
app.get("/healthz", (req, res) => res.send("ok"));

const webPort = process.env.PORT || 8080;
app.listen(webPort, () => {
  console.log(`Web app running on port ${webPort}`);
});

// Minimal HTML escaping
function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
