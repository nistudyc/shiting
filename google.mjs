let apiKey = '';
export function configureGoogle(value) { apiKey = value; }
export function googleConfigured() { return apiKey.length > 0; }
export async function googleTranslate(text) {
  if (!apiKey) throw new Error('请先在翻译设置中输入 Google Cloud API Key。');
  const response = await fetch('https://translation.googleapis.com/language/translate/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify({ q: text, source: 'en', target: 'zh-CN', format: 'text' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Google 翻译返回 ${response.status}；请检查 API Key、Cloud Translation API 启用状态、配额和结算。`);
  const result = await response.json();
  const translated = result?.data?.translations?.[0]?.translatedText;
  if (typeof translated !== 'string') throw new Error('Google 翻译返回了无效数据。');
  return translated;
}
