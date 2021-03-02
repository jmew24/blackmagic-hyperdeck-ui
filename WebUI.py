import asyncio
import logging
import json
import base64

try:
    import aiohttp
    from aiohttp import web
except ImportError:
    print("The aiohttp library was not found. Please install it via `pip3 install aiohttp` and try again.")
    import sys
    sys.exit(1)

try:
    from aiohttp_session import setup as setup_session
    from aiohttp_session.cookie_storage import EncryptedCookieStorage
except ImportError:
    print(
        "The aiohttp_session or cryptography library was not found. Please install them via `pip3 install aiohttp_security[session]` and `pip3 install cryptography` and try again.")
    import sys
    sys.exit(1)

try:
    from aiohttp_security import setup as setup_security
    from aiohttp_security import SessionIdentityPolicy
    from aiohttp_security import (
        is_anonymous, remember, forget, authorized_userid, permits,
        check_permission, check_authorized,
    )
except ImportError:
    print("The aiohttp_security library was not found. Please install it via `pip3 install aiohttp_security` and try again.")
    import sys
    sys.exit(1)

from login.authz import DictionaryAuthorizationPolicy, check_credentials
from login.users import user_map
from middlewares import setup_middlewares


class WebUI:
    logger = logging.getLogger(__name__)

    def __init__(self, address=None, port=None, key=None, session=None, loop=None):
        self.address = address or 'localhost'
        self.port = port or 8080
        if (key == None or len(key) < 32):
            self.session_key = '=-0JdLGhHOrA1iKD5dvyw9hhmgH5aXKJIRlqy0PMAIv4='
        else:
            self.session_key = key
        self.session_cookie = session or 'HYPER_UI_SESSION'

        self._loop = loop or asyncio.get_event_loop()
        self._hyperdeck = None
        self._app = None

    async def start(self, hyperdeck):
        self._hyperdeck = hyperdeck

        # Add routes for the static front-end HTML file, the websocket, and the resources directory.
        app = web.Application()
        app.sockets = []
        app.user_map = user_map

        app.router.add_get('/', self._http_request_get_index, name='index')
        app.router.add_get(
            '/login', self._http_request_get_login, name='login')
        app.router.add_get(
            '/hyperdeck', self._http_request_get_hyperdeck, name='hyperdeck')
        app.router.add_post('/login', self._http_post_login, name='post_login')
        app.router.add_post(
            '/logout', self._http_post_logout, name='post_logout')
        app.router.add_get('/ws', self._http_request_get_websocket, name="ws")
        app.router.add_static('/resources/', path=str('./WebUI/Resources/'))

        # secret_key must be 32 url-safe base64-encoded bytes
        fernet_key = "-0JdLGhHOrA1iKD5dvyw9hhmgH5aXKJIRlqy0PMAIv4="
        secret_key = base64.urlsafe_b64decode(fernet_key)

        storage = EncryptedCookieStorage(
            secret_key, cookie_name=self.session_cookie)
        setup_session(app, storage)

        policy = SessionIdentityPolicy()
        setup_security(app, policy, DictionaryAuthorizationPolicy(user_map))

        setup_middlewares(app)

        self._app = app

        self.logger.info(
            "Starting web server on {}:{}".format(self.address, self.port))
        return await self._loop.create_server(app.make_handler(), self.address, self.port)

    async def _http_request_get_index(self, request):
        response = web.HTTPFound('/login')
        try:
            logged_in = not await is_anonymous(request)
            username = await authorized_userid(request)
            user_protected = await permits(request, "protected")
            if logged_in and username:
                if user_protected:
                    return web.HTTPFound('/hyperdeck')
                else:
                    await forget(request, response)
                    return web.FileResponse(path=str('WebUI/login.html'), status=401, reason='401: Unauthorized')
            else:
                return response
        except Exception as e:
            self.logger.debug(
                '_http_request_get_index exception: {}'.format(e))
            return response

    async def _http_post_login(self, request):
        response = web.HTTPFound('/')
        form = await request.post()
        username = form.get('user_name')
        password = form.get('password')

        verified = await check_credentials(
            request.app.user_map, username, password)
        if verified:
            await remember(request, response, username)
            return response

        return web.FileResponse(path=str('WebUI/login.html'), status=401, reason='Invalid username / password combination')

    async def _http_post_logout(self, request):
        await check_authorized(request)
        response = web.HTTPFound('/')
        await forget(request, response)
        return response

    async def _http_request_get_login(self, request):
        return web.FileResponse(path=str('WebUI/login.html'))

    async def _http_request_get_hyperdeck(self, request):
        await check_permission(request, 'protected')
        return web.FileResponse(path=str('WebUI/hyperdeck.html'))

    async def _http_request_get_websocket(self, request):
        resp = web.WebSocketResponse()
        await resp.prepare(request)

        # Don't process requests from anonymous connections
        if await is_anonymous(request):
            self.logger.debug("anonymous ws request: {}".format(request))
            return resp

        try:
            if not resp in self._app.sockets:
                self._app.sockets.append(resp)
                self._hyperdeck.connectedSockets(len(self._app.sockets))

            if self._hyperdeck.hasCallback() == False:
                await self._hyperdeck.set_callback(self._hyperdeck_event)
                self.logger.debug("Set HyperDeck callback.")

            self.logger.debug(
                "({}) Websocket Connection Opened.".format(len(self._app.sockets)))

            message = {
                'response': 'connected',
                'params': {
                    'connections': len(self._app.sockets),
                }
            }
            await self._send_websocket_message(message, resp)

            async for msg in resp:
                if msg.type == web.WSMsgType.TEXT:
                    request = json.JSONDecoder().decode(msg.data)
                    self.logger.debug(
                        "Request: {}".format(request))

                    try:
                        request['_ws'] = resp
                        await self._websocket_request_handler(request)
                    except Exception as e:
                        message = {
                            'response': 'request_error',
                            'params': {
                                'command': request.get('command', ""),
                                'params':request.get('params', dict()),
                                'message': "{}".format(e),
                            }
                        } 
                        await self._send_websocket_message(message, resp)
                        self.logger.error(
                            "_http_request_get_websocket _websocket_request_handler failed: {}".format(e))
                elif msg.type == web.WSMsgType.ERROR:
                    self.logger.debug(
                        "Websocket exception: {}".format(resp.exception()))

                else:
                    return resp
            return resp

        finally:
            if resp in self._app.sockets:
                self._app.sockets.remove(resp)
                self._hyperdeck.connectedSockets(len(self._app.sockets))
            self.logger.debug("({}) Websocket Connection Closed.".format(
                len(self._app.sockets)))

    async def _websocket_request_handler(self, request):
        ws = request.get('_ws', None)
        command = request.get('command')
        params = request.get('params', dict())

        # Process the various commands the front-end can send via the websocket.
        if command == "refresh":
            await self._hyperdeck_event('clips')
            await self._hyperdeck_event('status')
        elif command == 'hyperdeck':
            message = {
                'response': 'hyperdeck_load',
                'params': {
                    'host': self._hyperdeck.getHost(),
                    'port': self._hyperdeck.getPort(),
                }
            }
            await self._send_websocket_message(message, ws)
        elif command == "getNetwork":
            message = {
                'response': 'network',
                'params': {
                    'host': self._hyperdeck.getHost(),
                    'port': self._hyperdeck.getPort(),
                }
            }
            await self._send_websocket_message(message, ws)
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
        elif command == "slot_info":
            await self._hyperdeck.slot_info()
        elif command == "slot_select":
            slot = params.get('slot', 1)
            await self._hyperdeck.slot_select(slot)

    async def _send_websocket_message(self, message, socket=None):
        if socket is None:
            # Make sure the app is set
            if self._app is None:
                self.logger.debug(
                    "_send_websocket_message error: no app found!")
                return None

        # Encode the message as a JSON message
        message_json = json.JSONEncoder().encode(message)
        self.logger.debug("Response: {}".format(message_json))
        # First define our response variable
        response = None

        try:
            if socket is None:
                # Loop through all sockets and if they exist and are connected, send them the message
                for ws in self._app.sockets:
                    if ws is None or ws.closed:
                        return None
                    else:
                        response = await ws.send_str(message_json)
            else:
                response = await socket.send_str(message_json)
        except Exception as e:
            self.logger.error(
                "_send_websocket_message failed: {}".format(e))
        finally:
            if response is not None:
                return response
            else:
                return ""

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
