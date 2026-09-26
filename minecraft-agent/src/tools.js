"use strict";

const { goals } = require("mineflayer-pathfinder");
const { Vec3 } = require("vec3");

/**
 * Tool definitions in Anthropic Messages API tool-use format. This is the
 * complete action surface CAINE is allowed to take -- deliberately a fixed,
 * hand-written set rather than LLM-generated/eval'd code, so a bad decision
 * from the model can only ever call one of these well-defined actions.
 */
const TOOL_DEFINITIONS = [
  {
    name: "move_to",
    description: "Pathfind to a coordinate in the current dimension.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
      required: ["x", "y", "z"],
    },
  },
  {
    name: "mine_block",
    description:
      "Find the nearest block(s) of the given type within range and mine them, walking to each one as needed.",
    input_schema: {
      type: "object",
      properties: {
        block: { type: "string", description: "Block name, e.g. 'oak_log', 'stone', 'iron_ore'." },
        count: { type: "integer", minimum: 1, default: 1 },
      },
      required: ["block"],
    },
  },
  {
    name: "craft_item",
    description:
      "Craft an item using the recipe book. Uses a nearby crafting table automatically if the recipe requires one.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "Item name, e.g. 'crafting_table', 'iron_pickaxe'." },
        count: { type: "integer", minimum: 1, default: 1 },
      },
      required: ["item"],
    },
  },
  {
    name: "smelt_item",
    description: "Smelt an item in the nearest furnace, using the given fuel.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "Item name to smelt, e.g. 'iron_ore'." },
        fuel: { type: "string", description: "Fuel item name, e.g. 'coal', 'oak_planks'." },
        count: { type: "integer", minimum: 1, default: 1 },
      },
      required: ["item", "fuel"],
    },
  },
  {
    name: "equip_item",
    description: "Equip an item from inventory to a body slot.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string" },
        destination: {
          type: "string",
          enum: ["hand", "off-hand", "head", "torso", "legs", "feet"],
          default: "hand",
        },
      },
      required: ["item"],
    },
  },
  {
    name: "place_block",
    description: "Place a block from inventory at the given coordinate, against the block below it.",
    input_schema: {
      type: "object",
      properties: {
        block: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
      required: ["block", "x", "y", "z"],
    },
  },
  {
    name: "use_item_on_block",
    description:
      "Right-click the held item against the given block coordinate. Used for buckets (scoop/pour), flint and steel (light a portal), etc.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
      required: ["x", "y", "z"],
    },
  },
  {
    name: "attack_entity",
    description: "Move to and attack the nearest entity matching the given name until it dies or flees out of range.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Entity name, e.g. 'zombie', 'blaze', 'ender_dragon'." },
      },
      required: ["name"],
    },
  },
  {
    name: "throw_item",
    description: "Equip and use (throw) a held item, e.g. an ender pearl or eye of ender.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string" },
      },
      required: ["item"],
    },
  },
  {
    name: "wait",
    description: "Do nothing for the given number of seconds.",
    input_schema: {
      type: "object",
      properties: {
        seconds: { type: "number", minimum: 0, maximum: 30, default: 1 },
      },
      required: [],
    },
  },
  {
    name: "report_status",
    description: "Narrate your current plan or reasoning. Does not take any game action.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
      required: ["message"],
    },
  },
];

function findNearestEntityByName(bot, name) {
  return bot.nearestEntity(
    (entity) => (entity.name || entity.username || entity.displayName) === name
  );
}

function findInventoryItem(bot, name) {
  const item = bot.inventory.items().find((i) => i.name === name);
  if (!item) throw new Error(`Don't have '${name}' in inventory.`);
  return item;
}

async function attackUntilDeadOrTimeout(bot, entity, timeoutMs = 30000) {
  const start = Date.now();
  while (entity.isValid && Date.now() - start < timeoutMs) {
    await bot.pathfinder.goto(new goals.GoalFollow(entity, 2));
    bot.attack(entity);
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}

/**
 * Execute one tool call against a live, already-spawned mineflayer bot
 * (with pathfinder + collectblock plugins loaded). Returns a short string
 * describing the outcome, or throws on failure -- the caller is expected to
 * catch and report failures back to the model as a tool error.
 */
async function executeTool(bot, name, args) {
  switch (name) {
    case "move_to": {
      await bot.pathfinder.goto(new goals.GoalNear(args.x, args.y, args.z, 1));
      return `Arrived near (${args.x}, ${args.y}, ${args.z}).`;
    }

    case "mine_block": {
      const count = args.count || 1;
      const blocksByName = bot.findBlocks({
        matching: (block) => block.name === args.block,
        maxDistance: 64,
        count,
      });
      if (blocksByName.length === 0) {
        throw new Error(`No '${args.block}' found within range.`);
      }
      const targets = blocksByName.map((pos) => bot.blockAt(pos)).filter(Boolean);
      await bot.collectBlock.collect(targets.slice(0, count));
      return `Mined ${Math.min(count, targets.length)}x ${args.block}.`;
    }

    case "craft_item": {
      const count = args.count || 1;
      const itemData = bot.registry.itemsByName[args.item];
      if (!itemData) throw new Error(`Unknown item '${args.item}'.`);

      let craftingTable = bot.findBlock({
        matching: (block) => block.name === "crafting_table",
        maxDistance: 16,
      });
      const recipes = bot.recipesFor(itemData.id, null, 1, craftingTable);
      if (recipes.length === 0) {
        throw new Error(`No known recipe for '${args.item}' with current inventory/table access.`);
      }
      await bot.craft(recipes[0], count, craftingTable || null);
      return `Crafted ${count}x ${args.item}.`;
    }

    case "smelt_item": {
      const count = args.count || 1;
      const furnaceBlock = bot.findBlock({
        matching: (block) => block.name === "furnace",
        maxDistance: 16,
      });
      if (!furnaceBlock) throw new Error("No furnace found within range.");

      const furnace = await bot.openFurnace(furnaceBlock);
      const inputItem = findInventoryItem(bot, args.item);
      const fuelItem = findInventoryItem(bot, args.fuel);

      await furnace.putFuel(fuelItem.type, null, Math.min(count, fuelItem.count));
      await furnace.putInput(inputItem.type, null, Math.min(count, inputItem.count));

      const pollIntervalMs = 1000;
      const deadline = Date.now() + count * 15000;
      let output = furnace.outputItem();
      while ((!output || output.count < count) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        output = furnace.outputItem();
      }
      const taken = await furnace.takeOutput();
      furnace.close();
      return taken
        ? `Smelted and collected ${taken.count}x ${taken.name}.`
        : `Waited on the furnace but no output was ready yet.`;
    }

    case "equip_item": {
      const item = findInventoryItem(bot, args.item);
      await bot.equip(item, args.destination || "hand");
      return `Equipped ${args.item} to ${args.destination || "hand"}.`;
    }

    case "place_block": {
      const item = findInventoryItem(bot, args.block);
      await bot.equip(item, "hand");
      const targetPos = new Vec3(args.x, args.y - 1, args.z);
      const referenceBlock = bot.blockAt(targetPos);
      if (!referenceBlock) throw new Error(`No reference block below (${args.x}, ${args.y}, ${args.z}).`);
      await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
      return `Placed ${args.block} at (${args.x}, ${args.y}, ${args.z}).`;
    }

    case "use_item_on_block": {
      const block = bot.blockAt(new Vec3(args.x, args.y, args.z));
      if (!block) throw new Error(`No block found at (${args.x}, ${args.y}, ${args.z}).`);
      await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
      await bot.activateBlock(block);
      return `Used held item on block at (${args.x}, ${args.y}, ${args.z}).`;
    }

    case "attack_entity": {
      const entity = findNearestEntityByName(bot, args.name);
      if (!entity) throw new Error(`No '${args.name}' entity found nearby.`);
      await attackUntilDeadOrTimeout(bot, entity);
      return entity.isValid
        ? `Engaged '${args.name}' but it's still alive or out of range.`
        : `Defeated '${args.name}'.`;
    }

    case "throw_item": {
      const item = findInventoryItem(bot, args.item);
      await bot.equip(item, "hand");
      bot.activateItem();
      return `Threw/used ${args.item}.`;
    }

    case "wait": {
      const seconds = args.seconds ?? 1;
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return `Waited ${seconds}s.`;
    }

    case "report_status": {
      return `(noted) ${args.message}`;
    }

    default:
      throw new Error(`Unknown tool '${name}'.`);
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool, findNearestEntityByName, findInventoryItem };
