"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { TOOL_DEFINITIONS, executeTool, findNearestEntityByName } = require("../src/tools");

test("every tool definition has a name, description, and valid-looking schema", () => {
  assert.ok(TOOL_DEFINITIONS.length > 0);
  for (const tool of TOOL_DEFINITIONS) {
    assert.equal(typeof tool.name, "string");
    assert.ok(tool.name.length > 0);
    assert.equal(typeof tool.description, "string");
    assert.equal(tool.input_schema.type, "object");
    assert.equal(typeof tool.input_schema.properties, "object");
    assert.ok(Array.isArray(tool.input_schema.required));
  }
});

test("tool names are unique", () => {
  const names = TOOL_DEFINITIONS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
});

test("executeTool rejects an unknown tool name", async () => {
  await assert.rejects(() => executeTool({}, "not_a_real_tool", {}), /Unknown tool/);
});

test("report_status does not require a bot and echoes the message", async () => {
  const result = await executeTool({}, "report_status", { message: "heading to the Nether" });
  assert.match(result, /heading to the Nether/);
});

function makeFakeEntity(name, x) {
  return {
    name,
    position: { distanceTo: (other) => Math.abs(x - other.x) },
  };
}

test("findNearestEntityByName returns the closest match by name", () => {
  const bot = {
    entity: { position: { x: 0 } },
    entities: {
      a: makeFakeEntity("zombie", 10),
      b: makeFakeEntity("zombie", 3),
      c: makeFakeEntity("skeleton", 1),
    },
  };
  bot.entities.self = bot.entity;

  const nearest = findNearestEntityByName(bot, "zombie");
  assert.equal(nearest.position.distanceTo(bot.entity.position), 3);
});

test("findNearestEntityByName returns null when nothing matches", () => {
  const bot = {
    entity: { position: { x: 0 } },
    entities: { a: makeFakeEntity("cow", 5) },
  };
  assert.equal(findNearestEntityByName(bot, "zombie"), null);
});
