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
