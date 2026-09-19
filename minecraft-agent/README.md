# CAINE Minecraft agent

CAINE playing Minecraft Java Edition, survival mode, with the stated goal
of beating the game (killing the Ender Dragon) as fast as it reasonably
can. This is an **LLM-driven agent**, not a trained neural network: a
language model (Claude, via the Anthropic API) reasons over the bot's
current state each turn and picks one action from a fixed tool set, which
[Mineflayer](https://github.com/PrismarineJS/mineflayer) then executes
against the game.

This is deliberately *not* the same kind of "AI" as [../chatbot](../chatbot)
-- see the [repo root README](../README.md) for why a from-scratch
character-RNN cannot drive a game like this, and why this component uses a
completely different architecture.

## Why this design

- **Fixed tool set, no LLM-generated code.** The model can only call one of
  the actions defined in `src/tools.js` (`move_to`, `mine_block`,
  `craft_item`, `attack_entity`, etc.). It cannot generate and execute
  arbitrary JavaScript. This bounds what a bad decision from the model can
  actually do.
- **State summarized as text, not raw game data.** Each turn the bot's
  position, health, food, inventory, and nearby entities are formatted
  into a short text block (`src/state.js`) and given to the model as
  context, the same way you'd describe the situation to a person.
- **No learning, no training loop.** This is a reasoning agent, not a
  trainable model -- there's nothing here that improves with more runs
  beyond whatever conversation history is in context for the current run.

## Known limitations (read this before assuming it works end-to-end)

This was built and unit-tested without access to a live Minecraft server
or a real Anthropic API call -- there is no Minecraft client available in
the environment this was developed in. `src/state.js` and the pure parts of
`src/tools.js`/`src/agent.js` have unit tests (`npm test`), but the actual
Mineflayer integration (pathfinding, mining, crafting, furnace smelting,
combat, the Nether/End stages) has **not been run against a real game**.
Expect to find and fix real bugs the first several times you run it,
especially in:

- `craft_item` / `smelt_item` -- recipe lookup and furnace timing are the
  most likely to need adjustment for your Minecraft version.
- `attack_entity` -- combat against a moving target (and especially the
  Ender Dragon's flight pattern) is the least tested part of the tool set.
- Nether and End navigation -- there's no purpose-built eye-of-ender
  triangulation or fortress-finding logic; the model has to improvise
  using the generic tools (`move_to`, `throw_item`, `mine_block`), which
  will likely need dedicated tools added once you see how it actually
  behaves.

Treat this as a working skeleton to iterate on with real runs, not a
finished speedrunner.

## Setup

1. In Minecraft Java Edition, create/open a survival world and use
   **Open to LAN** (Esc menu -> Open to LAN). Note the port it prints in
   chat (usually starts at 25565 and increments if taken).
2. `npm install`
3. `cp .env.example .env` and fill in `ANTHROPIC_API_KEY` (and `MC_PORT`
   if it wasn't the default).
4. `npm start`

CAINE will join as a second player and start acting. Watch the console for
its reasoning (`report_status` calls) and each tool call/result.

## Development

```bash
npm install
npm test
```
