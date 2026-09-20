function tail(text, limit) {
  if (text.length <= limit) return text;
  const value = text.slice(-limit);
  return '…' + (/^[A-Za-z]/.test(value) && value.includes(' ') ? value.slice(value.indexOf(' ') + 1) : value);
}
export class CaptionView {
  constructor(api, notify, mode) {
    this.api = api; this.notify = notify; this.mode = mode;
    this.entries = []; this.future = []; this.clock = undefined; this.pending = []; this.running = false;
    this.epoch = 0; this.active = false; this.translationError = false;
    this.language = 'local'; this.timer = undefined; this.controller = undefined;
  }
  start(provider) { this.language = provider; this.active = true; this.translationError = false; }
  reset() {
    this.epoch++; this.future = []; this.pending = []; this.controller?.abort();
    clearTimeout(this.timer);
    document.querySelector('#en').textContent = '';
    document.querySelector('#zh').textContent = '';
    this.show();
  }
  setClock(clock) { this.clock = clock; }
  tick() {
    if (!this.clock) return;
    const time = this.clock();
    for (const entry of [...this.future]) {
      if (entry.start > time) continue;
      this.future.splice(this.future.indexOf(entry), 1);
      this.entries.unshift(entry);
      document.querySelector('#history').prepend(entry.element);
    }
    while (this.entries.length > 120) this.entries.pop().element.remove();
    const entry = this.active ? this.entries.find(row => row.epoch === this.epoch && row.start <= time && time < row.end) : undefined;
    document.querySelector('#en').textContent = entry ? tail(entry.en, window.innerWidth < 600 ? 52 : 112) : '';
    document.querySelector('#zh').textContent = entry ? tail(entry.zh, window.innerWidth < 600 ? 28 : 56) : '';
    this.show();
  }
  visibleEntries() { return this.entries; }
  stop() { this.active = false; this.reset(); }
  show() {
    document.querySelector('#overlay').hidden = !this.active || this.mode.value === 'off' || !document.querySelector('#en').textContent;
    document.querySelector('#zh').hidden = this.mode.value === 'en';
    document.querySelector('#en').hidden = this.mode.value === 'zh';
  }
  english(committed, raw, item) {
    let entry = [...this.entries, ...this.future].find(row => row.key === item.key);
    if (!raw.trim() || (entry && (item.version ?? 0) < entry.version)) return;
    if (!entry) {
      const element = document.createElement('article'); element.className = 'row';
      const time = document.createElement('time');
      const en = document.createElement('p'); en.className = 'original';
      const zh = document.createElement('p'); zh.className = 'translation';
      zh.textContent = '中文跟译中…';
      element.append(time, en, zh);
      const history = document.querySelector('#history'); history.querySelector('.empty')?.remove(); if (!this.clock || item.start <= this.clock()) history.prepend(element);
      entry = { start:item.start, end:item.end, endOfMedia:item.endOfMedia, session:item.session, sourceName:item.sourceName, epoch:this.epoch, version:item.version ?? 0, key: item.key, time: item.time, en: '', zh: '', element, requestedAt: -Infinity, translatedSource: '' };
      if (this.clock && item.start > this.clock()) this.future.push(entry); else this.entries.unshift(entry);
      while (this.entries.length > 120) this.entries.pop().element.remove();
    }
    entry.version = item.version ?? 0; entry.end = item.end;
    entry.en = raw.trim();
    entry.element.querySelector('time').textContent = entry.time + (item.final ? ' · 句末校正中' : ' · 英文先行 / 中文跟译');
    entry.element.querySelector('.original').textContent = entry.en;
    document.querySelector('#export').disabled = false; document.querySelector('#clear').disabled = false;
    if (!this.clock) {
    document.querySelector('#en').textContent = tail(entry.en, window.innerWidth < 600 ? 52 : 112);
    this.show();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { document.querySelector('#en').textContent=''; document.querySelector('#zh').textContent=''; this.show(); }, 7000);
    } else this.tick();
    if (this.translationError || !raw.trim()) return;
    const now = performance.now();
    if (!item.final && now - entry.requestedAt < 1000) return;
    if (raw === entry.translatedSource) { if (item.final) entry.element.querySelector('time').textContent = entry.time + ' · 已完成'; return; }
    entry.requestedAt = now;
    const job = { entry, text: raw, final: item.final, epoch: this.epoch, version:entry.version };
    const pendingIndex = this.pending.findIndex(value => value.entry === entry);
    if (pendingIndex >= 0) this.pending[pendingIndex] = job; else this.pending.push(job);
    this.pending = this.pending.filter(job => (this.entries.includes(job.entry) || this.future.includes(job.entry)));
    while (this.pending.length > 8) this.pending.shift();
    while (this.future.length > 32) this.future.shift();
    void this.translate();
  }
  async translate() {
    if (this.running || !this.pending.length || !this.active || this.translationError) return;
    if (this.clock) this.pending = this.pending.filter(job => (job.entry.endOfMedia || job.entry.end > this.clock()));
    if (!this.pending.length) return;
    this.running = true;
    const job = this.pending.shift();
    const controller = new AbortController(); this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const result = await this.api('/api/translate?provider=' + this.language, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: job.text }), signal: controller.signal });
      if (job.epoch !== this.epoch || !this.active || (this.clock && job.version !== job.entry.version)) return;
      job.entry.zh = result.zh;
      job.entry.translatedSource = job.text;
      job.entry.element.querySelector('.translation').textContent = result.zh;
      job.entry.element.querySelector('time').textContent = job.entry.time + (job.final ? ' · 已完成' : ' · 中文将按上下文校正');
      if (this.clock) this.tick();
      if (!this.clock && this.entries[0] === job.entry && document.querySelector('#en').textContent) {
        document.querySelector('#zh').textContent = tail(result.zh, window.innerWidth < 600 ? 28 : 56);
        this.show();
      }
    } catch (error) {
      if (job.epoch === this.epoch && this.active && job.version === job.entry.version) {
        this.translationError = true; this.pending = [];
        this.notify('英文继续显示；中文翻译已暂停：' + error.message, true);
      }
    } finally { clearTimeout(timeout); this.running = false; void this.translate(); }
  }
  clear() {
    this.reset(); this.entries = [];
    const history = document.querySelector('#history'); history.replaceChildren();
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '记录已清空，下一条字幕会继续显示。'; history.append(empty);
    document.querySelector('#clear').disabled = true; document.querySelector('#export').disabled = true;
  }
  exportText() {
    const content = [...this.entries].reverse().map(row => `${row.time}\n${row.en}\n${row.zh}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = '视听-双语字幕.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
