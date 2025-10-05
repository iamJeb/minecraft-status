import express from "express";
import { status } from "minecraft-server-util";

const app = express();
const PORT = process.env.PORT || 8080;
const SERVER_HOST = process.env.SERVER_HOST;
const SERVER_PORT = parseInt(process.env.SERVER_PORT);

app.get("/", async (req, res) => {
  try {
    const result = await status(SERVER_HOST, SERVER_PORT, { timeout: 3000 });
    const players = result.players.sample ? result.players.sample.map(p => p.name).join(", ") : "None";
    res.send(`
      <h2>Minecraft Server Status</h2>
      <p><b>Host:</b> ${SERVER_HOST}:${SERVER_PORT}</p>
      <p><b>Status:</b> ✅ Online</p>
      <p><b>Players Online:</b> ${result.players.online}</p>
      <p><b>Names:</b> ${players}</p>
      <p><b>Latency:</b> ${result.roundTripLatency} ms</p>
    `);
  } catch (err) {
    res.send(`
      <h2>Minecraft Server Status</h2>
      <p><b>Host:</b> ${SERVER_HOST}:${SERVER_PORT}</p>
      <p><b>Status:</b> ❌ Offline</p>
    `);
  }
});

app.listen(PORT, () => console.log(`Web app running on port ${PORT}`));
