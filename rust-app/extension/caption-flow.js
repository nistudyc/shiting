import { StableCaption } from './stable.js';
export class CaptionFlow {
  constructor(request, emit, notify) {
    this.request = request; this.emit = emit; this.notify = notify;
    this.entries = new Map(); this.pending = []; this.running = false; this.active = true; this.visible = null;
  }
  stop() { this.active = false; this.pending = []; this.entries.clear(); }
  english(text, packet) {
    if (!this.active || !text?.trim()) return;
    let entry = this.entries.get(packet.id);
    if (!entry) { entry = { stable: new StableCaption(), en: '', revision: 0 }; this.entries.set(packet.id, entry); }
    const committed = entry.stable.update(text, packet.final);
    entry.en = [entry.en, committed].filter(Boolean).join(' ');
    if (!entry.en) return;
    if (!committed && !packet.final) return;
    entry.revision++;
    this.visible = entry;
    this.emit({ en: entry.en, zh: '', status: '' });
    const job = { entry, text, revision: entry.revision };
    const index = this.pending.findIndex(item => item.entry === entry);
    if (index >= 0) this.pending[index] = job; else this.pending.push(job);
    this.pending = this.pending.slice(-2);
    while (this.entries.size > 8) this.entries.delete(this.entries.keys().next().value);
    void this.translate();
  }
  async translate() {
    if (this.running || !this.active) return;
    this.running = true;
    try {
      let job;
      while (this.active && (job = this.pending.shift())) {
        try {
          const { zh } = await this.request(job.text);
          if (this.active && this.visible === job.entry && job.revision === job.entry.revision) this.emit({ en: job.entry.en, zh: zh || '', status: '' });
        } catch (error) { if (this.active) this.notify(`英文继续显示；中文翻译失败：${error.message}`); }
      }
    } finally { this.running = false; }
  }
}
