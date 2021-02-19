## Setup:

1. Connect a Blackmagic Design HyperDeck to your computer, via an Ethernet cable.
2. Run `python3 Main.py` (`py Main.py` on Windows) from your command line/terminal application.
   (Optional Arguments: You can manually set the web ip, port, hyperdeck ip and hypderdeck port by using the corresponding arguments on launch. To view all arguments and defaults, type `--help` at the end of the Run command in Part 2)
3. Open `127.0.0.1:8080` in your chosen web browser to show the Web UI. (Or specified custom ip and port)

# Example:

Running `python3 Main.py -a localhost -p 8080 -hdip 192.168.21.64 -hdport 9993` will start the Blackmagic HyperDeck UI webserver on localhost:8080 and will connect to a HyperDeck at 192.168.21.64:9993

## Developer Info

Find HyperDeck protocol commands and other developer information on page 60 of the HyperDeckManual.

## Dependencies:

### Python

Python 3.6 or newer is required. On Debian systems, this can usually be installed via:

```
sudo apt install python3 python3-pip
```

### Python Libraries

This library uses the [aiohttp](https://github.com/aio-libs/aiohttp) to provide the Websocket and asynchronous HTTP library that communicates with the browser front-end.

This can be installed typically via `pip`, using:

```
pip3 install aiohttp
```

### Web Browser

All modern web browsers (e.g. Chrome 65+, Firefox 59+) are supported. This demo application requires browser support for Websockets, as well as modern CSS3.
