const _ = require("lodash");
const path = require("path");
const osn = require("@streamlabs/obs-studio-node");
const { v4: uuid } = require('uuid');
const osnset = require("./settings");
const fs = require("fs");
const { Subject } = require("rxjs");
const { first } = require('rxjs/operators');
const screenlib = require('bindings')('getscreens');
const screen = screenlib.getScreenInfo;
const mouse = screenlib.getMouseState;

let initialized = false;
let recording = false;
let recordingStartTime;
let resources = [];
let trackerInterval;
let trackerPath;

const signals = new Subject();
function getNextSignalInfo(predicate) {
    return new Promise((resolve, reject) => {
        signals.pipe(first(predicate)).subscribe(signalInfo => resolve(signalInfo));
        setTimeout(() => reject('Signal wait timeout'), 10000);
    });
}

function isRecording() {
    return recording;
}

function isInitialized() {
    return initialized;
}

function init(connectId, workDir, dataDir) {
    console.log("Begin OBS init...");

    const productionMode = !!global.ISPKG;

    const pathRoot = productionMode ? path.dirname(process.execPath) : __dirname;
    const pathData = !!dataDir ? path.resolve(dataDir) : path.join(pathRoot, "obs-data");
    const pathObs = !!workDir ? path.resolve(workDir) : (productionMode ? path.join(pathRoot, "lib") : path.join(pathRoot, "node_modules", "@streamlabs", "obs-studio-node"));
    const pathObsExe = path.join(pathObs, "obs64.exe");
    const pathObsBasicConfig = path.join(pathData, "basic.ini");
    trackerPath = path.join(pathRoot, "tracker.png");

    const debugPath = (pname, create, pdir, fcontent) => {
        console.log(`  - ${pname}: '${pdir}'`);
        if (!fs.existsSync(pdir)) {
            if (create) {
                if (fcontent) {
                    console.log(`      WARNING: '${pname}' does not exist. Writing new file...`);
                    fs.writeFileSync(pdir, fcontent);
                } else {
                    console.log(`      WARNING: '${pname}' does not exist. Creating directory...`);
                    fs.mkdirSync(pdir);
                }

            } else {
                console.log(`      WARNING: '${pname}' does not exist. Are you missing a required command line argument?`);
            }
        }
    }

    console.log("Using the following paths:")
    debugPath("ROOT", false, pathRoot);
    debugPath("DATA", true, pathData);
    debugPath("CONFIG", true, pathObsBasicConfig, "[Video]\nBaseCX=100\nBaseCY=100\nOutputCX=100\nOutputCY=100");
    debugPath("OBS_LIB", false, pathObs);
    debugPath("TRACKER", false, trackerPath);

    if (!!connectId) {
        console.log("Attempting to connect to pre-existing OBS server: " + connectId);
        osn.NodeObs.IPC.connect(connectId);
    } else {
        debugPath("OBS_EXE", false, pathObsExe);
        console.log("Starting new OBS server process and connecting...");
        osn.NodeObs.IPC.setServerPath(pathObsExe, pathObs);
        osn.NodeObs.IPC.host("obs-express-" + uuid());
    }

    osn.NodeObs.SetWorkingDirectory(pathObs);

    osn.NodeObs.OBS_service_connectOutputSignals((signalInfo) => {
        console.log(signalInfo);
        signals.next(signalInfo);
    });

    const initResult = osn.NodeObs.OBS_API_initAPI('en-US', pathData, '1.0.0');

    if (initResult !== 0) {
        //See obs-studio-node/module.ts:EVideoCodes or obs-studio/obs-defs.h for C constants
        switch (initResult) {
            case -1: // Fail
                throw new Error("Failed to initialize OBS API (EFail). OBS core is already disposed or was not created. Ensure sure OBS lib path is correct.");
            case -2: // NotSupported
                throw new Error("Failed to initialize OBS API (NotSupported). Your video drivers may be out of date?");
            case -3: // InvalidParam
                throw new Error("Failed to initialize OBS API (InvalidParam). The incorrect parameters were sent to OBS during startup. This may be caused by an invalid OBS config, you can try deleting it at: " + pathObsBasicConfig);
            case -4: // CurrentlyActive
                throw new Error("Failed to initialize OBS API (CurrentlyActive). OBS is currently recording and video settings can not be changed.");
            case -5: // ModuleNotFound
                throw new Error("Failed to initialize OBS API (ModuleNotFound). Your video drivers may be out of date?");
            default:
                throw new Error("An unknown error was encountered while initializing OBS (code " + initResult + ")");
        }
    }

    console.log("Reconfiguring helpful/static settings");
    osnset.setSetting("Output", "Untitled", "Mode", "Advanced");
    osnset.setSetting("Video", "Untitled", "FPSType", "Fractional FPS Value");

    osn.NodeObs.RegisterSourceCallback((objs) => {
        // objs is an array of IObsSourceCallbackInfo[] 
        // https://github.com/stream-labs/desktop/blob/6be5e28afbdd2f7491c650ffd012ae15e671f096/app/services/sources/sources.ts#L57
        // we don't really care about this global callback, but
        // unless it's registered, volmeter callbacks are also not processed. 
        // see https://github.com/stream-labs/obs-studio-node/blob/735ffb80d67d8c1a339848154b6b54bc98fe6458/obs-studio-client/source/callback-manager.cpp
    });

    initialized = true;
    console.log("Started OBS successfully");
}

async function release() {
    assertInitialized();
    console.log('Shutting down OBS...');

    try {
        if (recording) {
            await recordingStop();
        }
    } catch { }

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
    assertInitialized();
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

function validate(required, value, valfn, defaultval, help) {
    const isValid = valfn(value);
    if (isValid)
        return value;

    if (value === undefined && defaultval !== undefined && !required)
        return defaultval;

    throw new Error(!!help ? help : "Value was invalid");
}

async function recordingStart(setup) {
    assertInitialized();
    if (recording) { return; }

    try {
        let {
            captureRegion,
            speakers,
            microphones,
            fps,
            cq,
            maxOutputWidth,
            maxOutputHeight,
            hardwareAccelerated,
            outputDirectory,
            performanceMode,
            subsamplingMode,
            containerFormat,
            trackMouseClicks,
            ...other
        } = setup;

        // PARSE INPUT
        // =============================
        if (!_.isEmpty(other))
            console.log("Ignored / unknown setup parameters: " + JSON.stringify(other));

        if (!captureRegion || !_.isNumber(captureRegion.x) || !_.isNumber(captureRegion.y) || !_.isNumber(captureRegion.width) || !_.isNumber(captureRegion.height))
            throw new Error("captureRegion must be specified and in format { x, y, width, height }");

        speakers = validate(false, speakers, _.isArray, [], "speakers must be an array of strings");
        microphones = validate(false, microphones, _.isArray, [], "microphones must be an array of strings");
        fps = validate(false, fps, v => _.isNumber(v) && v > 0, 30, "fps must be a number > 0");
        cq = validate(false, cq, v => _.isNumber(v) && v > 0 && v <= 51, 24, "cq must be a number and between 1-51 inclusive");
        maxOutputWidth = validate(false, maxOutputWidth, v => _.isNumber(v), 0, "maxOutputWidth must be a number");
        maxOutputHeight = validate(false, maxOutputHeight, v => _.isNumber(v), 0, "maxOutputHeight must be a number");
        hardwareAccelerated = validate(false, hardwareAccelerated, _.isBoolean, false, "hardwareAccelerated must be a boolean");
        outputDirectory = validate(true, outputDirectory, _.isString, null, "outputDirectory must be a path");
        performanceMode = validate(false, performanceMode, _.isString, "medium", "performanceMode must be a string");
        subsamplingMode = validate(false, subsamplingMode, _.isString, "yuv420", "subsamplingMode must be a string");
        containerFormat = validate(false, containerFormat, _.isString, "mp4", "containerFormat must be a string");
        trackMouseClicks = validate(false, trackMouseClicks, _.isBoolean, false, "trackMouseClicks must be a boolean");
        performanceMode = performanceMode.toLowerCase();
        subsamplingMode = subsamplingMode.toLowerCase();

        if (_.indexOf(["slow", "medium", "fast"], performanceMode) < 0)
            throw new Error("performanceMode must be one of [slow, medium, fast]");

        if (_.indexOf(["yuv420", "yuv444"], subsamplingMode) < 0)
            throw new Error("subsamplingMode must be one of [yuv420, yuv444]");

        if (_.indexOf(["mkv", "mp4"], containerFormat) < 0)
            throw new Error("containerFormat must be one of [mkv, mp4]");

        if (!fs.existsSync(outputDirectory))
            throw new Error("outputDirectory directory must exist");


        // GENERAL SETTINGS
        // =============================
        osnset.setSetting("Output", "Untitled", "Mode", "Advanced");
        osnset.setSetting("Video", "Untitled", "FPSType", "Fractional FPS Value");
        osnset.setSetting("Video", "Untitled", "FPSNum", fps);
        osnset.setSetting("Video", "Untitled", "FPSDen", 1);
        osnset.setSetting("Output", "Recording", "RecFormat", containerFormat);
        osnset.setSetting("Output", "Recording", "RecFilePath", outputDirectory);


        // CONFIGURE ENCODER
        // =============================
        if (subsamplingMode == "yuv420") {
            // use 709 only if resolution > 720p
            const cspace = captureRegion.width * captureRegion.height > 1280 * 720 ? "709" : "601";
            osnset.setSetting("Advanced", "Video", "ColorFormat", "NV12");
            osnset.setSetting("Advanced", "Video", "ColorSpace", cspace);
            osnset.setSetting("Advanced", "Video", "ColorRange", "Partial");
        } else {
            osnset.setSetting("Advanced", "Video", "ColorFormat", "I444");
            osnset.setSetting("Advanced", "Video", "ColorSpace", "709");
            osnset.setSetting("Advanced", "Video", "ColorRange", "Full");
        }

        let selectedEncoder = "obs_x264";
        if (hardwareAccelerated) {
            // [ 'none', 'obs_x264', 'ffmpeg_nvenc', 'jim_nvenc' ]
            const availableEncoders = osnset.getAvailableValues("Output", "Recording", "RecEncoder");
            if (_.indexOf(availableEncoders, "jim_nvenc") >= 0) {
                selectedEncoder = "jim_nvenc";
            }
        }

        switch (selectedEncoder) {
            case "obs_x264":
                osnset.setSetting("Output", "Recording", "RecEncoder", selectedEncoder);
                osnset.setSetting("Output", "Recording", "Recrate_control", "CRF");
                osnset.setSetting("Output", "Recording", "Reccrf", cq);
                osnset.setSetting("Output", "Recording", "Recprofile", "high");
                switch (performanceMode) {
                    case "slow":
                        osnset.setSetting("Output", "Recording", "Recpreset", "slow");
                        osnset.setSetting("Output", "Recording", "Rectune", "psnr");
                        break;
                    case "medium":
                        osnset.setSetting("Output", "Recording", "Recpreset", "medium");
                        osnset.setSetting("Output", "Recording", "Rectune", "zerolatency");
                        break;
                    case "fast":
                        osnset.setSetting("Output", "Recording", "Recpreset", "veryfast");
                        osnset.setSetting("Output", "Recording", "Rectune", "zerolatency");
                        break;
                }
                break;
            case "jim_nvenc":
                osnset.setSetting("Output", "Recording", "RecEncoder", selectedEncoder);
                osnset.setSetting("Output", "Recording", "Recrate_control", "CQP");
                osnset.setSetting("Output", "Recording", "Reccqp", cq);
                osnset.setSetting("Output", "Recording", "Recprofile", "high");
                switch (performanceMode) {
                    case "slow":
                        osnset.setSetting("Output", "Recording", "Recpreset", "mq");
                        osnset.setSetting("Output", "Recording", "Reclookahead", true);
                        break;
                    case "medium":
                        osnset.setSetting("Output", "Recording", "Recpreset", "default");
                        osnset.setSetting("Output", "Recording", "Reclookahead", false);
                        break;
                    case "fast":
                        osnset.setSetting("Output", "Recording", "Recpreset", "llhq");
                        osnset.setSetting("Output", "Recording", "Reclookahead", false);
                        break;
                }
                break;
            default:
                throw new Error(`Encoder '${selectedEncoder}' is not supported.`);
        }

        // CREATE SCENE
        // =============================
        const scene = osn.SceneFactory.create('clscene');
        resources.push(scene);
        osn.Global.setOutputSource(1, scene);


        // CONFIGURE DISPLAYS
        // =============================
        const displays = screen();
        osnset.setSetting("Video", "Untitled", "Base", `${captureRegion.width}x${captureRegion.height}`);

        const outputSize = { width: captureRegion.width, height: captureRegion.height };

        if (maxOutputWidth > 0 && outputSize.width > maxOutputWidth) {
            const waspect = outputSize.width / outputSize.height;
            outputSize.width = maxOutputWidth;
            outputSize.height = Math.round(maxOutputWidth / waspect);
        }

        if (maxOutputHeight > 0 && outputSize.height > maxOutputHeight) {
            const haspect = outputSize.height / outputSize.width;
            outputSize.width = Math.round(maxOutputHeight / haspect);
            outputSize.height = maxOutputHeight;
        }

        const dnsclperc = Math.round((1 - ((outputSize.width * outputSize.height) / (captureRegion.width * captureRegion.height))) * 100);

        if (dnsclperc > 0) {
            console.log(`Downscaling from ${captureRegion.width}x${captureRegion.height} to ${outputSize.width}x${outputSize.height} (-${dnsclperc}%)`);
        }

        osnset.setSetting("Video", "Untitled", "Output", `${outputSize.width}x${outputSize.height}`);

        let displayAdded = false;

        console.log("Capture region: " + JSON.stringify(captureRegion));

        for (let display of displays) {
            const { bounds, dpi, index } = display;
            console.log(`Checking display ${index}, dpi:${dpi}, bounds:` + JSON.stringify(bounds));

            if (intersectRect(bounds, captureRegion)) {
                const inputSettings = {
                    capture_cursor: true,
                    monitor: index,
                }
                const videoSource = osn.InputFactory.create("monitor_capture", `display_${index}`, inputSettings);
                resources.push(videoSource);

                const itemInfo = {
                    name: `display_${index}_item`,
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

                console.log(`Display intersects capture! placing on scene at ${itemInfo.x},${itemInfo.y},${bounds.width},${bounds.height}`);

                const sceneItem = scene.add(videoSource, itemInfo);
                resources.push(sceneItem);
                displayAdded = true;
            }
        }

        if (!displayAdded) {
            throw new Error("No display in capture bounds");
        }


        // ADD AUDIO DEVICES
        // =============================
        osnset.setSetting("Output", "Audio - Track 1", "Track1Name", "Mixed: all sources");
        let currentTrack = 2;

        for (const did of speakers) {
            const source = osn.InputFactory.create('wasapi_output_capture', 'desktop-audio', { device_id: did });
            resources.push(source);
            osnset.setSetting("Output", `Audio - Track ${currentTrack}`, `Track${currentTrack}Name`, `audio_${did}`);
            source.audioMixers = 1 | (1 << currentTrack - 1); // Bit mask to output to only tracks 1 and current track
            osn.Global.setOutputSource(currentTrack, source);
            currentTrack++;
        }

        for (const did of microphones) {
            const source = osn.InputFactory.create('wasapi_input_capture', 'mic-audio', { device_id: did });
            resources.push(source);
            osnset.setSetting("Output", `Audio - Track ${currentTrack}`, `Track${currentTrack}Name`, `audio_${did}`);
            source.audioMixers = 1 | (1 << currentTrack - 1); // Bit mask to output to only tracks 1 and current track
            osn.Global.setOutputSource(currentTrack, source);
            currentTrack++;
        }

        if (currentTrack >= 6)
            throw new Error("Only 5 simultaneous audio devices are supported");

        osnset.setSetting('Output', "Recording", 'RecTracks', parseInt('1'.repeat(currentTrack - 1), 2)); // Bit mask of used tracks: 1111 to use first four (from available six)


        // START RECORDING
        // =============================
        console.log('OBS Start recording...');
        osn.NodeObs.OBS_service_startRecording();

        const sig = await getNextSignalInfo(s => s.signal === "start");
        if (!!sig.error || sig.code > 0)
            throw new Error(`Recieved signal error '${sig.signal}' code ${sig.code}: ${sig.error}`);

        recording = true;
        recordingStartTime = Date.now();
        console.log('OBS Start recording... Complete');


        // MOUSE TRACKER
        // =============================
        if (trackMouseClicks && fs.existsSync(trackerPath)) {
            const imgSet = {
                unload: true,
                file: trackerPath,
            }
            const imageSource = osn.InputFactory.create("image_source", `mouse_highlight`, imgSet);
            resources.push(imageSource);

            const filterSettings = {
                opacity: 0,
            }
            const imageFilter = osn.FilterFactory.create("color_filter", "mouse_color_correction", filterSettings);
            imageSource.addFilter(imageFilter);
            resources.push(imageFilter);

            const imgsci = scene.add(imageSource);
            resources.push(imgsci);

            const mouseTime = Math.min(16, 1000 / fps);
            console.log(`Mouse tracker enabled: Resolution is ${mouseTime}ms`);

            const animationDuration = 400; // ms
            let lastMouseClick, lastMouseClickPosition, mouseVisible;

            trackerInterval = setInterval(() => {
                let mouseData = mouse();
                if (mouseData.pressed) {
                    lastMouseClickPosition = mouseData;
                    lastMouseClick = Date.now();
                }

                let lastClickAgo = Date.now() - lastMouseClick;
                if (lastClickAgo < animationDuration) {
                    mouseVisible = true;
                    const opacity = (1 - (lastClickAgo / animationDuration)) * 100;
                    const mouseZoom = lastMouseClickPosition.dpi / 96;

                    // radius: min 15, will grow +35 to max of 50 (*dpi)
                    const radius = (10 + ((lastClickAgo / animationDuration) * 30)) * mouseZoom;

                    // scale: intendedRenderedSize/actualImageSize - the tracker.png is 100x100
                    const scale = radius / 50;

                    imgsci.position = {
                        x: lastMouseClickPosition.x - radius - captureRegion.x,
                        y: lastMouseClickPosition.y - radius - captureRegion.y
                    };
                    imgsci.scale = { x: scale, y: scale };
                    imageFilter.update({ opacity });
                    // console.log(`zoom: ${mouseZoom},  opacity: ${opacity},  radius: ${radius},  scale: ${scale},  x: ${imgsci.position.x}  y: ${imgsci.position.y}`);
                } else if (mouseVisible) {
                    mouseVisible = false;
                    imageFilter.update({ opacity: 0 });
                    // console.log("mouse off");
                }
            }, mouseTime);
        }
    } catch (e) {
        freeResources();
        recording = false;
        throw e;
    }
}

async function recordingStop() {
    assertInitialized();
    if (!recording) { return; }

    clearInterval(trackerInterval);
    console.log('OBS Stop recording...');
    osn.NodeObs.OBS_service_stopRecording();

    const sig = await getNextSignalInfo(s => s.signal === "stop");
    if (!!sig.error || sig.code > 0)
        throw new Error(`Recieved signal error '${sig.signal}' code ${sig.code}: ${sig.error}`);

    // TODO ADD SIGNAL
    recording = false;
    recordingStartTime = null;

    // free scene resources
    freeResources();

    console.log('OBS Stop recording... Complete');
}

function assertInitialized() {
    if (!initialized) throw new Error("OBS is not initialized. Call init() first.");
}

function freeResources() {
    clearInterval(trackerInterval);
    const res = resources;
    resources = [];
    for (const r in res) {
        if (_.isFunction(r.release)) {
            r.release();
        }
        if (_.isFunction(r.remove)) {
            r.remove();
        }
    }
}

function getStatistics() {
    return {
        initialized: isInitialized(),
        recording: isRecording(),
        recordingTime: !!recordingStartTime ? Date.now() - recordingStartTime : 0,
        statistics: osn.NodeObs.OBS_API_getPerformanceStatistics(),
    };
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