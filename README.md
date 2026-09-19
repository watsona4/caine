# CAINE

**C**reative **A**rtificial **I**ntelligence **N**etworking **E**ntity.

Two separate things live under the CAINE name in this repo, using
completely different architectures on purpose -- see below for why.

## [chatbot/](chatbot) -- an honestly-untrained text model

A from-scratch character-level RNN with randomly initialized weights and
no pretrained checkpoint. It only learns from what you type to it, via
online backprop through time triggered on every chat exchange, served
over a small TCP socket. Pure text prediction, nothing else.

## [minecraft-agent/](minecraft-agent) -- an LLM-driven game agent

CAINE playing Minecraft Java Edition, aiming to beat the game as fast as
it can. This is **not** the chatbot's neural net wired into a game --
that genuinely cannot work: the RNN has no way to represent 3D game state
as input, no way to map its character-stream output to game actions, and
its training signal (next-character prediction loss) has nothing to do
with game progress. Driving a game requires reasoning over structured
state and choosing from a defined action space, which is what an LLM tool
loop does well and a from-scratch char-RNN fundamentally cannot. So this
component uses Claude (via the Anthropic API) as the decision-maker,
issuing actions through [Mineflayer](https://github.com/PrismarineJS/mineflayer).

## Why keep both here

They share the CAINE name and the "creative AI entity" framing, but are
independent projects with separate dependencies, languages (Python vs.
Node.js), and READMEs. Each subdirectory documents itself; start there.

Also worth noting: CAINE is intentionally decoupled from other projects in
this account, e.g. [tide-survival](https://github.com/watsona4/tide-survival)
-- it isn't part of any particular game or app, it's a standalone entity.

## License

MIT, see [LICENSE](LICENSE) (applies to the whole repo).
