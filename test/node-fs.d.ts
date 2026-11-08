// Minimal ambient declarations so a test can read a project file as text
// without pulling in the whole `@types/node` surface (which is not a project
// dependency). Kept in test/ so it does not widen the app's type surface. Only
// the members the tests use are declared.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
}
// Vitest runs from the project root, so `process.cwd()` locates project files.
declare const process: { cwd(): string };
