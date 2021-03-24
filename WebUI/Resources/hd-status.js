"use strict";

// HyperDeck control elements on the HTML page
let state = document.getElementById("state");

// Websocket used to communicate with the Python server backend
let ws = new WebSocket("ws://" + location.host + "/ws");

// Global to keep track of whether we are filtering out state updates in the
// transcript area so that we only display the command/response when
// user-initiated
let allow_state_transcript = true;

let videoFormat = "1080i5994";
let fps = 59.94;
let dropFrame = true;
let lastFrame = -1;
let clipTC = {
  starting: new Timecode(0, fps, dropFrame),
  duration: new Timecode(0, fps, dropFrame),
  ending: new Timecode(0, fps, dropFrame),
  current: new Timecode(0, fps, dropFrame),
};
let clips_data = [];

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

const updateTimecode = (frames = 0, overrideLastFrame = false) =>
  new Promise((resolve, reject) => {
    try {
      // If we are updating, our frames are a negative number or there isn't a change since last frame, reject and ignore the update
      if (
        is_updating ||
        frames < 0 ||
        (frames == lastFrame && !overrideLastFrame)
      )
        return reject({
          error: false,
          data: { is_updating, frames, lastFrame },
        });
      else is_updating = true;

      const newValue = Timecode(Math.round(frames), fps, dropFrame);
      clipTC.current = newValue;
      jog.value = parseFloat(clipTC.current.valueOf()).toFixed(0);
      jog_val.innerHTML = `${clipTC.current.toString()} / ${clipTC.duration.toString()}`;
      lastFrame = frames;

      is_updating = false;
      return resolve(newValue);
    } catch (err) {
      return reject({ error: true, data: err });
    }
  });

const refreshState = () => {
  const command = {
    command: "state_refresh",
  };
  ws.send(JSON.stringify(command));

  // Keep track of whether the user has initiated a state update, so we know
  // if we should show it in the transcript or not.
  allow_state_transcript = true;
};

ws.onopen = () => {
  const command = {
    command: "hd-status",
  };
  ws.send(JSON.stringify(command));
};

ws.onclose = (e) => {
  window.location.reload();
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
      window.location.reload();

      break;
  }
};

window.onerror = function (error) {
  location.reload();
};
