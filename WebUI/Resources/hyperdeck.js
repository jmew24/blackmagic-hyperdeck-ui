"use strict";

// HyperDeck control elements on the HTML page
let error = document.getElementById("error");
let error_message = document.getElementById("error_message");
let error_exit = document.getElementById("error_exit");
let loop = document.getElementById("loop");
let single = document.getElementById("single");
let speed = document.getElementById("speed");
let speed_val = document.getElementById("speed_val");
let live_div = document.getElementById("live");
let jog_status = document.getElementById("jog_status");
let jog = document.getElementById("jog");
let jog_val = document.getElementById("jog_val");
let state = document.getElementById("state");
let state_refresh = document.getElementById("state_refresh");
let clips = document.getElementById("clips");
let clips_refresh = document.getElementById("clips_refresh");
let record = document.getElementById("record");
let play = document.getElementById("play");
let stop = document.getElementById("stop");
let prev = document.getElementById("prev");
let next = document.getElementById("next");
let sent = document.getElementById("sent");
let received = document.getElementById("received");
let slot_select = document.getElementById("slot_select");
let clips_name = document.getElementById("clips_name");
//let connect = document.getElementById('connect');
let btnLogout = document.getElementById("btnLogout");
let ip_addr = document.getElementById("ip_addr");
let port = document.getElementById("port");

// Websocket used to communicate with the Python server backend
let ws = new WebSocket("ws://" + location.host + "/ws");

// Global to keep track of whether we are filtering out state updates in the
// transcript area so that we only display the command/response when
// user-initiated
let allow_state_transcript = true;

let initialLoad = true;
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
let is_playing = false;
let is_updating = false;
let auto_refresh = false;

const disableElement = (elem, disable = true) => {
  var nodes = elem.getElementsByTagName("*");
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].disabled = disable;
  }
};

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

const resetJog = () => {
  clipTC = {
    starting: new Timecode(0, fps, dropFrame),
    duration: new Timecode(0, fps, dropFrame),
    ending: new Timecode(0, fps, dropFrame),
    current: new Timecode(0, fps, dropFrame),
  };
  lastFrame = -1;
  jog.step = fps;
  jog.max = 0;
  jog.value = 0.0;
  return updateTimecode(Math.round(jog.value), true);
};

// Bind HTML elements to HyperDeck commands
speed.oninput = () => {
  speed_val.innerHTML = parseFloat(speed.value).toFixed(2);
};

jog.oninput = () => {
  // Visually update the jog placement and text
  updateTimecode(Math.round(jog.value)).catch(() => {});
};

jog.onchange = () => {
  if (is_updating) return;

  const curValue = Math.round(jog.value);

  if (clips.selectedIndex == null || clips.selectedIndex < 0) {
    jog_val.innerHTML = "";
    disableElement(jog_status, true);
    return;
  } else {
    disableElement(jog_status, false);
  }

  // Update display
  try {
    const curValueToTC = Timecode(curValue, fps, dropFrame);
    updateTimecode(curValueToTC.frameCount, true)
      .then((newTimecode) => {
        const newValue = Timecode(newTimecode.toString(), fps, dropFrame);
        const jogTC = Timecode(clipTC.starting, fps, dropFrame).add(
          newValue.frameCount
        );
        // Update clip jog position
        const command = {
          command: "clip_jog",
          params: {
            timecode: jogTC.toString(),
          },
        };
        ws.send(JSON.stringify(command));
      })
      .catch((err) => {
        console.error(err);
      });
  } catch {}
};

record.onclick = () => {
  const command = {
    command: "record_named",
    params: {
      clip_name: clips_name.value,
    },
  };

  ws.send(JSON.stringify(command));
  is_playing = false;
  auto_refresh = true;
  disableElement(live_div, true);
};

play.onclick = () => {
  const command = {
    command: "play",
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
    command: "stop",
  };
  ws.send(JSON.stringify(command));
  is_playing = false;
  disableElement(live_div, false);
};

prev.onclick = () => {
  clips.selectedIndex--;
  clips.onchange();
};

next.onclick = () => {
  clips.selectedIndex++;
  clips.onchange();
};

state_refresh.onclick = () => {
  const command = {
    command: "state_refresh",
  };
  ws.send(JSON.stringify(command));

  // Keep track of whether the user has initiated a state update, so we know
  // if we should show it in the transcript or not.
  allow_state_transcript = true;
};

clips.onchange = () => {
  if (clips.selectedIndex < 0) {
    clips.selectedIndex = 0;
  }

  try {
    const duration = clips_data[clips.selectedIndex].duration;
    const starting = clips_data[clips.selectedIndex].timecode;
    const durationTC = Timecode(duration, fps, dropFrame);
    const startingTC = Timecode(starting, fps, dropFrame);
    const endingTC = Timecode(startingTC, fps, dropFrame).add(duration);

    // First stop the current clip if one is playing
    if (is_playing && clips.selectedIndex >= 0) stop.onclick();
    lastFrame = -1;

    const command = {
      command: "clip_select",
      params: {
        id: clips.selectedIndex,
      },
    };
    ws.send(JSON.stringify(command));

    // Lastly update the duration and jog settings
    setDropFrame(duration);
    clipTC = {
      starting: startingTC,
      ending: endingTC,
      duration: durationTC,
      current: Timecode(0, fps, dropFrame),
    };
    jog.max = parseFloat(durationTC.frameCount).toFixed(0);
    jog.value = 0.0;
    jog.oninput();
  } catch {
    // Ignore the jog updating as something went wrong
    if (is_playing && clips.selectedIndex >= 0) stop.onclick();
    lastFrame = -1;

    const command = {
      command: "clip_select",
      params: {
        id: clips.selectedIndex,
      },
    };
    ws.send(JSON.stringify(command));
  }
};

clips_refresh.onclick = () => {
  const command = {
    command: "clip_refresh",
  };
  ws.send(JSON.stringify(command));
};

/*
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
  */

btnLogout.onclick = () => {
  let formData = new FormData();

  fetch("/logout", {
    body: formData,
    method: "post",
  }).finally(() => {
    window.location.replace("/");
  });
};

error_exit.onclick = () => {
  error_message.innerHTML = "";
  error.style.display = "none";
};

slot_select.onchange = () => {
  const newSlot = Number(slot_select.options[slot_select.selectedIndex].value);
  const command = {
    command: "slot_select",
    params: {
      slot: newSlot,
    },
  };
  ws.send(JSON.stringify(command));

  setTimeout(() => {
    clips_refresh.onclick();
  }, 500);
};

ws.onopen = () => {
  const command = {
    command: "hyperdeck",
  };
  ws.send(JSON.stringify(command));
};

// Websocket message parsing
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);

  switch (data.response) {
    case "clip_count":
      const lastIndex = clips.selectedIndex;
      clips.innerHTML = "";

      for (let i = 0; i < data.params["count"]; i++)
        clips.add(new Option("[--:--:--:--] - Clip " + i));

      // If our last index is still valid, reassign it
      if (clips.length > lastIndex) clips.selectedIndex = lastIndex;

      break;

    case "clip_info":
      clips.options[data.params["id"] - 1].text =
        "[" + data.params["duration"] + "] " + data.params["name"];
      clips_data[data.params["id"] - 1] = data.params;

      break;

    case "network":
      ip_addr.value = data.params["host"];
      port.value = data.params["port"];
      break;

    case "status":
      const status = data.params["status"];
      if (status !== undefined) {
        const paramsTC = data.params["timecode"];

        setDropFrame(paramsTC);
        if (status === "record") {
          const paramsDisplayTC = data.params["display timecode"];
          record.disabled = true;
          play.disabled = true;
          stop.disabled = false;
          prev.disabled = true;
          next.disabled = true;

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

        if (status.indexOf("stopped") >= 0 && is_playing) {
          is_playing = false;
          record.disabled = false;
          play.disabled = false;
          stop.disabled = true;
          prev.disabled = true;
          next.disabled = true;

          try {
            const startingTimecode = Timecode(
              clipTC.starting.toString(),
              fps,
              dropFrame
            );
            const newTimecode = Timecode(paramsTC, fps, dropFrame);
            updateTimecode(
              newTimecode.subtract(startingTimecode).frameCount
            ).catch(() => {});
          } catch {}
        } else if (status.indexOf("play") >= 0 || status.indexOf("jog") >= 0) {
          is_playing = true;
          disableElement(jog_status, false);
          record.disabled = true;
          play.disabled = true;
          stop.disabled = false;
          prev.disabled = false;
          next.disabled = false;

          try {
            const startingTimecode = Timecode(
              clipTC.starting.toString(),
              fps,
              dropFrame
            );
            const newTimecode = Timecode(paramsTC, fps, dropFrame);
            updateTimecode(
              newTimecode.subtract(startingTimecode).frameCount
            ).catch(() => {});
          } catch {}
        }
      } else state.innerHTML = "Unknown";

      switch (status) {
        case undefined:
          jog_status.classList.add("inactive");

          break;
        case "record":
          jog_status.classList.add("inactive");

          break;

        case "stopped":
          jog_status.classList.remove("inactive");

          break;

        case "preview":
          // If auto refresh is on, set it false refresh the clips and set the index to our newest clip
          if (auto_refresh) {
            auto_refresh = false;
            clips_refresh.onclick();
            setTimeout(() => {
              clips.selectedIndex = clips.length - 1;
            }, 500);
          }

          break;

        case "play":
        case "jog":
          jog_status.classList.remove("inactive");

          break;

        default:
          jog_status.classList.add("inactive");

          break;
      }

      break;

    case "transcript":
      // We periodically send transport info requests automatically
      // to the HyperDeck, so don't bother showing them to the user
      // unless this was a manual refresh request.
      const is_state_request = data.params["sent"][0] == "transport info";

      if (allow_state_transcript || !is_state_request) {
        const paramsSent = data.params["sent"];
        const paramsReceived = data.params["received"];
        const sentMessage = paramsSent.join("\n").trim();

        // Ignore ping checks
        console.log({ paramsSent });
        console.log({ sentMessage });
        if (sentMessage.indexOf("ping") >= 0) {
          console.log("ping found");
          return;
        }

        sent.innerHTML = sentMessage;
        received.innerHTML = paramsReceived.join("\n").trim();

        if (paramsReceived[7] !== undefined) {
          let timecodeData = paramsReceived[7];
          if (timecodeData.indexOf("timecode:") >= 0) {
            setDropFrame(timecodeData.replace("timecode:", ""));
          }
        }

        if (paramsReceived[8] !== undefined) {
          let videoFormatData = paramsReceived[8];
          if (videoFormatData.indexOf("video format:") >= 0) {
            videoFormat = videoFormatData.replace("video format:", "").trim();
            if (videoFormat.indexOf("2997") >= 0) fps = 29.97;
            else if (videoFormat.indexOf("30") >= 0) fps = 30;
            else if (videoFormat.indexOf("5994") >= 0) fps = 59.94;
            else if (videoFormat.indexOf("60") >= 0) fps = 60.0;
          }
        }

        allow_state_transcript = false;
      }

      break;

    case "hyperdeck_load":
      ip_addr.value = data.params["host"];
      port.value = data.params["port"];

      ws.send(
        JSON.stringify({
          command: "refresh",
        })
      );

      ws.send(
        JSON.stringify({
          command: "slot__info",
        })
      );

      break;

    case "request_error":
      const msg = data.params["message"];
      error_message.innerHTML = msg;
      error.style.display = "block";
      console.error(`${msg}`, data.params);

      break;
  }
};

window.onkeydown = (ev) => {
  if (ev.key === "Shift" && jog.step == fps) {
    jog.step = 1.0;
  }
};

window.onkeyup = (ev) => {
  if (ev.key === "Shift" && jog.step == 1.0) {
    jog.step = fps;
  }
};

// Initial control setup once the page is loaded
window.onload = () => {
  if (error_message.innerHTML.length == 0) error.style.display = "none";

  speed.value = 1.0;
  speed.oninput();
  resetJog();
};

window.onerror = function (error) {
  error_message.innerHTML = error;
  error.style.display = "block";
  console.error("Error:", error);
};
