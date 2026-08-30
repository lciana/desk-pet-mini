// proactive.js —— 概率性主动发起话题
function start({ intervalMs, prob, getPersona, getMemory, chat, onSay }) {
  setInterval(async () => {
    if (Math.random() > prob) return;
    const persona = getPersona();
    const mem = getMemory ? getMemory() : '';
    const sys = { role: 'system', content:
`你是「${persona.name}」，正在陪用户。完整人设：${persona.traits}\n${mem ? '\n你记得的这些事（可自然提及）：\n' + mem : ''}\n\n现在你想主动找 ta 说点什么——风格：行动多于言语、务实温和，可以关心对方状态、报备自己刚在忙、或开启一个轻松话题。\n- 口语化，不超过 40 字。\n- 不要油腻撒娇，像真实伴侣自然开口。` };
    try {
      const text = await chat([sys, { role: 'user', content: '（你主动开口）' }]);
      if (text) onSay(text);
    } catch (e) { /* 静默失败 */ }
  }, intervalMs);
}

module.exports = { start };
