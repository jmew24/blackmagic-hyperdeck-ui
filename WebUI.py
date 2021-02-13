import asyncio
import logging
import json

try:
    import aiohttp
    from aiohttp import web
except ImportError:
    print("The aiohttp library was not found. Please install it via `pip3 install aiohttp` and try again.")
    import sys
    sys.exit(1)


class WebUI:
    logger = logging.getLogger(__name__)

    def __init__(self, port=None, loop=None):
        self.port = port or 8080

        self._loop = loop or asyncio.get_event_loop()
        self._hyperdeck = None
        self._websocket = None

    async def start(self, hyperdeck):
        self._hyperdeck = hyperdeck

        # Add routes for the static front-end HTML file, the websocket, and the resources directory.
        app = web.Application()
        app.router.add_get('/', self._http_request_get_frontend_html)
        app.router.add_get('/ws', self._http_request_get_websocket)
        app.router.add_static('/resources/', path=str('./WebUI/Resources/'))

        self.logger.info(
            "Starting web server on localhost:{}".format(self.port))
        return await self._loop.create_server(app.make_handler(), "localhost", self.port)

    async def _http_request_get_frontend_html(self, request):
        return web.FileResponse(path=str('WebUI/WebUI.html'))

    async def _http_request_get_websocket(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        self._websocket = ws
        await self._hyperdeck.set_callback(self._hyperdeck_event)

        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                request = json.JSONDecoder().decode(msg.data)
                self.logger.debug("Front-end request: {}".format(request))

                try:
                    await self._websocket_request_handler(request)
                except Exception as e:
                    logging.error(e)
            elif msg.type == aiohttp.WSMsgType.ERROR:
                logging.error(
                    'Websocket connection closed with exception {}'.format(ws.exception()))

        return ws

    async def _websocket_request_handler(self, request):
        command = request.get('command')
        params = request.get('params', dict())

        # Process the various commands the front-end can send via the websocket.
        if command == "refresh":
            await self._hyperdeck_event('clips')
            await self._hyperdeck_event('status')
        elif command == "getNetwork":
            message = {
                'response': 'network',
                'params': {
                    'host': self._hyperdeck.getHost(),
                    'port': self._hyperdeck.getPort(),
                }
            }
            await self._send_websocket_message(message)
        if command == "updateNetwork":
            oldHost = self._hyperdeck.getHost()
            oldPort = self._hyperdeck.getPort()
            newHost = params.get('host', oldHost)
            newPort = params.get('port', oldPort)
            if (newHost != oldHost or newPort != oldPort):
                await self._hyperdeck.setNetwork(host=newHost, port=newPort)
        elif command == "record":
            await self._hyperdeck.record()
        elif command == "record_named":
            clip_name = params.get('clip_name', '')
            await self._hyperdeck.record_named(clip_name)
        elif command == "play":
            single = params.get('single', False)
            loop = params.get('loop', False)
            speed = params.get('speed', 1.0)

            await self._hyperdeck.play(single=single, loop=loop, speed=speed)
        elif command == "stop":
            await self._hyperdeck.stop()
        elif command == "state_refresh":
            await self._hyperdeck.update_status()
        elif command == "clip_select":
            clip_index = params.get('id', 0)

            await self._hyperdeck.select_clip_by_index(clip_index)
        elif command == "clip_refresh":
            await self._hyperdeck.update_clips()
        elif command == "clip_previous":
            await self._hyperdeck.select_clip_by_offset(-1)
        elif command == "clip_next":
            await self._hyperdeck.select_clip_by_offset(1)
        elif command == "clip_jog":
            timecode = params.get('timecode', '00:00:00;00')
            await self._hyperdeck.jog_to_timecode(timecode)

    async def _send_websocket_message(self, message):
        if self._websocket is None or self._websocket.closed:
            return None

        message_json = json.JSONEncoder().encode(message)

        self.logger.debug("Front-end response: {}".format(message_json))
        response = await self._websocket.send_str(message_json)
        return response

    async def _hyperdeck_event(self, event, params=None):
        # HyperDeck state change event handlers, one per supported event type.
        event_handlers = {
            'clips': self._hyperdeck_event_clips_changed,
            'status': self._hyperdeck_event_status_changed,
            'transcript': self._hyperdeck_event_transcript,
        }

        handler = event_handlers.get(event)
        if handler is not None:
            await handler(params)

    async def _hyperdeck_event_clips_changed(self, params):
        # First send a new clip count update. this clears the clip list in the
        # front-end and prepares it to receive new clip entries/
        message = {
            'response': 'clip_count',
            'params': {
                'count': len(self._hyperdeck.clips)
            }
        }
        await self._send_websocket_message(message)

        # Next, send through clip info updates to the front-end, one per clip.
        for index, clip in enumerate(self._hyperdeck.clips):
            message = {
                'response': 'clip_info',
                'params': {
                    'id': index + 1,
                    'name': clip['name'],
                    'timecode': clip['timecode'],
                    'duration': clip['duration'],
                }
            }
            await self._send_websocket_message(message)

    async def _hyperdeck_event_status_changed(self, params):
        # Send the new HyperDeck status to the front-end for display.
        message = {
            'response': 'status',
            'params': self._hyperdeck.status
        }
        await self._send_websocket_message(message)

    async def _hyperdeck_event_transcript(self, params):
        # Send through the communication log to the front-end, so that it can
        # display the transcript to the user.
        message = {
            'response': 'transcript',
            'params': params
        }
        await self._send_websocket_message(message)
