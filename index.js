const express = require("express");
const osn = require("obs-studio-node");
const osnset = require("./settings");
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

    rl.on("SIGINT", function() {
        process.emit("SIGINT");
    });
}

process.on("SIGINT", function() {
    console.log("Recieved SIGINT");
    shutdown(0);
});

process.on("SIGTERM", function() {
    console.log("Recieved SIGTERM");
    shutdown(0);
});

function shutdown(code) {
    console.log("Start graceful shutdown: code " + code);
    try {
        obs.release();
        server.close();
    } catch {}
    console.log("Exiting...");
    process.exit(code);
}

// routes
app.get("/", (req, res) => {
    res.send('Hello World!');
});

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