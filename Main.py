#!/usr/bin/env python3

import asyncio
import logging
import argparse

import WebUI
import HyperDeck


async def main(loop, args):
    hyperdeck = HyperDeck.HyperDeck(args.hyperdeckIP, args.hyperdeckPort)
    await hyperdeck.connect()

    webui = WebUI.WebUI(args.address, args.port)
    await webui.start(hyperdeck)

if __name__ == "__main__":
    logging.basicConfig(
        format='%(name)s %(levelname)s: %(message)s', level=logging.INFO)

    # Configure log level for the various modules.
    loggers = {
        'WebUI': logging.INFO,
        'HyperDeck': logging.INFO,
        'aiohttp': logging.ERROR,
    }
    for name, level in loggers.items():
        logger = logging.getLogger(name)
        logger.setLevel(level)

    # Parse command line arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('-a', '--address', type=str, nargs='?', default='localhost',
                        help='The host to use for the web UI, default: localhost')
    parser.add_argument('-p', '--port', type=int, nargs='?', default=8080,
                        help="The port to use for the web UI, default: 8080")
    parser.add_argument('-hdip', '--hyperdeckIP', type=str, nargs='?', default='192.168.21.64',
                        help='The HyperDeck IP to connect to, default: 192.168.21.64')
    parser.add_argument('-hdport', '--hyperdeckPort', type=int, nargs='?',
                        default=9993, help='The HyperDeck Port to connect to, default: 9993')
    args = parser.parse_args()

    # Run the application with the user arguments
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main(loop, args))
    loop.run_forever()
