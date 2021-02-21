## Setup:

1. Connect a Blackmagic Design HyperDeck to your computer, via an Ethernet cable.
2. Run `python3 Main.py` (`py Main.py` on Windows) from your command line/terminal application.
   > (Optional Arguments: You can manually set the web ip, port, hyperdeck ip and hypderdeck port by using the corresponding arguments on launch. To view all arguments and defaults, type `--help` at the end of the Run command in Part 2)
3. Open `127.0.0.1:8080` in your chosen web browser to show the Web UI. (Or specified custom ip and port)

## Optional Arguments

| Short-Name | Full-Name       | type     | Default         |                                                                                               Description                                                                                               |
| :--------- | :-------------- | :------- | :-------------- | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| `-a`       | `--address`     | `string` | `localhost`     |                                                                                     The host to use for the web UI                                                                                      |
| `-p`       | `--port`        | `int`    | `8080`          |                                                                                     The port to use for the web UI                                                                                      |
| `-hdip`    | `--hyperdeckIP` | `string` | `192.168.21.64` |                                                                                     The HyperDeck IP to connect to                                                                                      |
| `-hdport`  | `--hdport`      | `int`    | `9993`          |                                                                                    The HyperDeck Port to connect to                                                                                     |
| `-log`     | `--logLevel`    | `int`    | `20`            | The Loggers base level anything above it will also be shown.<br />**Levels:**<br />_(None)_ `0`<br />_(Debug)_ `10`<br />_(Info)_ `20`<br />_(Warning)_ `30`<br />_(Error)_ `40`<br />_(Critical)_ `50` |

## Example:

Running:

```python
python3 Main.py -a localhost -p 8080 -hdip 192.168.21.64 -hdport 9993 -log 20
```

will start the Blackmagic HyperDeck UI webserver on localhost:8080 and will connect to a HyperDeck at 192.168.21.64:9993

---

### Web Browser

All modern web browsers (e.g. Chrome 65+, Firefox 59+) are supported. This demo application requires browser support for Websockets, as well as modern CSS3.

---

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
