// Sound: built in milestone 9.
export async function createMix() {
  const ctx = new AudioContext();
  await ctx.resume();
  return { ctx, levels: () => [0, 0] };
}
