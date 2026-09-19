import { Signer } from '@volcengine/openapi';
let credentials;
export function configureVolcano(accessKeyId, secretKey) { credentials = { accessKeyId, secretKey }; }
export function volcanoConfigured() { return Boolean(credentials); }
export async function volcanoTranslate(text) {
  if (!credentials) throw new Error('请在设置中填写火山 Access Key ID 和 Secret Access Key。');
  const request = {
    region: 'cn-north-1', method: 'POST', pathname: '/',
    params: { Action: 'TranslateText', Version: '2020-06-01' },
    headers: { 'Content-Type': 'application/json', Host: 'translate.volcengineapi.com' },
    body: JSON.stringify({ SourceLanguage: 'en', TargetLanguage: 'zh', TextList: [text] }),
  };
  new Signer(request, 'translate').addAuthorization(credentials);
  const response = await fetch('https://translate.volcengineapi.com/?' + new URLSearchParams(request.params), {
    method: 'POST', headers: request.headers, body: request.body, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`火山翻译返回 ${response.status}；请检查服务开通、密钥及权限。`);
  const body = await response.json();
  if (body.ResponseMetadata?.Error || body.ResponseMetaData?.Error) throw new Error('火山翻译拒绝了请求；请检查密钥、机器翻译权限与额度。');
  const result = body.TranslationList?.[0]?.Translation;
  if (typeof result !== 'string') throw new Error('火山翻译返回了无效数据。');
  return result;
}
