"use strict";

require("dotenv").config();

const mineflayer = require("mineflayer");
const { pathfinder, Movements } = require("mineflayer-pathfinder");
const collectBlockPlugin = require("mineflayer-collectblock").plugin;
const Anthropic = require("@anthropic-ai/sdk");

const { Agent } = require("./agent");
const { log } = require("./logger");

const DRAGON_NAMES = new Set(["ender_dragon", "enderdragon"]);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  const host = process.env.MC_HOST || "localhost";
  const port = Number(process.env.MC_PORT || 25565);
  const username = process.env.MC_USERNAME || "CAINE";
  const model = process.env.CAINE_MODEL || "claude-sonnet-5";
  const maxSteps = process.env.CAINE_MAX_STEPS ? Number(process.env.CAINE_MAX_STEPS) : Infinity;

  log(`Connecting to ${host}:${port} as ${username}...`);
  const bot = mineflayer.createBot({ host, port, username });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(collectBlockPlugin);

  bot.once("spawn", async () => {
    log("Spawned. Setting up movements and starting agent loop.");
    bot.pathfinder.setMovements(new Movements(bot));

    const client = new Anthropic({ apiKey });
    const agent = new Agent({ bot, client, model, maxSteps });

    bot.on("entityDead", (entity) => {
      const name = entity.name || entity.username || entity.displayName;
      if (name && DRAGON_NAMES.has(name)) {
        log("The Ender Dragon has been defeated. CAINE wins.");
        agent.declareVictory();
      }
    });

    bot.on("death", () => {
      log("CAINE died and will respawn.");
    });

    bot.on("kicked", (reason) => log("Kicked from server:", reason));
    bot.on("error", (err) => log("Bot error:", err.message));

    const result = await agent.run();
    log("Agent loop finished:", result);
    process.exit(result.won ? 0 : 1);
  });
}

main().catch((err) => {
  log("Fatal error:", err.message);
  process.exit(1);
});
