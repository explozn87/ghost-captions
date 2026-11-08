// Copies the MediaPipe audio wasm fileset into public/wasm so the app serves it
// itself (design.md: no third-party CDN at judging time). Runs before dev/build.
import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('public/wasm', { recursive: true });
cpSync('node_modules/@mediapipe/tasks-audio/wasm', 'public/wasm', { recursive: true });
console.log('copied MediaPipe wasm to public/wasm');
