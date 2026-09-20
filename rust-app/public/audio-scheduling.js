export function acceptsAudio(chunk, {enabled, buffered, paused, seeking}) {
  return enabled && !seeking && (buffered || !paused || chunk.endOfMedia === true);
}
export function timelyAudio(chunk, time) {
  return chunk.endOfMedia === true || chunk.end > time;
}
