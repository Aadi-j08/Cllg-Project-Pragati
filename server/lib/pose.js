// pose.js
//
// Runs MoveNet over a list of PNG frames and returns raw keypoints.
//
// The original version of this project used @tensorflow/tfjs-node plus the
// native `canvas` package. Both need a C++ toolchain, which makes the project
// hard to set up on a fresh machine — especially on Windows.
//
// Instead we pick the fastest backend that is actually available, in order:
//
//   1. tfjs-node   native, fastest, but only if the user installed it
//   2. WASM        no compiler needed, roughly 20x the plain JS backend
//   3. plain CPU   pure JavaScript, always works, slow enough to notice
//
// PNGs are decoded with pngjs rather than the native `canvas` package, which
// removes the last build-tools dependency.

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

let tf = null;
let backendName = null;
let detectorPromise = null;

/**
 * Load TensorFlow with the best backend this machine can offer.
 * Kept lazy so importing this file (in tests, say) costs nothing.
 */
async function loadTensorflow() {
  if (tf) return tf;

  // 1. Native, if the optional dependency was installed.
  try {
    tf = require("@tensorflow/tfjs-node");
    backendName = "tfjs-node (native)";
    await tf.ready();
    return tf;
  } catch {
    // Not installed — expected on machines without build tools.
  }

  tf = require("@tensorflow/tfjs");

  // 2. WASM. Needs to be told where its .wasm binaries live when run in Node.
  try {
    const wasm = require("@tensorflow/tfjs-backend-wasm");
    const wasmDir = path.join(
      path.dirname(require.resolve("@tensorflow/tfjs-backend-wasm/package.json")),
      "dist"
    );
    // Trailing separator matters: tfjs appends the filename directly.
    wasm.setWasmPaths(wasmDir + path.sep);

    await tf.setBackend("wasm");
    await tf.ready();

    if (tf.getBackend() === "wasm") {
      backendName = "tfjs-wasm";
      return tf;
    }
  } catch (err) {
    console.warn(`[pose] WASM backend unavailable (${err.message}), falling back to CPU.`);
  }

  // 3. Pure JavaScript. Always works.
  require("@tensorflow/tfjs-backend-cpu");
  await tf.setBackend("cpu");
  await tf.ready();
  backendName = "tfjs-cpu (pure JavaScript)";
  return tf;
}

/** Create the MoveNet detector once and reuse it across requests. */
function getDetector() {
  if (detectorPromise) return detectorPromise;

  detectorPromise = (async () => {
    await loadTensorflow();

    const poseDetection = require("@tensorflow-models/pose-detection");
    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
    );

    console.log(`[pose] MoveNet ready on ${backendName}`);
    return detector;
  })();

  return detectorPromise;
}

/** Read a PNG off disk into an RGB tensor MoveNet can consume. */
function readFrameAsTensor(filePath) {
  const png = PNG.sync.read(fs.readFileSync(filePath));
  const { width, height, data } = png; // data is RGBA

  // Drop the alpha channel: MoveNet expects three channels.
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }

  return tf.tensor3d(rgb, [height, width, 3], "int32");
}

/**
 * Estimate a pose for each frame.
 *
 * Frames where nobody is detected are kept as empty keypoint lists rather than
 * dropped, so the caller can still reason about timing — a gap in the middle of
 * a clip is information, not something to quietly paper over.
 *
 * @param {string[]} files  PNG paths in capture order
 * @returns {Promise<{ frames: Array, backend: string }>}
 */
async function estimatePoses(files, { onProgress } = {}) {
  const detector = await getDetector();
  const frames = [];

  for (let i = 0; i < files.length; i++) {
    let input = null;
    try {
      input = readFrameAsTensor(files[i]);
      const poses = await detector.estimatePoses(input);
      frames.push({ keypoints: (poses[0] && poses[0].keypoints) || [] });
    } catch (err) {
      // One unreadable frame should not sink the whole analysis.
      frames.push({ keypoints: [] });
    } finally {
      if (input) input.dispose();
    }

    if (onProgress && i % 10 === 0) onProgress(i + 1, files.length);
  }

  return { frames, backend: backendName };
}

module.exports = { estimatePoses, getDetector, loadTensorflow };
