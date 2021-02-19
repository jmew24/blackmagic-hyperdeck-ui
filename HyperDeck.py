import asyncio
import logging


class HyperDeck:
    logger = logging.getLogger(__name__)

    def __init__(self, host=None, port=None, loop=None):
        self.host = host or '192.168.21.64'
        self.port = port or 9993
        self.clips = []
        self.status = dict()

        self._loop = loop or asyncio.get_event_loop()
        self._transport = None
        self._callback = None
        self._response_future = None

    def getHost(self):
        return self.host

    def getPort(self):
        return self.port

    async def setNetwork(self, host=None, port=None):
        # Update the host and/or port and re-connect to the HyperDeck
        if host == None or port == None:
            return

        if self._transport:
            self._transport[1].close()
            await self._transport[1].wait_closed()

        self.host = host
        self.port = port

        await self.connect()

    async def set_callback(self, callback):
        # This callback is invoked each time the HyperDeck's state changes.
        self._callback = callback

    async def connect(self):
        self.logger.info('Connecting to {}:{}...'.format(self.host, self.port))

        try:
            self._transport = await asyncio.open_connection(host=self.host, port=self.port, loop=self._loop)
            self.logger.info('Connection established.')

            # Set up a worker task to receive and parse responses from the
            # Hyperdeck:
            self._loop.create_task(self._parse_responses())

            # Set up a worker task to periodically poll the HyperDeck state, so
            # we can keep track of what it is currently doing:
            self._loop.create_task(self._poll_state())
        except Exception as e:
            self.logger.error("Failed to connect: {}".format(e))
            return None

        # Refresh our internal caches of the current HyperDeck state.
        await self.enable_notifications()
        await self.update_clips()
        await self.update_status()

        return self._transport

    async def connected(self):
        command = 'ping'
        response = await self._send_command(command)
        return response and not response['error']

    async def record(self):
        command = 'record'
        response = await self._send_command(command)
        return response and not response['error']

    async def record_named(self, clip_name):
        command = 'record: name: {}'.format(clip_name)
        response = await self._send_command(command)
        return response and not response['error']

    async def play(self, single=True, loop=False, speed=1.0):
        # HyperDeck protocol accepts speed as a percentage between -16x and 16x
        speed = min(max(float(speed) * 100, -1600), 1600)

        command = 'play:\nsingle clip: {}\nloop: {}\nspeed: {}\n\n'.format(
            single, loop, int(speed)).lower()
        response = await self._send_command(command)
        return response and not response['error']

    async def stop(self):
        command = 'stop'
        response = await self._send_command(command)
        return response and not response['error']

    async def select_clip_by_index(self, clip_index):
        # Convert the clip index [0, N] to a clip ID, which is [1, N].
        clip_index = 1 + max(clip_index, 0)

        command = 'goto: clip id: {}'.format(clip_index)
        response = await self._send_command(command)
        return response and not response['error']

    async def select_clip_by_offset(self, clip_offset):
        command = 'goto: clip id: {0:+}'.format(clip_offset)
        response = await self._send_command(command)
        return response and not response['error']

    async def jog_to_timecode(self, timecode):
        command = 'jog: timecode: {}'.format(timecode)
        response = await self._send_command(command)
        return response and not response['error']

    async def update_clips(self):
        command = 'clips get'
        response = await self._send_command(command)

        # Clear the clip info cache unconditionally. If the command fails due to
        # missing media or otherwise, we still want to present an empty clip
        # list.
        self.clips = []

        if response and response['code'] == 205:
            # First line in a clip info response is the total number of clips,
            # which we can discard (we will determine it instead by the number
            # of actual clip info lines sent after it.
            clip_info = response['lines'][2:]

            for info in clip_info:
                fields = info.split(' ')

                # Each clip info line contains the clip index, followed by the
                # clip name, the starting timecode, and finally the duration.
                clip = {
                    'name': ' '.join(fields[1: len(fields) - 2]),
                    'timecode': fields[-2],
                    'duration': fields[-1],
                }

                self.clips.append(clip)

        if self._callback is not None:
            await self._callback('clips')

    async def update_status(self):
        command = 'transport info'
        response = await self._send_command(command)

        self.status = dict()

        if response and response['code'] == 208:
            transport_info = response['lines'][1:]

            # Each line past the first response line contains an individual
            # property of the HyperDeck, such as the play state.
            for line in transport_info:
                (name, value) = line.split(': ', 1)
                self.status[name] = value

        if self._callback is not None:
            await self._callback('status')

    async def enable_notifications(self, slot=True, remote=True, config=True):
        command = 'notify:\nslot: {}\nremote: {}\nconfiguration: {}\n\n'.format(
            slot, remote, config).lower()
        response = await self._send_command(command)
        return not response['error']

    async def _send_command(self, command):
        if not self._transport:
            return None

        # We need to wait here if another command is currently in progress,
        # as the HyperDeck processes all commands and gives all response in
        # sequence.
        if self._response_future:
            await self._response_future

        # Set up a future to receive the response from the HyperDeck, and send
        # the command.
        self._response_future = asyncio.Future(loop=self._loop)
        await self._send(command)
        response = await self._response_future

        if self._callback is not None:
            transcript = {
                'sent': command.split('\n'),
                'received': response['lines']
            }
            await self._callback('transcript', transcript)

        return response

    async def _poll_state(self):
        while True:
            # We have to periodically poll the HyperDeck's state, rather than
            # bombarding it with continuous updates.
            await asyncio.sleep(1)

            await self.update_status()

    async def _parse_responses(self):
        while True:
            try:
                response_lines = await self._receive()

                # Ignore an empty responses, just discard and continue waiting
                # for new data.
                if len(response_lines) == 0:
                    continue
            except Exception as e:
                self.logger.error("Connection failed: {}".format(e))
                return

            try:
                # Response code is the first number in the first response line
                # from the HyperDeck. Abort if we receive a malformed response.
                response_code = int(response_lines[0].split(' ', 1)[0])
            except Exception as e:
                self.logger.error("Malformed response: {}".format(e))
                return

            # Special ranges of response codes indicates errors, or asynchronous
            # responses that arrive at any time (without an explicit command
            # being sent first).
            is_error_response = response_code >= 100 and response_code < 200
            is_async_response = response_code >= 500 and response_code < 600

            # The 502 response code indicates a slot information change; a disk/card
            # has been inserted or removed.
            if response_code == 502:
                # Short delay to give the HyperDeck enough time to update its
                # internal clip state.
                asyncio.sleep(300)

                # 502 Slot Info responses require us to refresh our local clip
                # cache, since the available disk(s) have changed. Run this
                # on the event loop outside this function, so we don't deadlock.
                self._loop.create_task(self.update_clips())

            # Only signal the completion of a command that is in progress, if
            # this is not an asynchronous response.
            if not is_async_response and self._response_future is not None:
                response = {
                    'error': is_error_response,
                    'code': response_code,
                    'lines': response_lines,
                }

                self._response_future.set_result(response)
                self._response_future = None

    async def _send(self, data):
        self.logger.debug('Sent: {}'.format([data]))

        data += '\r\n'
        return self._transport[1].write(data.encode('utf-8'))

    async def _receive(self):
        if not self._transport:
            return

        async def _read_line():
            line = await self._transport[0].readline()
            return bytes(line).decode('utf-8').rstrip()

        lines = []

        # Get first response line from the HyperDeck, this will contain the
        # status code followed by the textual description of the response.
        lines.append(await _read_line())

        # Multi-line responses end with a colon on the first line; we need to
        # keep reading from the device in this cause until we hit an empty line.
        if str.endswith(lines[0], ':'):
            while True:
                line = await _read_line()
                if not len(line):
                    break

                lines.append(line)

        self.logger.debug('Received: {}'.format(lines))
        return lines
