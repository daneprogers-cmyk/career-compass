// ── RATE LIMITER ─────────────────────────────────────
// 50 requests per hour per IP — covers ~3 full sessions comfortably
const rateLimitMap = new Map();

const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip) {
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }

  const record = rateLimitMap.get(ip);

  if (now - record.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX) return true;

  record.count++;
  return false;
}

// ── INPUT VALIDATION ──────────────────────────────────
const MAX_INPUT_CHARS = 2000;
const MAX_MESSAGES    = 40;
const MAX_TOKENS_CAP  = 2500;

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'Invalid messages format';
  }
  if (messages.length > MAX_MESSAGES) {
    return 'Conversation history too long';
  }
  for (const msg of messages) {
    if (!msg.role || !msg.content) return 'Malformed message object';
    if (!['user', 'assistant'].includes(msg.role)) return 'Invalid message role';
    if (typeof msg.content !== 'string') return 'Message content must be a string';
    if (msg.content.length > MAX_INPUT_CHARS) return 'Message exceeds maximum length';
  }
  return null;
}

// ── HANDLER ───────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: 'rate_limit_reached',
      message: "You've reached the request limit for this hour. Come back in a bit and we'll pick up where you left off."
    });
  }

  try {
    const { messages, system, max_tokens } = req.body;

    const validationError = validateMessages(messages);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (system !== undefined && typeof system !== 'string') {
      return res.status(400).json({ error: 'Invalid system prompt' });
    }

    const safeMaxTokens = Math.min(max_tokens || 1000, MAX_TOKENS_CAP);

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
        messages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorType = data?.error?.type || 'api_error';
      const status = response.status;

      if (status === 429 || errorType === 'rate_limit_error') {
        return res.status(429).json({
          error: 'rate_limit_reached',
          message: "Cleo's hit a usage limit — this resets shortly. Try again in a few minutes."
        });
      }

      return res.status(status).json({ error: 'api_error', type: errorType });
    }

    const reply = (data?.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!reply) return res.status(500).json({ error: 'Empty reply from model' });

    return res.status(200).json({ reply, content: data.content });

  } catch (err) {
    return res.status(500).json({ error: 'server_error' });
  }
}
