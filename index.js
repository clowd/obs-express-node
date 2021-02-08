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
    const rl = require("readline").createInterface({
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

app.use(function (req, res, next) {
    res.setHeader('Content-Type', 'application/json');
    next();
});

function DO_OK(res) {
    res.status(200).send(JSON.stringify({ status: "ok" }));
}

function DO_JSON(res, body) {
    var obj = Object.assign({}, { status: "ok" }, body);
    res.status(200).send(JSON.stringify(obj));
}

// routes
app.get("/", (req, res) => {
    const routes = _(app._router.stack)
        .filter(s => !_.isEmpty(s.route))
        .map(s => ({ route: s.route.path, methods: s.route.methods }))
        .toArray();
    DO_JSON(res, routes);
});

app.get("/status", (req, res) => {
    DO_JSON(res, {
        initialized: obs.isInitialized(),
        recording: obs.isRecording(),
        statistics: obs.getStatistics(),
    });
});

app.get("/audio/speakers", (req, res) => {
    DO_JSON(res, obs.getSpeakers());
});

app.get("/audio/microphones", (req, res) => {
    DO_JSON(res, obs.getMicrophones());
});

app.get("/settings/:settingKey", (req, res) => {
    let small = true;
    if (_.isString(req.query.detailed) && req.query.detailed.toLowerCase() === "true") {
        small = false;
    }
    DO_JSON(res, obs.getSettingsCategory(req.params.settingKey, small));
});

app.post("/settings/:settingKey", (req, res) => {
    obs.updateSettingsCategory(req.params.settingKey, req.body);
    DO_OK(res);
});

app.post("/recording/start", (req, res, next) => {
    obs.recordingStart(req.body).then(s => DO_OK(res)).catch(next);
});

app.post("/recording/stop", (req, res, next) => {
    obs.recordingStop().then(s => DO_OK(res)).catch(next);
});

app.post("/shutdown", (req, res) => {
    shutdown(0);
})

app.use(function (err, req, res, next) {
    console.error(err.stack)
    if (!!err.message) {
        res.status(500).send(JSON.stringify({ status: "error", message: err.message /*, stack: err.stack*/ }));
    } else {
        res.status(500).send(JSON.stringify({ status: "error", message: err }));
    }
})

// startup
try {
    obs.init();
    server = app.listen(port, "localhost", () => {
        console.log(`Listening at http://localhost:${port}`);
    });
} catch (e) {
    console.log(e.message || e);
    shutdown(1);
}