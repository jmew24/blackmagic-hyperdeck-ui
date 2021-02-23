'use strict';
'use strict';

const getWithExpiry = (key) => {
	return new Promise((resolve, reject) => {
		const itemStr = localStorage.getItem(key);
		// if the item doesn't exist, return null
		if (!itemStr) {
			return resolve(null);
		}
		const item = JSON.parse(itemStr);
		const now = new Date();
		// compare the expiry time of the item with the current time
		if (now.getTime() > item.expiry) {
			localStorage.removeItem(key);
			return resolve(null);
		}
		return resolve(item.value);
	});
};

getWithExpiry('loginStatus').then((value) => {
	// First check if we are logged in
	if (value) {
		window.location.replace('/');
		return;
	}

	// HyperDeck control elements on the HTML page
	let login = document.getElementById('login');
	let user_name = document.getElementById('user_name');
	let password = document.getElementById('password');
	let btnLogin = document.getElementById('btnLogin');

	// Websocket used to communicate with the Python server backend
	let ws = new WebSocket('ws://' + location.host + '/ws');
	// Our login status
	let logged_in = false;

	const setWithExpiry = (key, value, ttl) => {
		localStorage.setItem(
			key,
			JSON.stringify({
				value: value,
				expiry: new Date().getTime() + ttl,
			}),
		);
	};

	const disableElement = (elem, disable = true) => {
		var nodes = elem.getElementsByTagName('*');
		for (var i = 0; i < nodes.length; i++) {
			nodes[i].disabled = disable;
		}
	};

	btnLogin.onclick = () => {
		if (logged_in) return;

		const command = {
			command: 'login',
			params: {
				user_name: user_name.value.trim(),
				password: password.value.trim(),
			},
		};
		ws.send(JSON.stringify(command));
	};

	ws.onopen = () => {
		disableElement(login, false);
	};

	// Websocket message parsing
	ws.onmessage = (message) => {
		const data = JSON.parse(message.data);

		switch (data.response) {
			case 'login_status':
				if (data.params['user_name'] == user_name.value.trim()) {
					if (data.params['status'] == true) {
						logged_in = true;
						disableElement(login, true);
						setWithExpiry('loginStatus', true, 3.6e6);
						if (window.location.pathname === '/') window.location.reload();
						else window.location.replace('/');
					} else {
						user_name.value = '';
						password.value = '';
					}
				}

				break;
		}
	};

	window.onkeydown = (ev) => {
		if (ev.key === 'Enter') {
			btnLogin.onclick();
		}
	};

	// Disable div until we are connected to the ws
	disableElement(login, true);
});
