export function continuousEnd(ranges, time) {
  for (let i = 0; i < ranges.length; i++) {
    if (ranges.start(i) <= time + 0.05 && ranges.end(i) > time) return ranges.end(i);
  }
  return time;
}
export class PlaybackBuffer {
  constructor(video, seconds, notify, now = () => performance.now()) {
    this.now = now; this.readySince = undefined; this.hasStarted = false;
    this.video = video; this.seconds = seconds; this.notify = notify;
    this.preparing = false; this.live = false; this.cancelled = false;
  }
  async play({rebuild = false} = {}) {
    if (this.hasStarted && !rebuild) return this.video.play();
    if (!this.seconds) return this.video.play();
    this.needsRebuild = false; this.cancelled = false; this.preparing = true; this.readySince = undefined;
    this.notify(`正在准备 ${this.seconds} 秒字幕缓冲…`);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 100);
    this.tick();
  }
  tick() {
    if (!this.preparing || this.video.seeking || this.video.readyState < 2) return;
    const time = this.video.currentTime;
    const remaining = Number.isFinite(this.video.duration) ? Math.max(0, this.video.duration - time) : this.seconds;
    const available = continuousEnd(this.video.buffered, time) - time;
    if (available <= 0) { this.readySince = undefined; return; }
    this.readySince ??= this.now();
    const required = Math.min(this.seconds, remaining);
    if (available + 0.05 < required || this.now() - this.readySince < required * 1000) return;
    this.preparing = false; this.hasStarted = true; clearInterval(this.timer);
    void this.video.play().catch(error => this.notify('无法播放：' + error.message));
  }
  cancel() { this.preparing = false; this.cancelled = true; clearInterval(this.timer); }
  destroy() { this.cancel(); }
}
