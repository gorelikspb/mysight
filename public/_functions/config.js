// Cloudflare Pages Function для получения конфигурации
// Эта функция использует Environment Variables из Cloudflare Pages

export async function onRequest(context) {
    // Получаем токен из Environment Variables (Secrets)
    // В Cloudflare Pages секреты доступны через context.env
    const hfToken = context.env.HF_TOKEN || context.env['HF_TOKEN'] || '';
    const googleVisionKey = context.env.GOOGLE_VISION_API_KEY || context.env['GOOGLE_VISION_API_KEY'] || '';
    
    // Для отладки: проверяем наличие токена
    // В production логи не будут видны пользователю
    
    // Экранируем токены для безопасной вставки в JavaScript
    const escapeJsString = (str) => {
        if (!str) return "''";
        return "'" + str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
    };
    
    // Генерируем config.js с токенами
    const configContent = `// Конфигурация для MySight
// Автоматически генерируется из Environment Variables Cloudflare Pages

const CONFIG = {
    // Google Cloud Vision API ключ
    GOOGLE_VISION_API_KEY: ${escapeJsString(googleVisionKey)},
    
    // Hugging Face API токен
    HF_TOKEN: ${escapeJsString(hfToken)}
};

// Экспортируем токен для использования в autoKeywords.js
if (CONFIG.HF_TOKEN) {
    window.HF_TOKEN = CONFIG.HF_TOKEN;
}

if (CONFIG.GOOGLE_VISION_API_KEY) {
    window.GOOGLE_VISION_API_KEY = CONFIG.GOOGLE_VISION_API_KEY;
}
`;
    
    // Возвращаем как JavaScript файл
    return new Response(configContent, {
        headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=3600' // Кэшируем на 1 час
        }
    });
}

