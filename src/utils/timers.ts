export const setTimeout = (ms: number) => new Promise(r => window.setTimeout(r, ms));
