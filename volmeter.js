const _ = require("lodash");
const WebSocket = require("ws");
const osn = require("@streamlabs/obs-studio-node");
const queryString = require("query-string");

function createVolmeterServer(expressServer) {
    const wss = new WebSocket.Server({
        noServer: true,
        path: "/volmeter",
    });

    // handle connections from existing express server (instead of starting a new one)
    expressServer.on("upgrade", (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (websocket) => {
            wss.emit("connection", websocket, request);
        });
    });

    // ping clients every 4 seconds (and disconnect any that do not respond)
    const clients = [];
    const keepAliveInterval = setInterval(function ping() {
        clients.forEach(function each(ws, idx, arr) {
            if (ws.isAlive === false) {
                arr.splice(idx, 1); // delete current element
                destroyVolmeter(ws.volmeter);
                return ws.terminate();
            }
            // if this is still false the next time we iterate, 
            // the socket did not respond and we should close
            ws.isAlive = false;
            ws.ping();
        });
    }, 4000);

    // dispose ping callback when socket server closes
    wss.on('close', function close() {
        console.log("volmeter server closed");
        clearInterval(keepAliveInterval);
    });

    // handle incoming websocket connections
    wss.on("connection", function connection(ws, connectionRequest) {
        try {
            const [_path, params] = connectionRequest?.url?.split("?");
            const connectionParams = queryString.parse(params);

            // handle keepalive response and mark socket alive
            ws.isAlive = true;
            ws.volmeter = createVolmeter(ws, connectionParams.deviceType, connectionParams.deviceId, connectionParams.algorithm);
            ws.on('pong', function heartbeat() { this.isAlive = true; });
            clients.push(ws);
        } catch (e) {
            const msg = e.toString();
            destroyVolmeter(ws.volmeter);
            ws.send(JSON.stringify({ status: "error", message: msg }));
            ws.terminate();
        }
    });
}

function createMicrophoneInput(deviceid) {
    return osn.InputFactory.create('wasapi_input_capture', 'mic-audio', { device_id: deviceid });
}

function createSpeakerInput(deviceid) {
    return osn.InputFactory.create('wasapi_output_capture', 'desktop-audio', { device_id: deviceid });
}

function createVolmeter(ws, inputType, inputId, algorithm) {
    let input, volmeter, callbackInfo;
    try {
        if (!_.isString(inputType) || !_.isString(inputId)) {
            throw new Error("deviceType and deviceId are required query parameters");
        }

        let faderType = 2; // obs.EFaderType.Log
        if (algorithm === "iec") {
            faderType = 1;
        } else if (algorithm == "cubic") {
            faderType = 0;
        }

        if (inputType === "speaker") {
            input = createSpeakerInput(inputId);
        } else if (inputType === "microphone") {
            input = createMicrophoneInput(inputId);
        } else {
            throw new Error("Unknown deviceType: '" + inputType + "', supported is: 'speaker' or 'microphone'.");
        }

        volmeter = osn.VolmeterFactory.create(faderType);
        volmeter.attach(input);

        callbackInfo = volmeter.addCallback((magnitude, peak, inputPeak) => {
            ws.send(JSON.stringify({ peak: _.max(peak), magnitude: _.max(magnitude) }));
        });

        if (!callbackInfo) throw new Error("failed to create callback");
        console.log("created volmeter for " + inputType + ":" + inputId);

        return { input, volmeter, callbackInfo };
    } catch (er) {
        destroyVolmeter({ input, volmeter, callbackInfo });
        throw er;
    }
}

function destroyVolmeter(obj) {
    if (!obj) return;
    try {
        const { input, volmeter, callbackInfo } = obj;
        if (callbackInfo) {
            volmeter.removeCallback(callbackInfo);
        }
        if (volmeter) {
            volmeter.detach();
            volmeter.destroy();
        }
        if (input) {
            input.release();
        }
        console.log("disposed volmeter");
    } catch (er) {
        console.log(er.toString());
    }
}

exports.createVolmeterServer = createVolmeterServer;
exports.createMicrophoneInput = createMicrophoneInput;
exports.createSpeakerInput = createSpeakerInput;