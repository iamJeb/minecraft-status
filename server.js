import express from "express";
import { status } from "minecraft-server-util";
import fs from "fs";

const app = express();

const PORT = process.env.PORT || 8080;
const SERVER_HOST = process.env.SERVER_HOST;
const SERVER_PORT = parseInt(process.env.SERVER_PORT);

app.get("/", async (req, res) => {
  try {
    const result = await status(SERVER_HOST, SERVER_PORT, { timeout: 3000 });
    const players =
      result.players.sample && result.players.sample.length > 0
        ? result.players.sample.map((p) => p.name).join(", ")
        : "None";

    const logLines = getRecentLogLines();

    res.send(`
      <html>
        <head>
          <title>Minecraft Server Dashboard</title>
          <meta http-equiv="refresh" content="60">
          <style>
            body {
              font-family: 'Segoe UI', sans-serif;
              background-color: #0b0c10;
              color: #c5c6c7;
              margin: 0;
              padding: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              min-height: 100vh;
            }
            h1 {
              margin-top: 40px;
              color: #66fcf1;
              font-size: 2.5rem;
            }
            .card {
              background: #1f2833;
              border: 1px solid #45a29e;
              border-radius: 12px;
              padding: 20px 40px;
              width: 80%;
              max-width: 800px;
              box-shadow: 0 0 20px rgba(69, 162, 158, 0.3);
              margin-top: 20px;
            }
            .status-online {
              color: #45a29e;
            }
            .status-offline {
              color: #ff5555;
            }
            .log-box {
              background: #0b0c10;
              color: #66fcf1;
              font-family: monospace;
              border-radius: 8px;
              padding: 10px;
              margin-top: 15px;
              max-height: 300px;
              overflow-y: auto;
              white-space: pre-wrap;
            }
            .footer {
              margin-top: auto;
              color: #555;
              padding: 20px;
              font-size: 0.8rem;
            }
          </style>
        </head>
        <body>
          <h1>Minecraft Server Dashboard</h1>
          <div class="card">
            <p><b>Host:</b> ${SERVER_HOST}:${SERVER_PORT}</p>
            <p><b>Status:</b> <span class="status-online">✔ Online</span></p>
            <p><b>Players Online:</b> ${result.players.online}</p>
            <p><b>Names:</b> ${players}</p>
            <p><b>Latency:</b> ${result.roundTripLatency} ms</p>
          </div>

          <div class="card">
            <h3>Recent Log Lines</h3>
            <div class="log-box">${logLines}</div>
          </div>

          <div class="footer">Auto-refreshes every 60 seconds • Azure Web App</div>
        </body>
      </html>
    `);
  } catch (err) {
    res.send(`
      <html>
        <head>
          <title>Minecraft Server Dashboard</title>
          <meta http-equiv="refresh" content="60">
          <style>
            body {
              font-family: 'Segoe UI', sans-serif;
              background-color: #0b0c10;
              color: #c5c6c7;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              flex-direction: column;
            }
            .status-offline {
              color: #ff5555;
              font-size: 1.5rem;
            }
          </style>
        </head>
        <body>
          <h1>Minecraft Server Dashboard</h1>
          <p class="status-offline">❌ Offline or Timeout</p>
        </body>
      </html>
    `);
  }
});

// Function to get last 15 log lines
function getRecentLogLines() {
  try {
    const logPath = "/home/logs/Minecraft/latest.log"; // example path, we'll fix this in step 2
    const data = fs.readFileSync(logPath, "utf8");
    const lines = data.trim().split("\n");
    return lines.slice(-15).join("\n");
  } catch {
    return "Logs unavailable.";
  }
}

app.listen(PORT, () =>
  console.log(`Web app running on port ${PORT}`)
);
