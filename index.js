const _ = require("lodash");
const express = require("express");
const bodyParser = require('body-parser');
const obs = require("./obs");

// create express
const app = express();
const port = 21889;
let server;

// handle sigint/shutdown
if (process.platform === "win32") {
    var rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on("SIGINT", function () {
        process.emit("SIGINT");
    });
}

process.on("SIGINT", function () {
    console.log("Recieved SIGINT");
    shutdown(0);
});

process.on("SIGTERM", function () {
    console.log("Recieved SIGTERM");
    shutdown(0);
});

function shutdown(code) {
    console.log("Start graceful shutdown: code " + code);
    try {
        obs.release();
        server.close();
    } catch { }
    console.log("Exiting...");
    process.exit(code);
}

app.use(bodyParser.json({ extended: true }));

// routes
app.get("/", (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    var routes = _(app._router.stack)
        .filter(s => !_.isEmpty(s.route))
        .map(s => ({ route: s.route.path, methods: s.route.methods }))
        .toArray();
    res.send(JSON.stringify(routes));
});

app.get("/status", (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({
        initialized: obs.isInitialized(),
        recording: obs.isRecording(),
        statistics: obs.getStatistics(),
    }));
});

app.get("/settings/:settingKey", (req, res) => {
    let small = true;
    if (_.isString(req.query.detailed) && req.query.detailed.toLowerCase() === "true") {
        small = false;
    }

    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(obs.getSettingsCategory(req.params.settingKey, small)));
});

app.post("/settings/:settingKey", (req, res) => {
    obs.updateSettingsCategory(req.params.settingKey, req.body);
    res.status(200).send('OK');
});

app.post("/recording/start", (req, res) => {
    obs.recordingStart(req.body);
    res.status(200).send('OK');
});

app.post("/recording/stop", (req, res) => {
    obs.recordingStop();
    res.status(200).send('OK');
});

app.post("/shutdown", (req, res) => {
    shutdown(0);
})

// startup
try {
    obs.init();
    server = app.listen(port, () => {
        console.log(`Listening at http://localhost:${port}`);
    });
} catch (e) {
    console.log(e.message || e);
    shutdown(1);
}