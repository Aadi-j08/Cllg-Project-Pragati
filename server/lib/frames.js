// frames.js
//
// Extracts a sampled sequence of frames from an uploaded video.
//
// Two deliberate choices here:
//
//  1. We sample at a fixed rate rather than pulling every frame. Sprint cadence
//     tops out near 5 steps per second, so by Nyquist anything above ~10 fps can
//     resolve it; 24 fps leaves comfortable headroom while cutting the number of
//     model invocations by more than half on 60 fps phone footage.
//
//  2. Each request gets its own temp directory. A single shared folder would let
//     two concurrent uploads read each other's frames.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegStatic = require("ffmpeg-static");

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

const SAMPLE_FPS = 24;
const MAX_FRAMES = 120; // five seconds of sampled motion
const FRAME_WIDTH = 512; // MoveNet works from a small square; downscaling early is free speed

/**
 * Decode a video into PNG frames on disk.
 * @returns {Promise<{ dir: string, files: string[], fps: number }>}
 */
function extractFrames(videoPath, { fps = SAMPLE_FPS, maxFrames = MAX_FRAMES } = {}) {
  const dir = path.join(os.tmpdir(), `pragati-frames-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        `-vf`, `fps=${fps},scale=${FRAME_WIDTH}:-2`,
        `-frames:v`, String(maxFrames),
      ])
      .output(path.join(dir, "frame-%04d.png"))
      .on("end", () => {
        let files;
        try {
          files = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith(".png"))
            .sort() // zero-padded names sort into capture order
            .map((f) => path.join(dir, f));
        } catch (err) {
          return reject(err);
        }

        if (!files.length) {
          return reject(
            Object.assign(
              new Error("No frames could be read from that video. Is the file a valid clip?"),
              { status: 400 }
            )
          );
        }
        resolve({ dir, files, fps });
      })
      .on("error", (err) => {
        cleanup(dir);
        reject(
          Object.assign(
            new Error(`Could not decode the video: ${err.message}`),
            { status: 400 }
          )
        );
      })
      .run();
  });
}

/** Remove a temp directory and everything in it. Never throws. */
function cleanup(dir) {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // A leftover temp folder is not worth failing a request over.
  }
}

module.exports = { extractFrames, cleanup, SAMPLE_FPS, MAX_FRAMES };
