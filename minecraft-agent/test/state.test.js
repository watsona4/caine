"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { formatState } = require("../src/state");

test("formatState reports position, dimension, health, and food", () => {
  const text = formatState({
    position: { x: 1.2, y: 64, z: -8.5 },
    dimension: "overworld",
    health: 18,
    food: 12,
    isDaytime: true,
    heldItem: "iron_pickaxe",
    inventory: { oak_log: 4, cobblestone: 12 },
    nearbyEntities: [{ name: "zombie", distance: 5.3 }],
  });

  assert.match(text, /Position: \(1\.2, 64, -8\.5\) in overworld/);
  assert.match(text, /Health: 18\/20  Food: 12\/20/);
  assert.match(text, /Time: day/);
  assert.match(text, /Held item: iron_pickaxe/);
  assert.match(text, /oak_log x4/);
  assert.match(text, /cobblestone x12/);
  assert.match(text, /zombie \(5\.3m\)/);
});

test("formatState handles empty inventory and no nearby entities", () => {
  const text = formatState({
    position: { x: 0, y: 0, z: 0 },
    dimension: "the_end",
    health: 20,
    food: 20,
    isDaytime: null,
    heldItem: null,
    inventory: {},
    nearbyEntities: [],
  });

  assert.match(text, /Held item: \(empty hand\)/);
  assert.match(text, /Inventory: \(empty\)/);
  assert.match(text, /Nearby entities: \(none within 32m\)/);
  assert.match(text, /Time: unknown/);
});
