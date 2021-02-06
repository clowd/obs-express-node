const _ = require("lodash");
const path = require("path");
const osn = require("obs-studio-node");
const { v4: uuid } = require('uuid');
const osnset = require("./settings");
const fs = require("fs");
const screen = require('electron-screen');

let initialized = false;
let recording = false;
let resources = [];

let pathRoot, pathData, pathObs, pathObsExe;

const productionMode = !!global.ISPKG;
if (productionMode) {
    console.log("Running in production mode");
    pathRoot = path.dirname(process.execPath);
    pathData = path.join(pathRoot, "obs-data");
    pathObs = path.join(pathRoot, "lib");
    pathObsExe = path.join(pathObs, "obs64.exe");
} else {
    console.log("Running in DEVELOPMENT mode");
    pathRoot = __dirname;
    pathData = path.join(pathRoot, "obs-data");
    pathObs = path.join(pathRoot, "node_modules", "obs-studio-node");
    pathObsExe = path.join(pathObs, "obs64.exe");
}

if (!fs.existsSync(pathObsExe)) {
    console.log("obs-studio-node could not be found. Ensure it exists in ./lib for production or node_modules for dev.");
}

console.log("Root directory is: " + pathRoot);
console.log("OBS is located at: " + pathObsExe);

function isRecording() {
    return recording;
}

function isInitialized() {
    return initialized;
}

function init() {
    console.log("Starting OBS...");

    osn.NodeObs.IPC.setServerPath(pathObsExe, pathObs);
    osn.NodeObs.IPC.host("obs-express-" + uuid());
    osn.NodeObs.SetWorkingDirectory(pathObs);

    osn.NodeObs.OBS_service_connectOutputSignals((signalInfo) => {
        console.log(signalInfo);
    });

    const initResult = osn.NodeObs.OBS_API_initAPI('en-US', pathData, '1.0.0');

    if (initResult !== 0) {
        throw new Error("OBS Exited with error code: " + initResult);
    }

    initialized = true;

    console.log("Starting OBS... Complete");

    // console.log("Configuring OBS Default Settings...");

    // console.log(JSON.stringify(osnset.getSettingsCategory("Video", false)));

    // set to advanced ahead of time - this changes the settings that are available
    // osnset.setSetting("Output", "Untitled", "Mode", "Advanced");
    // osnset.setSetting("Output", "Recording", "RecFormat", "mkv");
    // osnset.setSetting("Output", "Streaming", "Bitrate", 10000);
    // osnset.setSetting("Video", "Untitled", "FPSCommon", "60");

    // osnset.setSetting("Video", "Untitled", "Base", "3440x1440");
    // osnset.setSetting("Video", "Untitled", "Output", "3440x1440");

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

    // console.log("Configuring OBS Default Settings... Complete");
    console.log("OBS Ready");
}

function release() {

    if (recording) {
        recordingStart();
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

function getSpeakers() {
    return getAudioDevices("wasapi_output_capture", "desktop-audio");
}

function getMicrophones() {
    return getAudioDevices("wasapi_input_capture", "mic-audio");
}

function getAudioDevices(type, subtype) {
    const dummyDevice = osn.InputFactory.create(type, subtype, { device_id: 'does_not_exist' });
    const devices = dummyDevice.properties.get('device_id').details.items.map(({ name, value }) => {
        return { device_id: value, name, };
    });
    dummyDevice.release();
    return devices;
};

function intersectRect(r1, r2) {
    if (r1.x < r2.x + r2.width && r2.x < r1.x + r1.width && r1.y < r2.y + r2.height)
        return r2.y < r1.y + r1.height;
    else return false;
}

function recordingStart(setup) {
    if (recording) {
        return;
    }

    const { captureRegion, captureCursor, speakers, microphones, fps } = setup;

    if (!captureRegion || !_.isNumber(captureRegion.x) || !_.isNumber(captureRegion.y) || !_.isNumber(captureRegion.width) || !_.isNumber(captureRegion.height))
        throw new Error("captureRegion must be specified and in format { x, y, width, height }");

    if (!speakers || !_.isArray(speakers))
        throw new Error("speakers must be specified and in format [device_id_1, device_id_2]");

    if (!microphones || !_.isArray(microphones))
        throw new Error("microphones must be specified and in format [device_id_1, device_id_2]");

    if (microphones.length + speakers.length > 4)
        throw new Error("Only capturing up to 4 simultaneous audio recording devices are supported at one time");

    if (!_.isNumber(fps) || fps < 1)
        throw new Error("fps must be specified and > 0");

    console.log('OBS Start recording...');

    osnset.setSetting("Output", "Untitled", "Mode", "Advanced");
    osnset.setSetting("Video", "Untitled", "FPSCommon", fps);
    osnset.setSetting("Output", "Recording", "RecFormat", "mkv");
    // osnset.setSetting("Output", "Streaming", "Bitrate", 10000);

    const scene = osn.SceneFactory.create('clscene');
    resources.push(scene);

    osn.Global.setOutputSource(1, scene);

    const displays = screen();

    // const desktop = {
    //     l: _.minBy(displays, d => d.bounds.x).bounds.x,
    //     t: _.minBy(displays, d => d.bounds.y).bounds.y,
    //     r: _.maxBy(displays, d => d.bounds.x + d.bounds.width).bounds.width,
    //     b: _.maxBy(displays, d => d.bounds.y + d.bounds.height).bounds.height,
    // }

    // const canvasWidth = desktop.r - desktop.l;
    // const canvasHeight = desktop.b - desktop.t;

    // osnset.setSetting("Video", "Untitled", "Base", `${canvasWidth}x${canvasHeight}`);
    osnset.setSetting("Video", "Untitled", "Base", `${captureRegion.width}x${captureRegion.height}`);
    osnset.setSetting("Video", "Untitled", "Output", `${captureRegion.width}x${captureRegion.height}`);

    let displayAdded = false;

    for (let idx in displays) {
        const bounds = displays[idx].bounds;
        console.log(bounds);
        console.log(captureRegion);
        if (intersectRect(bounds, captureRegion)) {
            const inputSettings = {
                capture_cursor: captureCursor,
                monitor: idx
            }
            const videoSource = osn.InputFactory.create("monitor_capture", `display_${idx}`, inputSettings);

            const itemInfo = {
                name: `display_${idx}_item`,
                crop: {
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0
                },
                scaleX: 1,
                scaleY: 1,
                visible: true,
                x: bounds.x - captureRegion.x,
                y: bounds.y - captureRegion.y,
                rotation: 0
            }

            const sceneItem = scene.add(videoSource, itemInfo);
            resources.push(videoSource);
            resources.push(sceneItem);

            displayAdded = true;
        }
    }

    if (!displayAdded) {
        freeResources();
        throw new Error("No display in capture bounds");
    }

    osnset.setSetting("Output", "Audio - Track 1", "Track1Name", "Mixed: all sources");
    // setSetting('Output', 'Track1Name', 'Mixed: all sources');
    let currentTrack = 2;

    for (const did of speakers) {
        const source = osn.InputFactory.create('wasapi_output_capture', 'desktop-audio', { device_id: did });
        osnset.setSetting("Output", `Audio - Track ${currentTrack}`, `Track${currentTrack}Name`, `audio_${did}`);
        source.audioMixers = 1 | (1 << currentTrack - 1); // Bit mask to output to only tracks 1 and current track
        osn.Global.setOutputSource(currentTrack, source);
        currentTrack++;
    }

    for (const did of microphones) {
        const source = osn.InputFactory.create('wasapi_input_capture', 'mic-audio', { device_id: did });
        osnset.setSetting("Output", `Audio - Track ${currentTrack}`, `Track${currentTrack}Name`, `audio_${did}`);
        source.audioMixers = 1 | (1 << currentTrack - 1); // Bit mask to output to only tracks 1 and current track
        osn.Global.setOutputSource(currentTrack, source);
        currentTrack++;
    }

    osnset.setSetting('Output', "Recording", 'RecTracks', parseInt('1'.repeat(currentTrack - 1), 2)); // Bit mask of used tracks: 1111 to use first four (from available six)

    osn.NodeObs.OBS_service_startRecording();

    // TODO ADD SIGNAL
    recording = true;
    console.log('OBS Start recording... Complete');
}

function recordingStop() {
    if (!recording) {
        return;
    }

    console.log('OBS Stop recording...');
    osn.NodeObs.OBS_service_stopRecording();

    // TODO ADD SIGNAL
    recording = false;

    // free scene resources
    freeResources();

    console.log('OBS Stop recording... Complete');
}

function freeResources() {
    const res = resources;
    resources = [];
    for (var r in res) {
        if (_.isFunction(r.release)) {
            r.release();
        }
        if (_.isFunction(r.remove)) {
            r.remove();
        }
    }
}

function getStatistics() {
    return osn.NodeObs.OBS_API_getPerformanceStatistics();
}

exports.isRecording = isRecording;
exports.isInitialized = isInitialized;
exports.init = init;
exports.release = release;
exports.recordingStart = recordingStart;
exports.recordingStop = recordingStop;
exports.getStatistics = getStatistics;
exports.getSpeakers = getSpeakers;
exports.getMicrophones = getMicrophones;
exports.setSetting = osnset.setSetting;
exports.getSettingsCategory = osnset.getSettingsCategory;
exports.updateSettingsCategory = osnset.updateSettingsCategory;