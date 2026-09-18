"""Talk to CAINE -- either an in-process instance or one already running
as a server (see caine.server)."""

import argparse
import socket

from caine.server import DEFAULT_STATE_PATH, CAINE


def chat_local(state_path):
    caine = CAINE(state_path=state_path)
    print("CAINE (local, untrained unless you've talked to it before). Ctrl-C to quit.")
    try:
        while True:
            message = input("you> ")
            if not message.strip():
                continue
            print("caine>", caine.respond(message))
    except (KeyboardInterrupt, EOFError):
        print()
    finally:
        caine.save()
        print(f"state saved to {caine.state_path}")


def chat_remote(host, port):
    with socket.create_connection((host, port)) as sock:
        f = sock.makefile("rw")
        print(f.readline().rstrip())
        try:
            while True:
                message = input("you> ")
                if not message.strip():
                    continue
                f.write(message + "\n")
                f.flush()
                print("caine>", f.readline().rstrip())
        except (KeyboardInterrupt, EOFError):
            print()


def main():
    parser = argparse.ArgumentParser(description="Chat with CAINE.")
    parser.add_argument(
        "--connect",
        metavar="HOST:PORT",
        help="talk to a running CAINE server instead of an in-process instance",
    )
    parser.add_argument(
        "--state", default=str(DEFAULT_STATE_PATH), help="state file for a local instance"
    )
    args = parser.parse_args()

    if args.connect:
        host, port = args.connect.split(":")
        chat_remote(host, int(port))
    else:
        chat_local(args.state)


if __name__ == "__main__":
    main()
