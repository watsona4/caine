"""CAINE's networking layer: a small line-based TCP chat server.

Every message you send becomes training data. CAINE replies with
whatever its current (possibly still mostly-random) weights produce,
then learns from the exchange before the next line arrives.
"""

import argparse
import asyncio
import logging
from pathlib import Path

from caine.model import CharRNN

logger = logging.getLogger("caine.server")

DEFAULT_STATE_PATH = Path.home() / ".caine" / "state.npz"


class CAINE:
    """Wraps a CharRNN with the conversational + persistence behavior
    shared by the TCP server and the local CLI."""

    def __init__(self, state_path=DEFAULT_STATE_PATH, **model_kwargs):
        self.state_path = Path(state_path)
        if self.state_path.exists():
            self.model = CharRNN.load(self.state_path)
            logger.info("loaded existing state from %s", self.state_path)
        else:
            self.model = CharRNN(**model_kwargs)
            logger.info("starting untrained -- no prior state at %s", self.state_path)

    def respond(self, message, reply_length=120, temperature=0.8):
        reply = self.model.generate(prompt=message, length=reply_length, temperature=temperature)
        self.model.train_on_text(message + "\n" + reply + "\n")
        return reply

    def save(self):
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.model.save(self.state_path)


async def handle_client(reader, writer, caine):
    addr = writer.get_extra_info("peername")
    logger.info("connection from %s", addr)
    writer.write(b"CAINE (untrained) is listening. Say something.\n")
    await writer.drain()

    try:
        while True:
            line = await reader.readline()
            if not line:
                break
            message = line.decode("utf-8", errors="replace").rstrip("\n")
            if not message:
                continue
            reply = caine.respond(message)
            writer.write((reply + "\n").encode("utf-8"))
            await writer.drain()
    except (ConnectionResetError, asyncio.IncompleteReadError):
        pass
    finally:
        caine.save()
        writer.close()
        logger.info("connection from %s closed", addr)


async def serve(host="127.0.0.1", port=8765, state_path=DEFAULT_STATE_PATH):
    caine = CAINE(state_path=state_path)
    server = await asyncio.start_server(lambda r, w: handle_client(r, w, caine), host, port)
    logger.info("CAINE listening on %s:%s", host, port)
    async with server:
        await server.serve_forever()


def main():
    parser = argparse.ArgumentParser(description="Run CAINE as a TCP chat server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--state", default=str(DEFAULT_STATE_PATH))
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    asyncio.run(serve(args.host, args.port, args.state))


if __name__ == "__main__":
    main()
