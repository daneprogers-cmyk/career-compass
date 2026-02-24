export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        messages: req.body.messages
      })
    });

    const data = await response.json();
  const reply = (data?.content || [])
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("\n")
  .trim();


    // 🔥 SHOW REAL ERROR
    if (!response.ok) {
      return res.status(response.status).json({
        error: "Anthropic error",
        details: data
      });
    }

if (!reply) return res.status(500).json({ error: "Empty reply from model" });
 return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
