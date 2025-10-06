import express from "express";
import fetch from "node-fetch";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CONFIG ----
const MINECRAFT_SERVER = "minecraft.iamjeb.com"; // no port
const REFRESH_INTERVAL = 60; // seconds
const TIMEZONE = "America/Detroit"; // Corrected timezone

// ---- Path setup ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname + "/public"));

// ---- Helper: Convert uptime seconds ----
function formatUptime(seconds) {
  const days = Math.floor(seconds / (3600 * 24));
  seconds %= 3600 * 24;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds = Math.floor(seconds % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// ---- API to check Minecraft status ----
app.get("/api/status", async (req, res) => {
  try {
    const response = await fetch(`https://api.mcstatus.io/v2/status/java/${MINECRAFT_SERVER}`);
    const data = await response.json();

    const isOnline = data.online;
    const playerCount = isOnline ? data.players.online : 0;
    const latency = isOnline ? data.latency : null;

    res.json({
      online: isOnline,
      playerCount,
      latency,
      hostname: data.host,
      version: data.version?.name_clean || "Unknown",
      motd: data.motd?.clean || "",
      time: new Date().toLocaleString("en-US", { timeZone: TIMEZONE }),
      uptime: formatUptime(process.uptime()),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch server status" });
  }
});

// ---- Web page ----
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>iamJeb's Public Server Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          background-color: #0b0b0e;
          color: #e3e3e3;
          font-family: 'Segoe UI', Roboto, sans-serif;
          text-align: center;
          margin: 0;
          padding: 0;
        }
        h1 {
          color: #00ffb3;
          font-size: 2.2rem;
          margin-top: 30px;
        }
        #statusBox {
          background-color: #141417;
          border: 1px solid #2a2a2e;
          border-radius: 12px;
          box-shadow: 0 0 25px rgba(0, 255, 200, 0.1);
          margin: 40px auto;
          max-width: 600px;
          padding: 25px;
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
          font-size: 0.85rem;
          margin-top: 40px;
        }
        canvas {
          max-width: 600px;
          margin: 30px auto;
          display: block;
        }
        .refresh {
          color: #888;
          font-size: 0.9rem;
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
              backgroundColor: 'rgba(0,255,179,0.2)',
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
            const res = await fetch('/api/status');
            const data = await res.json();

            document.getElementById('status').innerHTML = data.online 
              ? '<span class="badge online">Online</span>'
              : '<span class="badge offline">Offline</span>';
            document.getElementById('players').textContent = data.playerCount;
            document.getElementById('latency').textContent = data.latency ?? '-';
            document.getElementById('time').textContent = data.time;
            document.getElementById('uptime').textContent = data.uptime;

            if (data.latency) {
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
