// Simple in-memory rate limiter
// Limits each IP to 20 requests per hour
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxRequests = 20; // max requests per hour per user

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }

  const record = rateLimitMap.get(ip);

  // Reset window if an hour has passed
  if (now - record.start > windowMs) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }

  // Over the limit
  if (record.count >= maxRequests) {
    return true;
  }

  // Increment count
  record.count++;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get IP address
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
             req.headers['x-real-ip'] || 
             'unknown';

  // Check rate limit
  if (isRateLimited(ip)) {
    return res.status(429).json({ 
      error: 'Too many requests. Please wait an hour before trying again.' 
    });
  }

  try {
    const { messages, system, max_tokens } = req.body;

    // Validate inputs
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    // Cap max_tokens so no single request can be too expensive
    const safeMaxTokens = Math.min(max_tokens || 1000, 4096);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: safeMaxTokens,
        system: system || '',
        messages: messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: 'Anthropic error', 
        details: data 
      });
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
