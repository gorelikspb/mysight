// Cloudflare Pages Function для проксирования запросов к Hugging Face API
// Это обходит CORS ограничения, делая запросы на сервере

export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        
        // Получаем токен из Environment Variables
        const hfToken = env.HF_TOKEN || '';
        
        if (!hfToken) {
            return new Response(
                JSON.stringify({ error: 'HF_TOKEN not configured' }),
                { 
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
        
        // Получаем данные из запроса
        const body = await request.json();
        const { model, imageBase64 } = body;
        
        if (!model || !imageBase64) {
            return new Response(
                JSON.stringify({ error: 'Missing model or imageBase64' }),
                { 
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
        
        // Делаем запрос к Hugging Face API на сервере
        const hfResponse = await fetch(
            `https://api-inference.huggingface.co/models/${model}`,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${hfToken}`
                },
                method: 'POST',
                body: JSON.stringify({
                    inputs: imageBase64
                })
            }
        );
        
        if (!hfResponse.ok) {
            const errorText = await hfResponse.text();
            return new Response(
                JSON.stringify({ 
                    error: 'Hugging Face API error',
                    status: hfResponse.status,
                    details: errorText
                }),
                { 
                    status: hfResponse.status,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
        
        const data = await hfResponse.json();
        
        // Возвращаем результат клиенту с CORS заголовками
        return new Response(
            JSON.stringify(data),
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            }
        );
        
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { 
                status: 500,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            }
        );
    }
}

// Обработка OPTIONS запроса для CORS preflight
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
        }
    });
}

