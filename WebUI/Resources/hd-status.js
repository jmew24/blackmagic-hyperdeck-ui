"use strict";

// HyperDeck control elements on the HTML page
let state = document.getElementById("state");

// Global to keep track of whether we are filtering out state updates in the
// transcript area so that we only display the command/response when
// user-initiated
let allow_state_transcript = true;

// Delay reconnect on multiple attempts
let reconnectTimeout = 1000;

let fps = 59.94;
let dropFrame = true;

const setDropFrame = (timecodeData = "00:00:00;00") => {
  // Set NDF or DF
  const parts = timecodeData
    .trim()
    .match("^([012]\\d):(\\d\\d):(\\d\\d)(:|;|\\.)(\\d\\d)$");
  if (parts) {
    dropFrame = parts[4] !== ":";
  } else {
    if (timecodeData.trim().indexOf(";") >= 0) dropFrame = true;
    else dropFrame = false;
  }
};

const wsConnection = () => {
  // Websocket used to communicate with the Python server backend
  let ws = new WebSocket("ws://" + location.host + "/ws");

  ws.onopen = () => {
    const command = {
      command: "hd-status",
    };
    ws.send(JSON.stringify(command));
    // Reset timeout on successful connection
    reconnectTimeout = 1000;
  };

  ws.onclose = (e) => {
    console.error(
      `Socket closed. Reconnect will be attempted in ${
        reconnectTimeout / 1000
      } second(s).`,
      e.reason
    );
    setTimeout(function () {
      reconnectTimeout = reconnectTimeout * 2;
      wsConnection();
    }, reconnectTimeout);
  };

  ws.onerror = function (err) {
    console.error("Socket encountered error: ", err.message, "Closing socket");
    ws.close();
  };

  // Websocket message parsing
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);

    switch (data.response) {
      case "status":
        const status = data.params["status"];
        if (status !== undefined) {
          const paramsTC = data.params["timecode"];

          setDropFrame(paramsTC);
          if (status === "record") {
            const paramsDisplayTC = data.params["display timecode"];

            try {
              const displayTimecode = Timecode(paramsDisplayTC, fps, dropFrame);
              const newTimecode = Timecode(paramsTC, fps, dropFrame);
              state.innerHTML =
                status +
                " [" +
                displayTimecode.subtract(newTimecode).toString() +
                "]";
            } catch {
              state.innerHTML = status + " [" + paramsDisplayTC + "]";
            }
          } else {
            state.innerHTML = status + " [" + paramsTC + "]";
          }
        } else state.innerHTML = "Unknown";

        break;

      case "transcript":
        // We periodically send transport info requests automatically
        // to the HyperDeck, so don't bother showing them to the user
        // unless this was a manual refresh request.
        const is_state_request = data.params["sent"][0] == "transport info";

        if (allow_state_transcript || !is_state_request) {
          allow_state_transcript = false;
        }

        break;

      case "request_error":
        // Close connection on error
        ws.close();

        break;

      default:
        break;
    }
  };
};

window.onload = () => {
  wsConnection();
};
