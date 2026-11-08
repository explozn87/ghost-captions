// Ambient declaration so TypeScript understands Vite's `?raw` imports used by
// tests to load fixtures as plain strings. Kept in test/ so it does not widen
// the app's type surface.
declare module '*?raw' {
  const content: string;
  export default content;
}
