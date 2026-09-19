import { volcanoTranslate } from './volcano.mjs';
import { googleTranslate } from './google.mjs';
import { pipeline, env } from '@huggingface/transformers';
import { fileURLToPath } from 'node:url';

const modelPath=process.env.PLAYER_MODEL_DIR || fileURLToPath(new URL('./models/', import.meta.url));
env.cacheDir=modelPath;
env.allowRemoteModels=true;
let speech;
let translation;
let loading;
let busy = false;
export const state = { phase: 'idle', message: '首次开启会下载本机模型，之后可重复使用。', file: '', progress: 0 };

export function prepare(provider = 'local') {
  if (speech && (provider !== 'local' || translation)) {
    state.phase = 'ready'; state.message = '本机模型已就绪';
    return Promise.resolve();
  }
  if (loading) return loading.then(() => prepare(provider));
  loading = (async () => {
    state.phase = 'loading';
    const progress_callback = (event) => {
      if (event.status === 'progress') {
        state.file = event.file;
        state.progress = Math.round(event.progress);
      }
    };
    state.message = '正在准备英文语音识别模型…';
    speech ??= await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base.en', {
      dtype: 'q8', device: 'cpu', progress_callback,
      session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 },
    });
    if (provider === 'local' && !translation) {
    state.message = '正在准备英译中模型…';
    translation = await pipeline('translation', 'Xenova/opus-mt-en-zh', {
      dtype: 'q8', device: 'cpu', progress_callback,
      session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 },
    });
    }
    state.phase = 'ready';
    state.message = '本机模型已就绪';
    state.file = '';
    state.progress = 100;
  })().catch((error) => {
    state.phase = 'error';
    state.message = `模型准备失败：${error instanceof Error ? error.message : String(error)}`;
    throw error;
  }).finally(() => { loading = undefined; });
  return loading;
}

export async function recognize(audio, provider = 'local') {
  if (!speech || (provider === 'local' && !translation)) throw new Error('模型尚未就绪，请先开启字幕。');
  if (busy) throw new Error('正在处理上一段音频，请稍后重试。');
  busy = true;
  const start = performance.now();
  try {
    let energy = 0;
    for (const value of audio) energy += value * value;
    if (Math.sqrt(energy / audio.length) < 0.002) return { en: '', zh: '', seconds: 0 };
    const result = await speech(audio, { max_new_tokens: 160 });
    const item = Array.isArray(result) ? result[0] : result;
    const en = item.text.trim();
    if (!en) return { en: '', zh: '', seconds: 0 };
    const zh = provider === 'none' ? '' : await translateText(en, provider);
    return { en, zh, seconds: (performance.now() - start) / 1000 };
  } finally { busy = false; }
}

export async function translateText(en, provider) {
  if (provider === 'google') return googleTranslate(en);
  if (provider === 'volcano') return volcanoTranslate(en);
  if (!translation) throw new Error('本机翻译模型尚未就绪。');
  return (await translation(en, { max_new_tokens: 128 })).flat()[0].translation_text.trim();
}
