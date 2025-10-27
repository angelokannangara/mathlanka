// netlify/functions/chat.js
export async function handler(event) {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
  
    const APILAGE_AI_KEY = process.env.APILAGE_AI_KEY;
    const APILAGE_AI_URL = 'https://api.apilageai.lk/v1/chat/completions'; // <-- official endpoint
    const MODEL = 'APILAGEAI-PRO';
  
    if (!APILAGE_AI_KEY) {
      console.error("Missing Apilage AI key in environment variables");
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing API key' }) };
    }
  
    try {
      const { message } = JSON.parse(event.body);
  
      const response = await fetch(APILAGE_AI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${APILAGE_AI_KEY}`
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: message }]
        })
      });
  
      const data = await response.json();
  
      // Apilage AI usually returns { reply: "..." } or similar
      const botReply = data.reply || data.choices?.[0]?.message?.content || "Sorry, I didn’t get that.";
  
      return {
        statusCode: 200,
        body: JSON.stringify({ response: botReply })
      };
  
    } catch (error) {
      console.error("Apilage AI error:", error);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
  }
  