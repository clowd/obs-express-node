const path = require("path");
const osn = require("obs-studio-node");
const { v4: uuid } = require('uuid');
const osnset = require("./settings");

let initialized = false;
let recording = false;

function isRecording() {
    return recording;
}

function isInitialized() {
    return initialized;
}

function init() {
    console.log("Starting OBS...");

    osn.NodeObs.IPC.host("obs-express-" + uuid());
    osn.NodeObs.SetWorkingDirectory(path.join(__dirname, 'node_modules', 'obs-studio-node'));
    const obsDataPath = path.join(__dirname, 'osn-data');
    const initResult = osn.NodeObs.OBS_API_initAPI('en-US', obsDataPath, '1.0.0');

    if (initResult !== 0) {
        throw new Error("OBS Exited with error code: " + initResult);
    }

    initialized = true;

    console.log("Starting OBS... Complete");

    osn.NodeObs.OBS_service_connectOutputSignals((signalInfo) => {
        console.log(signalInfo);
    });

    console.log("Configuring OBS Default Settings...");

    // console.log(JSON.stringify(osnset.getSettingsCategory("Video", false)));

    // set to advanced ahead of time - this changes the settings that are available
    osnset.setSetting("Output", "Untitled", "Mode", "Advanced");
    osnset.setSetting("Output", "Recording", "RecFormat", "mkv");
    osnset.setSetting("Output", "Streaming", "Bitrate", 10000);

    osnset.setSetting("Video", "Untitled", "Base", "3440x1440");
    osnset.setSetting("Video", "Untitled", "Output", "3440x1440");
    osnset.setSetting("Video", "Untitled", "FPSCommon", "60");

    // osnset.setSetting("Advanced", "Video", "ColorFormat", "I444");
    // osnset.setSetting("Advanced", "Video", "ColorSpace", "709");
    // osnset.setSetting("Advanced", "Video", "ColorRange", "Full");

    // osnset.setSetting("Output", "Recording", "RecEncoder", "ffmpeg_nvenc");
    //ffmpeg_nvenc
    // const availableEncoders = getAvailableValues('Output', 'Recording', 'RecEncoder');
    // setSetting('Output', 'RecEncoder', availableEncoders.slice(-1)[0] || 'x264');
    // setSetting('Output', 'RecFilePath', path.join(__dirname, 'videos'));
    // setSetting('Output', 'RecFormat', 'mkv');
    // setSetting('Output', 'VBitrate', 10000); // 10 Mbps
    // setSetting('Video', 'FPSCommon', 60);

    console.log("Configuring OBS Default Settings... Complete");
    console.log("OBS Ready");
}

function release() {

    if (recording) {
        stop_recording();
    }

    console.log('Shutting down OBS...');

    try {
        osn.NodeObs.OBS_service_removeCallback();
        osn.NodeObs.IPC.disconnect();
    } catch (e) {
        throw Error('Exception when shutting down OBS process' + e);
    }

    console.log('OBS shutdown complete');
}

function start_recording() {
    console.log('OBS Start recording...');
    const scene = osn.SceneFactory.create('clscene');
    const videoSource = osn.InputFactory.create("monitor_capture", "d1");
    scene.add(videoSource);
    osn.Global.setOutputSource(1, scene);

    osn.NodeObs.OBS_service_startRecording();

    // TODO ADD SIGNAL
    recording = true;
    console.log('OBS Start recording... Complete');
}

function stop_recording() {
    console.log('OBS Stop recording...');
    osn.NodeObs.OBS_service_stopRecording();

    // TODO ADD SIGNAL
    recording = false;

    console.log('OBS Stop recording... Complete');
}

exports.isRecording = isRecording;
exports.isInitialized = isInitialized;
exports.init = init;
exports.release = release;
exports.start_recording = start_recording;
exports.stop_recording = stop_recording;