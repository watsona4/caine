"use strict";

const { TOOL_DEFINITIONS, executeTool } = require("./tools");
const { extractState, formatState } = require("./state");
const { log } = require("./logger");

const SYSTEM_PROMPT = `You are CAINE, an autonomous agent playing Minecraft Java Edition in
survival mode on a fresh, random-seed world. Your objective is to beat the
game as fast as possible: defeat the Ender Dragon in the End dimension.

Rough tech tree you'll need to follow, roughly in order (adapt as the
situation demands):
1. Punch trees for wood, craft a crafting table and basic wooden tools.
2. Mine stone, craft stone tools and a furnace.
3. Mine iron ore, smelt it, craft iron tools/armor and a bucket.
4. Get obsidian (mine with an iron+ pickaxe, or make it with water+lava)
   and build a Nether portal.
5. In the Nether: find a fortress, fight blazes for blaze rods, find
   piglins or endermen for ender pearls, craft eyes of ender.
6. Throw eyes of ender to triangulate the stronghold, find the portal
   room, activate the End portal.
7. In the End: destroy the obsidian pillars' end crystals, then fight and
   kill the Ender Dragon.

You act by calling exactly one tool per turn. After each tool call you'll
be shown the result and an updated snapshot of your state (position,
health, food, inventory, nearby entities). Use report_status to narrate
your plan when it's not obvious from the action itself. Prioritize safety
(don't starve, don't fight at low health, retreat from danger when
outmatched) but keep making forward progress -- the goal is speed, not
perfect play.`;

const MAX_HISTORY_MESSAGES = 40;

class Agent {
  constructor({ bot, client, model = "claude-sonnet-5", maxSteps = Infinity }) {
    this.bot = bot;
    this.client = client;
    this.model = model;
    this.maxSteps = maxSteps;
    this.messages = [];
    this.won = false;
    this.stopped = false;
  }

  declareVictory() {
    this.won = true;
  }

  stop() {
    this.stopped = true;
  }

  pushStateObservation() {
    const state = extractState(this.bot);
    this.messages.push({ role: "user", content: formatState(state) });
    this.trimHistory();
  }

  trimHistory() {
    if (this.messages.length > MAX_HISTORY_MESSAGES) {
      this.messages = this.messages.slice(this.messages.length - MAX_HISTORY_MESSAGES);
    }
  }

  async step() {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages: this.messages,
    });

    this.messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((block) => block.type === "tool_use");
    const textBlocks = response.content.filter((block) => block.type === "text");
    for (const block of textBlocks) {
      if (block.text.trim()) log("CAINE says:", block.text.trim());
    }

    if (toolUses.length === 0) {
      this.pushStateObservation();
      return;
    }

    const toolResults = [];
    for (const toolUse of toolUses) {
      log(`CAINE uses ${toolUse.name}`, toolUse.input);
      try {
        const result = await executeTool(this.bot, toolUse.name, toolUse.input);
        log(`-> ${result}`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      } catch (err) {
        log(`-> error: ${err.message}`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: `Error: ${err.message}`,
          is_error: true,
        });
      }
    }

    this.messages.push({ role: "user", content: toolResults });
    this.trimHistory();
  }

  async run() {
    this.pushStateObservation();
    let steps = 0;
    while (!this.won && !this.stopped && steps < this.maxSteps) {
      await this.step();
      steps += 1;
    }
    return { won: this.won, stopped: this.stopped, steps };
  }
}

module.exports = { Agent, SYSTEM_PROMPT };
