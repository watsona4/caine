"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { Agent } = require("../src/agent");

function makeFakeBot() {
  return {
    entity: { position: { x: 0, y: 64, z: 0 } },
    game: { dimension: "overworld" },
    time: { timeOfDay: 1000 },
    heldItem: null,
    health: 20,
    food: 20,
    inventory: { items: () => [] },
    entities: {},
    on: () => {},
  };
}

function makeFakeClient(handler) {
  return { messages: { create: async (req) => handler(req) } };
}

test("Agent.run stops once maxSteps is reached", async () => {
  let calls = 0;
  const client = makeFakeClient(async () => {
    calls += 1;
    return { content: [{ type: "text", text: `thinking ${calls}` }] };
  });

  const agent = new Agent({ bot: makeFakeBot(), client, maxSteps: 3 });
  const result = await agent.run();

  assert.equal(result.steps, 3);
  assert.equal(result.won, false);
  assert.equal(calls, 3);
});

test("Agent.run executes tool calls and feeds results back", async () => {
  const seenRequests = [];
  const client = makeFakeClient(async (req) => {
    seenRequests.push(req);
    if (seenRequests.length === 1) {
      return {
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "report_status",
            input: { message: "heading out" },
          },
        ],
      };
    }
    return { content: [{ type: "text", text: "done" }] };
  });

  const agent = new Agent({ bot: makeFakeBot(), client, maxSteps: 2 });
  await agent.run();

  const toolResultMessage = agent.messages.find(
    (m) => Array.isArray(m.content) && m.content[0] && m.content[0].type === "tool_result"
  );
  assert.ok(toolResultMessage, "expected a tool_result message to be recorded");
  assert.match(toolResultMessage.content[0].content, /heading out/);
});

test("Agent.run stops early once declareVictory is called", async () => {
  const client = makeFakeClient(async () => {
    agent.declareVictory();
    return { content: [{ type: "text", text: "the dragon fell" }] };
  });

  const agent = new Agent({ bot: makeFakeBot(), client, maxSteps: 10 });
  const result = await agent.run();

  assert.equal(result.steps, 1);
  assert.equal(result.won, true);
});

test("checkVictory declares victory only for the Ender Dragon", () => {
  const agent = new Agent({ bot: makeFakeBot(), client: makeFakeClient(async () => ({ content: [] })) });

  agent.checkVictory({ name: "zombie" });
  assert.equal(agent.won, false);

  agent.checkVictory({ name: "ender_dragon" });
  assert.equal(agent.won, true);
});

test("run() registers checkVictory on the bot's entityDead event", async () => {
  let registeredHandler = null;
  const bot = makeFakeBot();
  bot.on = (event, handler) => {
    if (event === "entityDead") registeredHandler = handler;
  };

  const client = makeFakeClient(async () => ({ content: [] }));
  const agent = new Agent({ bot, client, maxSteps: 1 });
  await agent.run();

  assert.ok(registeredHandler, "expected an entityDead handler to be registered");
  registeredHandler({ name: "ender_dragon" });
  assert.equal(agent.won, true);
});

test("trimHistory only cuts at a safe boundary, never splitting a tool_use/tool_result pair", async () => {
  // Every 4th response is plain text (triggering a fresh state observation,
  // a safe cut boundary); the rest call a tool (producing a tool_use +
  // tool_result pair that must never be split by trimming).
  let call = 0;
  const client = makeFakeClient(async () => {
    call += 1;
    if (call % 4 === 0) {
      return { content: [{ type: "text", text: "reassessing" }] };
    }
    return {
      content: [{ type: "tool_use", id: `call_${call}`, name: "report_status", input: { message: "x" } }],
    };
  });

  const agent = new Agent({ bot: makeFakeBot(), client, maxSteps: 40 });
  await agent.run();

  assert.ok(agent.messages.length > 0, "history should never be wiped out entirely");
  for (let i = 0; i < agent.messages.length; i++) {
    const message = agent.messages[i];
    const isToolResult = Array.isArray(message.content) && message.content[0]?.type === "tool_result";
    if (isToolResult) {
      assert.ok(i > 0, "a tool_result should never be the first retained message");
      const prev = agent.messages[i - 1];
      const prevIsToolUse = Array.isArray(prev.content) && prev.content.some((b) => b.type === "tool_use");
      assert.ok(prevIsToolUse, "every retained tool_result must be preceded by its tool_use");
    }
  }
});
