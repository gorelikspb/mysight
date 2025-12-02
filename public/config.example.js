// Пример конфигурационного файла
// Скопируйте этот файл в config.js и добавьте ваши API ключи

const CONFIG = {
    // Google Cloud Vision API ключ
    // Получить можно на https://cloud.google.com/vision
    // Бесплатный tier: 1000 запросов/месяц
    GOOGLE_VISION_API_KEY: 'ваш-api-ключ-здесь',
    
    // Hugging Face API токен (опционально)
    // Получите на https://huggingface.co/settings/tokens
    // Некоторые модели требуют токен для доступа через Inference API
    HF_TOKEN: ''
};

// Экспортируем токен для использования в autoKeywords.js
if (CONFIG.HF_TOKEN) {
    window.HF_TOKEN = CONFIG.HF_TOKEN;
}

