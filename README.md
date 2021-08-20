# obs-express
Small library to host libobs behind an express-js http server so it can be controlled easily by other processes.
Wraps the excellent [stream-labs/obs-studio-node](https://github.com/stream-labs/obs-studio-node) project. 
Run `obs-express.exe` and it will launch an http server which can be used to remotely control obs. 

The following API functions are supported -

## List Audio Devices
Provides a list of audio devices to be used with `/recording/start`

`GET /audio/speakers`

`GET /audio/microphons`

*Example Response*

```json
[
  {
    "device_id": "default",
    "name": "Default"
  },
  {
    "device_id": "{0.0.0.00000000}.{af71792b-6296-434f-a5e0-5dfc2617e019}",
    "name": "Speakers (D50s)"
  }
]
```

## Start Recording
Start a video recording. Must contain the area of the screen to record (`captureRegion`) in request body. All other parameters are optional.

`POST /recording/start`

*Example Request Body*

```js
{
  // capture this portion of the virtual desktop.
  // this can span multiple displays
  "captureRegion": {
    "x": 500,
    "y": 0,
    "width": 1920,
    "height": 1000
  },
  
  // array of audio devices to capture. list valid devices via /audio endpoint.
  // max 6 devices
  "speakers": ["default"],
  "microphones": [],
  
  // target fps and quality. a lower cq results in a better quality / higher filesize
  "fps": 60,
  "cq": 29,
  
  // optionally downscale output 
  "maxOutputWidth": 1920,
  "maxOutputHeight": 1080,

  // use gpu for encoding, if available
  "hardwareAccelerated": true,
  
  // directory to write video file to
  "outputDirectory": "C:\\Users\\Caelan\\Videos",
  
  // container format can be mkv or mp4. mkv is recommended, since file is still usable if partially corrupted
  "containerFormat": "mkv",
  
  // can be slow, medium, or fast. slow uses more system resources but results in a smaller file size
  "performanceMode": "slow",
  
  // subsampling can be yuv420 (more compatible) or yuv444 (better quality)
  "subsamplingMode": "yuv420",
  
  // show an animation in video where mouse is clicked
  "trackMouseClicks": true
}
```

*Example Response*

```json
{
  "status": "ok"
}
```

## Stop Recording
Stop a video recording.

`POST /recording/stop`

(no request body)

*Example Response*

```json
{
  "status": "ok"
}
```

## Get Status / Statistics

`GET /status`

*Example Response*

```json
{
  "initialized": true,
  "recording": false,
  "recordingTime": 0,
  "statistics": {
    "CPU": 1.5,
    "numberDroppedFrames": 0,
    "percentageDroppedFrames": 0,
    "streamingBandwidth": 0,
    "streamingDataOutput": 0,
    "recordingBandwidth": 0,
    "recordingDataOutput": 0,
    "frameRate": 60.0000024000001,
    "averageTimeToRenderFrame": 0.078913,
    "memoryUsage": 50.39453125,
    "diskSpaceAvailable": "140.558 GB"
  }
}
```

## Get Settings
Get current OBS settings. Can be "General", "Stream", "Output", "Audio", "Video", "Hotkeys", or "Advanced". 
Specify "?detailed=true" to also recieve the valid settings values. 
You probably won't need to use this API, as most settings are available for configuration through the Start Recording endpoint, but this can be used for advanced obs customization when required.

`GET /settings/Video`

*Example Response*

```json
{
  "Untitled": {
    "ScaleType": "bicubic",
    "FPSType": "Fractional FPS Value",
  }
}
```

`GET /settings/Video?detailed=true`

*Example Response*

```json
[
  {
    "nameSubCategory": "Untitled",
    "parameters": [
      {
        "name": "ScaleType",
        "type": "OBS_PROPERTY_LIST",
        "description": "Downscale Filter",
        "subType": "OBS_COMBO_FORMAT_STRING",
        "currentValue": "bicubic",
        "values": [
          {
            "Bilinear (Fastest, but blurry if scaling)": "bilinear"
          },
          {
            "Bicubic (Sharpened scaling, 16 samples)": "bicubic"
          },
          {
            "Lanczos (Sharpened scaling, 32 samples)": "lanczos"
          }
        ],
        "visible": true,
        "enabled": true,
        "masked": false
      },
      {
        "name": "FPSType",
        "type": "OBS_PROPERTY_LIST",
        "description": "FPS Type",
        "subType": "OBS_COMBO_FORMAT_STRING",
        "currentValue": "Fractional FPS Value",
        "values": [
          {
            "Common FPS Values": "Common FPS Values"
          },
          {
            "Integer FPS Value": "Integer FPS Value"
          },
          {
            "Fractional FPS Value": "Fractional FPS Value"
          }
        ],
        "visible": true,
        "enabled": true,
        "masked": false
      }
    ]
  }
]
```

## Set Settings
Update OBS settings. This will be applied as a patch, and unspecified values will be left unchanged. Can be "General", "Stream", "Output", "Audio", "Video", "Hotkeys", or "Advanced". 

`POST /settings/Output`

*Example Request Body*

```json
{
  "Recording": {
    "RecEncoder": "jim_nvenc",
    "Recrate_control": "CRF"
  }
}
```

*Example Response*

```json
{
  "status": "ok"
}
```

