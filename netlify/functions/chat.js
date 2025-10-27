// netlify/functions/chat.js
// ------------------------------------------------------------------
// CRITICAL: This line defines the function entry point Netlify looks for
// ------------------------------------------------------------------
exports.handler = async (event) => {
    // Basic security check: Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // --- SECURE CONFIGURATION ---
    const APILAGE_AI_API_KEY = process.env.APALAGE_AI_KEY;
    const APILAGE_AI_URL = 'https://endpoint.apilageai.lk/api/chat';
    const MODEL = 'APILAGEAI-PRO'; 
    
    // Test log added in the previous step (optional, but helpful)
    console.log('Function started. Key status:', APILAGE_AI_API_KEY ? 'Present' : 'Missing'); 
    
    try {
        // ... (The rest of your code to parse event.body and call fetch)
        const { message } = JSON.parse(event.body);

        // ... (The fetch call and response handling)
        const response = await fetch(APILAGE_AI_URL, {
            method: 'POST',
            // ...
        });

        // ... (response processing)
        
    } catch (error) {
        // ... (error handling)
    }
};