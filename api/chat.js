export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { messages, system, max_tokens } = req.body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: max_tokens || 1000,
        system: system || '',
        messages: messages
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Anthropic error', details: data });
    }
    const reply = (data?.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    if (!reply) return res.status(500).json({ error: 'Empty reply from model' });
    return res.status(200).json({ reply, content: data.content });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
