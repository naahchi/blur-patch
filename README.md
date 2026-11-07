# Video Watermark Patch Tool V4

## Run in Termux
1. Extract ZIP.
2. `cd` into `video-watermark-remover-v4`
3. Run `python -m http.server 8080`
4. Open Chrome: `http://127.0.0.1:8080`

## Tools
- Blur patch
- Pixelate patch
- Clone patch (tap a clean source point after drawing the target area)
- Rectangle or ellipse target
- Original resolution, no manual FPS selector

## Architecture / important facts
- Canvas 2D performs patch rendering.
- WebCodecs is used through Mediabunny's browser conversion pipeline.
- Mediabunny is used as a demuxer/muxer/container helper; it is not OpenCV/FFmpeg.
- WebCodecs does not itself demux input containers or mux MP4 output. A lightweight container library is required for a playable MP4.
- Output is re-encoded. Original timestamps are retained where supported, but original codec/bitrate are not identical.
- This prototype uses BufferTarget, so large videos may consume substantial memory. Start with a short 5-second clip.
- This version is not physically tested on the user's phone. CDN internet is required.
- Patch tools hide rather than reconstruct the watermark. Clone patch uses a fixed source area and may look unnatural if the scene moves.


## V4.1 download reliability changes
- Replaced BufferTarget (whole output kept in RAM) with Mediabunny StreamTarget writing to Chrome OPFS storage.
- Output is retrieved as an OPFS File and linked for download after finalization.
- Reuses patch canvases/masks rather than creating several canvases on every frame.
- OPFS is required; there is no large in-memory fallback.
- Download failure can still depend on Android Chrome download manager/storage permissions; if it fails, share the visible app status and file size.


## V4.2 download fix
- Fixed a cleanup bug: successful OPFS output was being removed in `finally`, while the download object URL still depended on that file. This could cause Chrome's `Failed - Network error`.
- Successful output is now retained until the page/session is closed or the browser clears origin storage.
- Added `Save to device`: uses the browser Save File Picker when available, then Android share sheet with a File, then a standard download fallback.
- Unique output filenames reduce duplicate-name confusion.
- After processing, use the green **Save to device** button. Do not use the fallback link unless needed.
