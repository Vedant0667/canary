// Typing for Vite `?raw` markdown imports used by packets.ts.
// vite/client already declares `*?raw`, but this makes the data module
// self-contained and explicit for the cached packet text imports.
declare module '*.md?raw' {
  const content: string;
  export default content;
}
