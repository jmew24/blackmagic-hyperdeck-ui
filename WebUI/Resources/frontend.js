'use strict';

// Websocket used to communicate with the Python server backend
let ws = new WebSocket('ws://' + location.host + '/ws');

// Global to keep track of whether we are filtering out state updates in the
// transcript area so that we only display the command/response when
// user-initiated
let allow_state_transcript = true;

// HyperDeck control elements on the HTML page
let loop = document.getElementById('loop');
let single = document.getElementById('single');
let speed = document.getElementById('speed');
let speed_val = document.getElementById('speed_val');
let jog = document.getElementById('jog');
let jog_val = document.getElementById('jog_val');
let state = document.getElementById('state');
let state_refresh = document.getElementById('state_refresh');
let clips = document.getElementById('clips');
let clips_refresh = document.getElementById('clips_refresh');
let record = document.getElementById('record');
let play = document.getElementById('play');
let stop = document.getElementById('stop');
let prev = document.getElementById('prev');
let next = document.getElementById('next');
let sent = document.getElementById('sent');
let received = document.getElementById('received');
let clips_name = document.getElementById('clips_name');
let connect = document.getElementById('connect');
let ip_addr = document.getElementById('ip_addr');
let port = document.getElementById('port');

let initialLoad = true;
let videoFormat = '1080i5994';
let fps = 59.94;
let dropFrame = true;
let tc = new Timecode(0, fps, dropFrame);
let totalTC = new Timecode(0, fps, dropFrame);
let clips_duration = [];
let is_playing = false;

setDropFrame = (timecodeData = '00:00:00;00') => {
	// Set NDF or DF
	const parts = timecodeData.trim().match('^([012]\\d):(\\d\\d):(\\d\\d)(:|;|\\.)(\\d\\d)$');
	if (parts) {
		dropFrame = parts[4] !== ':';
	} else {
		if (timecodeData.trim().indexOf(';') >= 0) dropFrame = true;
		else dropFrame = false;
	}
};

// Bind HTML elements to HyperDeck commands
speed.oninput = () => {
	speed_val.innerHTML = parseFloat(speed.value).toFixed(2);
};

jog.oninput = () => {
	if (clips.selectedIndex == null || clips.selectedIndex < 0) {
		jog_val.innerHTML = '';
		return;
	}

	// Update display and clip jog
	tc = Timecode(Number(jog.value), fps, dropFrame);
	jog_val.innerHTML = `${tc.toString()} / ${totalTC.toString()}`;
};

jog.onchange = () => {
	if (clips.selectedIndex == null || clips.selectedIndex < 0) {
		jog_val.innerHTML = '';
		jog.disabled = true;
		return;
	} else {
		jog.disabled = false;
	}

	// Update display and clip jog
	jog.oninput();

	const command = {
		command: 'clip_jog',
		params: {
			timecode: tc.toString(),
		},
	};

	ws.send(JSON.stringify(command));
};

record.onclick = () => {
	const command = {
		command: 'record_named',
		params: {
			clip_name: clips_name.value,
		},
	};

	ws.send(JSON.stringify(command));
};

play.onclick = () => {
	const command = {
		command: 'play',
		params: {
			loop: loop.checked,
			single: single.checked,
			speed: speed.value,
		},
	};
	ws.send(JSON.stringify(command));
	is_playing = true;
};

stop.onclick = () => {
	const command = {
		command: 'stop',
	};
	ws.send(JSON.stringify(command));
	is_playing = false;
};

prev.onclick = () => {
	const command = {
		command: 'clip_previous',
	};
	ws.send(JSON.stringify(command));
};

next.onclick = () => {
	const command = {
		command: 'clip_next',
	};
	ws.send(JSON.stringify(command));
};

state_refresh.onclick = () => {
	const command = {
		command: 'state_refresh',
	};
	ws.send(JSON.stringify(command));

	// Keep track of whether the user has initiated a state update, so we know
	// if we should show it in the transcript or not.
	allow_state_transcript = true;
};

clips.onchange = () => {
	// First stop the current clip if one is playing
	if (is_playing && clips.selectedIndex >= 0) stop.onclick();

	const command = {
		command: 'clip_select',
		params: {
			id: clips.selectedIndex,
		},
	};
	ws.send(JSON.stringify(command));

	// Lastly update the duration and jog settings
	const duration = clips_duration[clips.selectedIndex];
	setDropFrame(duration);

	totalTC = Timecode(duration, fps, dropFrame);
	jog.max = parseFloat(totalTC.frameCount);
	jog.value = 0.0;
};

clips_refresh.onclick = () => {
	const command = {
		command: 'clip_refresh',
	};
	ws.send(JSON.stringify(command));
};

connect.onclick = () => {
	const command = {
		command: 'updateNetwork',
		params: {
			host: ip_addr.value,
			port: Number(port.value),
		},
	};
	ws.send(JSON.stringify(command));
};

ws.onopen = () => {
	const command = {
		command: 'refresh',
	};
	ws.send(JSON.stringify(command));

	const networkCommand = {
		command: 'getNetwork',
	};
	ws.send(JSON.stringify(networkCommand));
};

// Websocket message parsing
ws.onmessage = (message) => {
	const data = JSON.parse(message.data);

	switch (data.response) {
		case 'clip_count':
			clips.innerHTML = '';

			for (let i = 0; i < data.params['count']; i++) clips.add(new Option('[--:--:--:--] - Clip ' + i));

			if (clips.length > 0) {
				play.classList.remove('inactive');
				stop.classList.remove('inactive');
				prev.classList.remove('inactive');
				next.classList.remove('inactive');
			} else {
				play.classList.add('inactive');
				stop.classList.add('inactive');
				prev.classList.add('inactive');
				next.classList.add('inactive');
			}
			break;

		case 'clip_info':
			clips.options[data.params['id'] - 1].text = '[' + data.params['duration'] + '] ' + data.params['name'];
			clips_duration[data.params['id'] - 1] = data.params['duration'];

			break;

		case 'network':
			ip_addr.value = data.params['host'];
			port.value = data.params['port'];
			break;

		case 'status':
			const status = data.params['status'];
			if (status !== undefined) {
				const newTC = data.params['timecode'];

				setDropFrame(newTC);
				state.innerHTML = status + ' [' + newTC + ']';

				if (status.indexOf('stopped') >= 0) is_playing = false;
				else if (status.indexOf('play') >= 0 || status.indexOf('jog') >= 0) {
					is_playing = true;
					jog.value = Timecode(newTC, fps, dropFrame);
					jog.onchange();
				}
			} else state.innerHTML = 'Unknown';

			switch (status) {
				case undefined:
					play.classList.remove('inactive');
					stop.classList.remove('inactive');
					prev.classList.remove('inactive');
					next.classList.remove('inactive');

					break;

				case 'stopped':
					play.classList.remove('inactive');
					stop.classList.add('inactive');
					prev.classList.remove('inactive');
					next.classList.remove('inactive');

					break;

				default:
					play.classList.add('inactive');
					stop.classList.remove('inactive');
					prev.classList.remove('inactive');
					next.classList.remove('inactive');

					break;
			}

			break;

		case 'transcript':
			// We periodically send transport info requests automatically
			// to the HyperDeck, so don't bother showing them to the user
			// unless this was a manual refresh request.
			const is_state_request = data.params['sent'][0] == 'transport info';

			if (allow_state_transcript || !is_state_request) {
				sent.innerHTML = data.params['sent'].join('\n').trim();
				received.innerHTML = data.params['received'].join('\n').trim();

				if (data.params['received'][7] !== undefined) {
					let timecodeData = data.params['received'][7];
					if (timecodeData.indexOf('timecode:') >= 0) {
						setDropFrame(timecodeData.replace('timecode:', ''));
					}
				}

				if (data.params['received'][8] !== undefined) {
					let videoFormatData = data.params['received'][8];
					if (videoFormatData.indexOf('video format:') >= 0) {
						videoFormat = videoFormatData.replace('video format:', '').trim();
						if (videoFormat.indexOf('2997') >= 0) fps = 29.97;
						else if (videoFormat.indexOf('30') >= 0) fps = 30;
						else if (videoFormat.indexOf('5994') >= 0) fps = 59.94;
						else if (videoFormat.indexOf('60') >= 0) fps = 60.0;
					}
				}

				allow_state_transcript = false;
			}

			break;
	}
};

window.onkeydown = (ev) => {
	if (ev.key === 'Shift' && jog.step == fps) {
		jog.step = 1.0;
	}
};

window.onkeyup = (ev) => {
	if (ev.key === 'Shift' && jog.step == 1.0) {
		jog.step = fps;
	}
};

// Initial control setup once the page is loaded
window.onload = () => {
	speed.value = 1.0;
	speed.oninput();
	jog.step = fps;
	jog.value = 0.0;
	jog.onchange();
};
