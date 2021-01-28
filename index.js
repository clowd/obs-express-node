const app = require("express");
const path = require("path");
const osn = require("obs-studio-node");
const { v4: uuid } = require('uuid');
const osnset = require("./settings");

console.log("Starting OBS");

osn.NodeObs.IPC.host("obs-express-" + uuid());
osn.NodeObs.SetWorkingDirectory(path.join(__dirname, 'node_modules', 'obs-studio-node'));
const obsDataPath = path.join(__dirname, 'osn-data');
const initResult = osn.NodeObs.OBS_API_initAPI('en-US', obsDataPath, '1.0.0');

if (initResult !== 0) {
    // ERROR.. HANDLE IT
    process.exit(initResult);
}

osn.NodeObs.OBS_service_connectOutputSignals((signalInfo) => {
    console.log(signalInfo);
});

console.log("Configuring OBS");



osnset.setSetting("Output", "Untitled", "Mode", "Advanced");

console.log(JSON.stringify(osnset.getSettingsCategory("Video")));


// const settings = osn.NodeObs.OBS_settings_getSettings("Output");
// console.log(JSON.stringify(settings));

console.log("OBS Ready");

console.debug('Shutting down OBS...');

try {
    osn.NodeObs.OBS_service_removeCallback();
    osn.NodeObs.IPC.disconnect();
} catch (e) {
    throw Error('Exception when shutting down OBS process' + e);
}

console.debug('OBS shutdown successfully');