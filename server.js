// server.js
import express from "express";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { status as mcStatus } from "minecraft-server-util";

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CONFIG ----
const MINECRAFT_SERVER = "minecraft.iamjeb.com"; // hostname only
const JAVA_PORT = 25565;
const REFRESH_INTERVAL = 60; // seconds
const TIMEZONE = "America/Detroit"; // Detroit

// ---- Path setup ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// ---- Helpers ----
function formatUptime(seconds) {
  const days = Math.floor(seconds / (3600 * 24));
  seconds %= 3600 * 24;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds = Math.floor(seconds % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// ---- Status API (direct ping first, public API fallback) ----
app.get("/api/status", async (_req, res) => {
  try {
    // Direct ping from the app to your server
    const ping = await mcStatus(MINECRAFT_SERVER, {
      port: JAVA_PORT,
      enableSRV: true,
      timeout: 3000,
    });

    // minecraft-server-util v5 returns something like:
    // { version, players: { online, max, sample }, roundTripLatency, motd, ... }
    const playerCount =
      (ping.players && (ping.players.online ?? ping.players.onlinePlayers)) ?? 0;
    const latency = ping.roundTripLatency ?? null;

    return res.json({
      online: true,
      playerCount,
      latency,
      hostname: MINECRAFT_SERVER,
      version: ping.version?.name || ping.version || "Unknown",
      motd:
        (ping.motd &&
          (Array.isArray(ping.motd.clean)
            ? ping.motd.clean.join(" ")
            : ping.motd.clean || ping.motd)) ||
        "",
      time: new Date().toLocaleString("en-US", { timeZone: TIMEZONE }),
      uptime: formatUptime(process.uptime()),
    });
  } catch (e) {
    // Fallback to mcstatus API (best-effort) to avoid false “offline”
    try {
      const resp = await fetch(
        `https://api.mcstatus.io/v2/status/java/${encodeURIComponent(
          MINECRAFT_SERVER
        )}`
      );
      if (!resp.ok) throw new Error("mcstatus non-200");
      const data = await resp.json();

      const isOnline = !!data.online;
      const playerCount = isOnline ? data.players?.online ?? 0 : 0;
      const latency = isOnline ? data.latency ?? null : null;

      return res.json({
        online: isOnline,
        playerCount,
        latency,
        hostname: data.host || MINECRAFT_SERVER,
        version: data.version?.name_clean || "Unknown",
        motd: data.motd?.clean || "",
        time: new Date().toLocaleString("en-US", { timeZone: TIMEZONE }),
        uptime: formatUptime(process.uptime()),
      });
    } catch {
      return res.json({
        online: false,
        playerCount: 0,
        latency: null,
        hostname: MINECRAFT_SERVER,
        version: "Unknown",
        motd: "",
        time: new Date().toLocaleString("en-US", { timeZone: TIMEZONE }),
        uptime: formatUptime(process.uptime()),
      });
    }
  }
});

// ---- Web page (old look, with your tweaks) ----
app.get("/", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>iamJeb's Public Server Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          background-color: #0f1115;
          color: #d7d7d7;
          font-family: 'Segoe UI', Roboto, sans-serif;
          text-align: center;
          margin: 0;
          padding: 0;
        }
        h1 {
          color: #00e0a0;
          font-size: 2.4rem;
          margin-top: 40px;
        }
        #statusBox {
          background-color: #181a20;
          border-radius: 12px;
          box-shadow: 0 0 15px rgba(0, 255, 160, 0.1);
          margin: 40px auto;
          max-width: 600px;
          padding: 25px;
          border: 1px solid #252830;
        }
        .badge {
          padding: 6px 12px;
          border-radius: 8px;
          font-weight: 600;
        }
        .online {
          background: #00ff99;
          color: #000;
        }
        .offline {
          background: #ff5252;
          color: #fff;
        }
        footer {
          color: #888;
          font-size: 0.9rem;
          margin-top: 40px;
          padding-bottom: 20px;
        }
        .refresh {
          color: #aaa;
          font-size: 0.95rem;
          margin-top: 15px;
        }
        canvas {
          max-width: 600px;
          margin: 30px auto;
          display: block;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <h1>iamJeb's Public Server Dashboard</h1>

      <div id="statusBox">
        <p><b>Status:</b> <span id="status">Checking...</span></p>
        <p><b>Players:</b> <span id="players">-</span></p>
        <p><b>Latency:</b> <span id="latency">-</span> ms</p>
        <p><b>Server Time:</b> <span id="time">-</span></p>
        <p><b>Uptime:</b> <span id="uptime">-</span></p>
      </div>

      <canvas id="latencyChart" width="400" height="200"></canvas>
      <div class="refresh">Auto-refresh in <span id="countdown">${REFRESH_INTERVAL}</span>s</div>

      <footer>Server query for <b>${MINECRAFT_SERVER}</b> • Timezone: ${TIMEZONE}</footer>

      <script>
        const REFRESH_INTERVAL = ${REFRESH_INTERVAL};
        let countdown = REFRESH_INTERVAL;
        let latencyData = [];
        let timeLabels = [];

        const ctx = document.getElementById('latencyChart').getContext('2d');
        const latencyChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: timeLabels,
            datasets: [{
              label: 'Latency (ms)',
              borderColor: '#00ffb3',
              backgroundColor: 'rgba(0,255,179,0.15)',
              data: latencyData,
              tension: 0.3
            }]
          },
          options: {
            scales: {
              x: { ticks: { color: '#aaa' } },
              y: { ticks: { color: '#aaa' } }
            },
            plugins: { legend: { labels: { color: '#ccc' } } }
          }
        });

        async function updateStatus() {
          try {
            const res = await fetch('/api/status', { cache: 'no-store' });
            const data = await res.json();

            document.getElementById('status').innerHTML = data.online
              ? '<span class="badge online">Online</span>'
              : '<span class="badge offline">Offline</span>';
            document.getElementById('players').textContent = data.playerCount;
            document.getElementById('latency').textContent = data.latency ?? '-';
            document.getElementById('time').textContent = data.time;
            document.getElementById('uptime').textContent = data.uptime;

            if (typeof data.latency === 'number') {
              const now = new Date().toLocaleTimeString("en-US", { timeZone: "${TIMEZONE}" });
              latencyData.push(data.latency);
              timeLabels.push(now);
              if (latencyData.length > 15) {
                latencyData.shift();
                timeLabels.shift();
              }
              latencyChart.update();
            }
          } catch (err) {
            document.getElementById('status').innerHTML = '<span class="badge offline">Offline</span>';
          }
        }

        function startCountdown() {
          setInterval(() => {
            countdown--;
            if (countdown <= 0) {
              countdown = REFRESH_INTERVAL;
              updateStatus();
            }
            document.getElementById('countdown').textContent = countdown;
          }, 1000);
        }

        updateStatus();
        startCountdown();
      </script>
    </body>
    </html>
  `);
});

// Simple healthcheck
app.get("/healthz", (_req, res) => res.send("ok"));

app.listen(PORT, () => console.log(`Web app running on port ${PORT}`));
