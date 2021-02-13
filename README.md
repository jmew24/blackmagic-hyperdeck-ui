# Python HyperDeck WebUI

This is a Python 3 example application to control a [Blackmagic Design HyperDeck](https://www.blackmagicdesign.com/products/hyperdeckstudiomini) high definition video deck player remotely, using a WebUI front-end. This allows the deck to be remotely controlled from a modern web browser, demonstrating the HyperDeck TCP control protocol documented in the product manual.

This is a code sample intended for demonstration purposes only, and should not be used directly in a live production environment.

## Setup:

1) Connect a Blackmagic Design HyperDeck to your computer, via an Ethernet cable.
2) Run `python3 Main.py {hyperdeck ip address}` from your command line/terminal application.
3) Open `127.0.0.1:8080` in your chosen web browser to show the Web UI.

## Dependencies:

### Python

Python 3.6 or newer is required. On Debian systems, this can usually be installed via:
```
sudo apt install python3 python3-pip
```

### Python Libraries

This library uses the [aiohttp](https://github.com/aio-libs/aiohttp) to provide the Websocket and asychronous HTTP library that communicates with the browser front-end.

This can be installed typically via `pip`, using:
```
pip3 install aiohttp
```

### Web Browser

All modern web browsers (e.g. Chrome 65+, Firefox 59+) are supported. This demo application requires browser support for Websockets, as well as modern CSS3.
