"use strict";

/**
 * Turn a mineflayer bot into a plain-data snapshot. Kept separate from
 * formatState() so the formatting logic can be unit-tested without a live
 * bot/server connection.
 */
function extractState(bot) {
  const position = bot.entity.position;
  const inventory = {};
  for (const item of bot.inventory.items()) {
    inventory[item.name] = (inventory[item.name] || 0) + item.count;
  }

  const nearbyEntities = Object.values(bot.entities)
    .filter((e) => e !== bot.entity && e.position && e.position.distanceTo(position) < 32)
    .map((e) => ({
      name: e.name || e.username || e.displayName || "unknown",
      kind: e.kind,
      distance: Math.round(e.position.distanceTo(position) * 10) / 10,
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 15);

  return {
    position: {
      x: Math.round(position.x * 10) / 10,
      y: Math.round(position.y * 10) / 10,
      z: Math.round(position.z * 10) / 10,
    },
    dimension: bot.game ? bot.game.dimension : "unknown",
    health: bot.health,
    food: bot.food,
    isDaytime: bot.time ? bot.time.timeOfDay < 12000 : null,
    heldItem: bot.heldItem ? bot.heldItem.name : null,
    inventory,
    nearbyEntities,
  };
}

/** Pure function: state snapshot -> text block for the LLM prompt. */
function formatState(state) {
  const lines = [];
  lines.push(
    `Position: (${state.position.x}, ${state.position.y}, ${state.position.z}) in ${state.dimension}`
  );
  lines.push(`Health: ${state.health}/20  Food: ${state.food}/20`);
  lines.push(`Time: ${state.isDaytime === null ? "unknown" : state.isDaytime ? "day" : "night"}`);
  lines.push(`Held item: ${state.heldItem || "(empty hand)"}`);

  const invEntries = Object.entries(state.inventory);
  lines.push(
    invEntries.length
      ? `Inventory: ${invEntries.map(([name, count]) => `${name} x${count}`).join(", ")}`
      : "Inventory: (empty)"
  );

  lines.push(
    state.nearbyEntities.length
      ? `Nearby entities: ${state.nearbyEntities
          .map((e) => `${e.name} (${e.distance}m)`)
          .join(", ")}`
      : "Nearby entities: (none within 32m)"
  );

  return lines.join("\n");
}

module.exports = { extractState, formatState };
