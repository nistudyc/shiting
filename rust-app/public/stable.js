export class StableCaption {
  constructor() { this.previous = []; this.count = 0; this.finished = false; }
  update(text, final) {
    if (this.finished) return '';
    const words = text.trim().split(/\s+/).filter(Boolean);
    let agreed = 0;
    const normalize = word => word.toLowerCase().replace(/[^a-z0-9']/g, '');
    while (agreed < Math.min(words.length, this.previous.length) && normalize(words[agreed]) === normalize(this.previous[agreed])) agreed++;
    const end = final ? words.length : Math.max(0, agreed - 1);
    const candidate = words.slice(this.count, end);
    this.previous = words;
    if (!final && candidate.length < 4 && !/[.!?]$/.test(candidate.join(' '))) return '';
    this.count = Math.max(this.count, end);
    this.finished = final;
    return candidate.join(' ');
  }
}
