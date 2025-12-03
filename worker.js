// Cloudflare Worker для проксирования запросов к Hugging Face API
// Разверните этот Worker в Cloudflare Dashboard

export default {
    async fetch(request, env) {
        // Обрабатываем CORS preflight запросы
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Max-Age': '86400'
                }
            });
        }
        
        // Только POST запросы
        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }
        
        try {
            // Получаем токен из Environment Variables
            const hfToken = env.HF_TOKEN;
            
            if (!hfToken) {
                return new Response(
                    JSON.stringify({ error: 'HF_TOKEN not configured' }),
                    { 
                        status: 500,
                        headers: { 
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
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
                        headers: { 
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    }
                );
            }
            
            // Делаем запрос к Hugging Face API
            // Пробуем несколько вариантов endpoint
            const endpoints = [
                `https://api-inference.huggingface.co/models/${model}`,
                `https://router.huggingface.co/hf-inference/${model}`,
                `https://router.huggingface.co/models/${model}`
            ];
            
            let hfResponse = null;
            let lastError = null;
            
            for (const endpoint of endpoints) {
                try {
                    hfResponse = await fetch(endpoint, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${hfToken}`
                        },
                        method: 'POST',
                        body: JSON.stringify({
                            inputs: imageBase64
                        })
                    });
                    
                    // Если получили ответ (не 404), используем этот endpoint
                    if (hfResponse.status !== 404) {
                        break;
                    }
                    
                    lastError = await hfResponse.text();
                } catch (err) {
                    lastError = err.message;
                    continue;
                }
            }
            
            // Если все endpoint вернули 404
            if (!hfResponse || hfResponse.status === 404) {
                return new Response(
                    JSON.stringify({ 
                        error: 'Hugging Face API error',
                        status: 404,
                        details: lastError || 'All endpoints returned 404',
                        triedEndpoints: endpoints
                    }),
                    { 
                        status: 404,
                        headers: { 
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    }
                );
            }
            
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
                        headers: { 
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    }
                );
            }
            
            const data = await hfResponse.json();
            
            // Возвращаем результат с CORS заголовками
            return new Response(
                JSON.stringify(data),
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
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
};

