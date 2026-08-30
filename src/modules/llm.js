// llm.js —— OpenAI 兼容接口客户端
async function chat({ apiKey, model, baseUrl, messages }) {
  const url = (baseUrl || 'https://ark.cn-beijing.volces.com/api/v3') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ model, messages, temperature: 0.8 }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error('HTTP ' + res.status + ' ' + t); }
  const j = await res.json();
  return j.choices[0].message.content;
}

async function see({ apiKey, model, baseUrl, imageBase64, prompt }) {
  const url = (baseUrl || 'https://ark.cn-beijing.volces.com/api/v3') + '/chat/completions';
  const messages = [{ role: 'user', content: [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + imageBase64 } },
  ] }];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error('HTTP ' + res.status); }
  const j = await res.json();
  return j.choices[0].message.content;
}

module.exports = { chat, see };
