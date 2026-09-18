# CAINE

**C**reative **A**rtificial **I**ntelligence **N**etworking **E**ntity.

CAINE is a small, honestly-untrained neural network. There is no pretrained
checkpoint anywhere in this repository -- a fresh CAINE starts as random
Gaussian noise and produces gibberish. The only way it gets better at
anything is by talking to it: every message you send is used as an online
training example (truncated backprop through time) the moment CAINE replies
to it.

It is deliberately separate from other projects in this account (e.g.
[tide-survival](https://github.com/watsona4/tide-survival)) -- CAINE isn't
part of any particular game or app, it's a standalone entity you can point
things at.

## What's actually here

- `caine/model.py` -- a single-layer character-level RNN implemented from
  scratch with `numpy` (no ML framework, no pretrained weights). Forward
  pass, sampling, and an Adagrad-based online training step.
- `caine/server.py` -- the "networking" half: a small asyncio TCP server
  that speaks a line-based protocol. Each line in, CAINE replies, then
  learns from the exchange before the next line arrives.
- `caine/cli.py` -- a chat client, usable either against a running server
  or as a standalone in-process instance for local testing.

State (the model's learned weights) is persisted to disk between runs
(default `~/.caine/state.npz`) so CAINE actually accumulates whatever
you've taught it rather than forgetting on restart. Delete that file (or
pass `--state` pointing elsewhere) to start over from scratch.

## Quickstart

```bash
pip install -r requirements.txt

# run CAINE as a server
python -m caine.server --host 127.0.0.1 --port 8765

# in another terminal, talk to it
python -m caine.cli --connect 127.0.0.1:8765

# or skip the network entirely and chat with an in-process instance
python -m caine.cli
```

Expect nonsense at first -- that's the point. It's untrained.

## Development

```bash
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

## License

MIT, see [LICENSE](LICENSE).
