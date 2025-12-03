// Автоматическое определение ключевых слов для фотографий

// ============================================
// 1. EXIF данные
// ============================================

// Библиотека для парсинга EXIF (используем встроенный подход)
async function extractEXIFKeywords(file) {
    return new Promise((resolve) => {
        const keywords = [];
        
        // Используем EXIF.js если доступен, иначе базовый парсинг
        if (typeof EXIF !== 'undefined') {
            EXIF.getData(file, function() {
                // GPS координаты
                const lat = EXIF.getTag(this, 'GPSLatitude');
                const lon = EXIF.getTag(this, 'GPSLongitude');
                if (lat && lon) {
                    keywords.push('GPS');
                    // Можно добавить определение места через reverse geocoding
                }
                
                // Дата и время
                const dateTime = EXIF.getTag(this, 'DateTimeOriginal') || EXIF.getTag(this, 'DateTime');
                if (dateTime) {
                    const date = new Date(dateTime.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
                    const month = date.getMonth() + 1;
                    const hour = date.getHours();
                    
                    // Сезон
                    if (month >= 3 && month <= 5) keywords.push('весна');
                    else if (month >= 6 && month <= 8) keywords.push('лето');
                    else if (month >= 9 && month <= 11) keywords.push('осень');
                    else keywords.push('зима');
                    
                    // Время суток
                    if (hour >= 5 && hour < 8) keywords.push('рассвет');
                    else if (hour >= 8 && hour < 12) keywords.push('утро');
                    else if (hour >= 12 && hour < 17) keywords.push('день');
                    else if (hour >= 17 && hour < 20) keywords.push('закат');
                    else keywords.push('ночь');
                }
                
                // Камера
                const make = EXIF.getTag(this, 'Make');
                const model = EXIF.getTag(this, 'Model');
                if (make) keywords.push(make.toLowerCase());
                
                resolve(keywords);
            });
        } else {
            // Базовый парсинг без библиотеки
            resolve(keywords);
        }
    });
}

// ============================================
// 2. Hugging Face Inference API
// ============================================

async function getKeywordsFromHuggingFace(imageBase64) {
    try {
        console.log('Trying Hugging Face API...');
        
        // Проверяем, не блокируется ли запрос CORS
        // Если открыто через file://, API не будет работать
        if (window.location.protocol === 'file:') {
            console.warn('⚠️ Файл открыт через file:// протокол. Hugging Face API не работает из-за CORS.');
            // Сообщение пользователю показывается в app.js
            return await getKeywordsFromHuggingFaceAlternative(imageBase64);
        }
        
        // Проверяем наличие токена
        const hfToken = window.HF_TOKEN || null;
        if (!hfToken) {
            console.log('ℹ️ Hugging Face token not found. Some models may require authentication.');
            console.log('💡 Tip: Create config.js with HF_TOKEN for access to more models');
        }
        
        // Конвертируем base64 в правильный формат для Hugging Face API
        // Hugging Face ожидает base64 БЕЗ префикса data:image/...
        let base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        
        // Пробуем несколько моделей для image-classification
        // Эти модели обучены на ImageNet и возвращают понятные метки
        const models = [
            'google/vit-base-patch16-224',              // Vision Transformer от Google
            'microsoft/resnet-50',                     // ResNet от Microsoft
            'facebook/deit-base-distilled-patch16-224', // DeiT от Facebook
            'microsoft/beit-base-patch16-224',         // BEiT от Microsoft (может требовать токен)
        ];
        
        // URL Cloudflare Worker для проксирования запросов
        const workerUrl = 'https://mysight-hf-proxy.gorelikgo.workers.dev';
        
        // Проверяем, есть ли Worker URL в конфиге (можно переопределить)
        const proxyUrl = window.HF_WORKER_URL || workerUrl;
        const useProxy = true; // Всегда используем Worker для обхода CORS
        
        for (const model of models) {
            try {
                console.log(`Trying model: ${model}${useProxy ? ' (via Worker)' : ' (direct - may fail due to CORS)'}`);
                
                let response;
                
                if (useProxy) {
                    // Используем Cloudflare Worker для обхода CORS
                    response = await fetch(proxyUrl, {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        method: 'POST',
                        body: JSON.stringify({
                            model: model,
                            imageBase64: base64Data
                        }),
                    });
                } else {
                    // Прямой запрос (может не работать из-за CORS)
                    const headers = {
                        'Content-Type': 'application/json',
                    };
                    
                    if (hfToken) {
                        headers['Authorization'] = `Bearer ${hfToken}`;
                    }
                    
                    response = await fetch(
                        `https://api-inference.huggingface.co/models/${model}`,
                        {
                            headers: headers,
                            method: 'POST',
                            body: JSON.stringify({
                                inputs: base64Data
                            }),
                        }
                    );
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.warn(`Model ${model} error:`, response.status, errorText);
                    
                    // Если модель загружается, ждем и пробуем снова
                    if (response.status === 503) {
                        console.log('Model is loading, waiting 5 seconds...');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        // Пробуем еще раз эту же модель
                        continue;
                    }
                    
                    // Если 404 - модель недоступна, пробуем следующую
                    if (response.status === 404) {
                        console.log(`Model ${model} not found, trying next...`);
                        continue;
                    }
                    
                    // Если 401 - модель требует токен или подписку
                    if (response.status === 401) {
                        console.log(`Model ${model} requires authentication (token or subscription), trying next...`);
                        if (!hfToken) {
                            console.warn('💡 Tip: Add HF_TOKEN to config.js for access to more models');
                        }
                        continue;
                    }
                    
                    // Для других ошибок тоже пробуем следующую модель
                    continue;
                }

                const data = await response.json();
                console.log('Hugging Face response:', data);
                
                // Обрабатываем формат ответа от Hugging Face image-classification
                // Обычно это массив объектов: [{label: "...", score: 0.9}, ...]
                let labels = [];
                
                if (Array.isArray(data)) {
                    // Если это массив объектов с label и score
                    if (data[0] && typeof data[0] === 'object' && data[0].label) {
                        // Сортируем по score (уверенность модели) и берем топ-10
                        labels = data
                            .sort((a, b) => (b.score || 0) - (a.score || 0))
                            .slice(0, 10);
                    } else if (Array.isArray(data[0])) {
                        // Если вложенный массив
                        labels = data[0].slice(0, 10);
                    } else {
                        // Если просто массив строк
                        labels = data.slice(0, 10);
                    }
                } else if (data && typeof data === 'object') {
                    // Если один объект
                    if (data.label) {
                        labels = [data];
                    } else if (data[0]) {
                        // Если объект с массивом внутри
                        labels = Array.isArray(data[0]) ? data[0] : [data];
                    }
                }
                
                if (labels.length > 0) {
                    const keywords = labels
                        .map(item => {
                            // Извлекаем label из объекта или берем строку
                            const label = (item.label || item).toLowerCase();
                            return normalizeImageNetLabel(label);
                        })
                        .filter(label => label && label.length > 0)
                        .slice(0, 8); // Ограничиваем до 8 ключевых слов
                    
                    console.log('✅ Hugging Face keywords extracted:', keywords);
                    return keywords;
                } else {
                    console.warn('⚠️ No labels found in Hugging Face response');
                }
            } catch (modelError) {
                // Проверяем тип ошибки
                const errorMsg = modelError.message || String(modelError);
                
                // CORS ошибка (обычно на localhost или file://)
                if (errorMsg.includes('CORS') || errorMsg.includes('Failed to fetch') || errorMsg.includes('ERR_FAILED')) {
                    // Если это не localhost/file://, то это может быть проблема с API
                    if (window.location.protocol !== 'file:' && !window.location.hostname.includes('localhost')) {
                        console.warn(`⚠️ Hugging Face API недоступен для модели ${model}. Пробуем следующую...`);
                        continue; // Пробуем следующую модель
                    } else {
                        console.error('❌ CORS ошибка! Hugging Face API блокируется браузером.');
                        console.error('💡 Решение: Задеплойте проект на Cloudflare Pages/GitHub Pages.');
                        break; // Прерываем цикл только для file://
                    }
                }
                
                console.warn(`Error with model ${model}:`, modelError);
                continue; // Пробуем следующую модель
            }
        }
        
        // Если все модели не сработали, пробуем альтернативный метод
        console.log('All models failed, trying alternative...');
        return await getKeywordsFromHuggingFaceAlternative(imageBase64);
        
    } catch (error) {
        console.error('Hugging Face API error:', error);
        if (error.message && (error.message.includes('CORS') || error.message.includes('Failed to fetch'))) {
            console.error('❌ CORS ошибка! Hugging Face API не работает с localhost.');
            console.error('💡 Решение: Задеплойте проект на Cloudflare Pages. См. DEPLOY.md');
            // Не возвращаем fallback - пусть пользователь знает, что нужно задеплоить
            return [];
        }
        // Для других ошибок пробуем fallback
        return await getKeywordsFromHuggingFaceAlternative(imageBase64);
    }
}

// Альтернативный метод - используется только при других ошибках (не CORS)
async function getKeywordsFromHuggingFaceAlternative(imageBase64) {
    try {
        console.log('Trying alternative method - basic image analysis...');
        console.warn('⚠️ Используется базовый анализ изображения. Для лучших результатов задеплойте проект на сервер.');
        
        // Пробуем извлечь базовые ключевые слова через анализ изображения
        return await extractBasicKeywordsFromImage(imageBase64);
    } catch (error) {
        console.warn('Alternative Hugging Face method failed:', error);
        return [];
    }
}

// Улучшенный анализ изображения для извлечения более релевантных ключевых слов
async function extractBasicKeywordsFromImage(imageBase64) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const keywords = [];
            
            // Анализ размеров и ориентации
            const aspectRatio = img.width / img.height;
            if (aspectRatio > 1.5) {
                keywords.push('пейзаж', 'горизонтальное', 'широкое');
            } else if (aspectRatio < 0.7) {
                keywords.push('портрет', 'вертикальное', 'высокое');
            } else if (Math.abs(aspectRatio - 1) < 0.1) {
                keywords.push('квадратное');
            }
            
            // Анализ разрешения (может указывать на тип фото)
            const megapixels = (img.width * img.height) / 1000000;
            if (megapixels > 8) {
                keywords.push('высокое разрешение');
            }
            
            // Анализ цветов и яркости через canvas
            try {
                const canvas = document.createElement('canvas');
                // Используем больше пикселей для лучшего анализа
                const sampleSize = Math.min(Math.max(img.width, img.height), 200);
                canvas.width = Math.floor((img.width / img.height) * sampleSize);
                canvas.height = sampleSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                
                // Анализ яркости и контраста
                let totalBrightness = 0;
                let brightnessVariance = 0;
                let pixelCount = 0;
                const brightnessValues = [];
                
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const brightness = (r * 0.299 + g * 0.587 + b * 0.114); // Взвешенная яркость
                    brightnessValues.push(brightness);
                    totalBrightness += brightness;
                    pixelCount++;
                }
                
                const avgBrightness = totalBrightness / pixelCount;
                
                // Вычисляем контраст (стандартное отклонение яркости)
                brightnessVariance = brightnessValues.reduce((sum, val) => {
                    return sum + Math.pow(val - avgBrightness, 2);
                }, 0) / pixelCount;
                const contrast = Math.sqrt(brightnessVariance);
                
                // Определяем время суток и освещение
                if (avgBrightness < 40) {
                    keywords.push('темное', 'ночь', 'темное время');
                } else if (avgBrightness < 80) {
                    keywords.push('сумерки', 'вечер', 'рассвет');
                } else if (avgBrightness < 150) {
                    keywords.push('дневное', 'светлое');
                } else if (avgBrightness < 200) {
                    keywords.push('яркое', 'солнечное');
                } else {
                    keywords.push('очень яркое', 'переэкспонированное');
                }
                
                // Контраст
                if (contrast > 60) {
                    keywords.push('контрастное', 'выразительное');
                } else if (contrast < 20) {
                    keywords.push('мягкое', 'пастельное');
                }
                
                // Анализ преобладающих цветов (улучшенный алгоритм)
                const colorBuckets = {
                    'красный': 0, 'оранжевый': 0, 'желтый': 0,
                    'зеленый': 0, 'голубой': 0, 'синий': 0,
                    'фиолетовый': 0, 'розовый': 0,
                    'белый': 0, 'серый': 0, 'черный': 0,
                    'коричневый': 0, 'бежевый': 0
                };
                
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    
                    // Определяем цвет по HSV
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const delta = max - min;
                    const v = max / 255;
                    const s = max === 0 ? 0 : delta / max;
                    const h = max === min ? 0 :
                        max === r ? ((g - b) / delta + (g < b ? 6 : 0)) / 6 :
                        max === g ? ((b - r) / delta + 2) / 6 :
                        ((r - g) / delta + 4) / 6;
                    
                    // Классифицируем цвет
                    if (v < 0.2) {
                        colorBuckets['черный']++;
                    } else if (s < 0.1 && v > 0.9) {
                        colorBuckets['белый']++;
                    } else if (s < 0.2) {
                        if (v > 0.7) colorBuckets['белый']++;
                        else if (v > 0.4) colorBuckets['серый']++;
                        else colorBuckets['черный']++;
                    } else {
                        const hue = h * 360;
                        if (hue < 15 || hue >= 345) colorBuckets['красный']++;
                        else if (hue < 45) colorBuckets['оранжевый']++;
                        else if (hue < 75) colorBuckets['желтый']++;
                        else if (hue < 150) colorBuckets['зеленый']++;
                        else if (hue < 210) colorBuckets['голубой']++;
                        else if (hue < 270) colorBuckets['синий']++;
                        else if (hue < 300) colorBuckets['фиолетовый']++;
                        else colorBuckets['розовый']++;
                    }
                }
                
                // Добавляем топ-3 наиболее частых цвета
                const sortedColors = Object.entries(colorBuckets)
                    .filter(([_, count]) => count > 0)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([color]) => color);
                keywords.push(...sortedColors);
                
                // Определяем сезонность по цветам (если много зеленого/желтого/коричневого)
                const greenYellow = colorBuckets['зеленый'] + colorBuckets['желтый'];
                const brown = colorBuckets['коричневый'];
                if (greenYellow > pixelCount * 0.3) {
                    keywords.push('природа', 'растительность');
                }
                if (brown > pixelCount * 0.2) {
                    keywords.push('осень', 'земля');
                }
                
            } catch (error) {
                console.warn('Color analysis failed:', error);
            }
            
            // Убираем дубликаты и ограничиваем количество
            const uniqueKeywords = [...new Set(keywords)].slice(0, 10);
            console.log('Basic keywords extracted:', uniqueKeywords);
            resolve(uniqueKeywords);
        };
        img.onerror = () => resolve([]);
        img.src = imageBase64;
    });
}

// Нормализация меток ImageNet в более понятные ключевые слова
function normalizeImageNetLabel(label) {
    // Убираем префиксы типа "n02119789" (ID классов ImageNet)
    label = label.replace(/^n\d+_/, '');
    
    // Заменяем подчеркивания на пробелы
    label = label.replace(/_/g, ' ');
    
    // Переводим некоторые распространенные классы
    const translations = {
        'bicycle': 'велосипед',
        'car': 'автомобиль',
        'dog': 'собака',
        'cat': 'кот',
        'person': 'человек',
        'building': 'здание',
        'tree': 'дерево',
        'flower': 'цветок',
        'bird': 'птица',
        'water': 'вода',
        'sky': 'небо',
        'mountain': 'гора',
        'beach': 'пляж',
        'food': 'еда',
        'indoor': 'интерьер',
        'outdoor': 'улица'
    };
    
    const lowerLabel = label.toLowerCase();
    if (translations[lowerLabel]) {
        return translations[lowerLabel];
    }
    
    return label;
}

// Альтернатива: использование CLIP модели для описания изображений
async function getDescriptionFromCLIP(imageBase64) {
    try {
        const response = await fetch(
            'https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32',
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                method: 'POST',
                body: JSON.stringify({
                    inputs: {
                        image: imageBase64.split(',')[1]
                    }
                }),
            }
        );

        if (!response.ok) {
            throw new Error('CLIP API error');
        }

        const data = await response.json();
        // Обработка ответа CLIP
        return [];
    } catch (error) {
        console.warn('CLIP API error:', error);
        return [];
    }
}

// ============================================
// 3. Google Cloud Vision API
// ============================================

async function getKeywordsFromGoogleVision(imageBase64, apiKey) {
    if (!apiKey) {
        console.warn('Google Vision API key not provided');
        return [];
    }

    try {
        const response = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    requests: [
                        {
                            image: {
                                content: imageBase64.split(',')[1]
                            },
                            features: [
                                { type: 'LABEL_DETECTION', maxResults: 10 },
                                { type: 'LANDMARK_DETECTION', maxResults: 5 },
                                { type: 'TEXT_DETECTION' },
                                { type: 'OBJECT_LOCALIZATION', maxResults: 10 }
                            ]
                        }
                    ]
                })
            }
        );

        if (!response.ok) {
            throw new Error('Google Vision API error');
        }

        const data = await response.json();
        const keywords = [];

        if (data.responses && data.responses[0]) {
            const result = data.responses[0];

            // Метки (labels)
            if (result.labelAnnotations) {
                result.labelAnnotations.forEach(label => {
                    if (label.score > 0.7) { // Только уверенные результаты
                        keywords.push(label.description.toLowerCase());
                    }
                });
            }

            // Достопримечательности
            if (result.landmarkAnnotations) {
                result.landmarkAnnotations.forEach(landmark => {
                    keywords.push(landmark.description.toLowerCase());
                });
            }

            // Объекты
            if (result.localizedObjectAnnotations) {
                result.localizedObjectAnnotations.forEach(obj => {
                    keywords.push(obj.name.toLowerCase());
                });
            }

            // Текст
            if (result.textAnnotations && result.textAnnotations.length > 0) {
                const text = result.textAnnotations[0].description;
                // Извлекаем отдельные слова из текста
                const words = text.split(/\s+/).filter(w => w.length > 3);
                keywords.push(...words.slice(0, 5).map(w => w.toLowerCase()));
            }
        }

        return [...new Set(keywords)]; // Убираем дубликаты
    } catch (error) {
        console.warn('Google Vision API error:', error);
        return [];
    }
}

// ============================================
// 4. Комбинированный подход (Основная функция)
// ============================================

/**
 * Автоматически определяет ключевые слова для изображения
 * @param {File} file - Файл изображения
 * @param {string} imageBase64 - Base64 представление изображения
 * @param {Object} options - Опции
 * @returns {Promise<string[]>} Массив ключевых слов
 */
async function autoDetectKeywords(file, imageBase64, options = {}) {
    const {
        useEXIF = true,
        useGoogleVision = false,
        useHuggingFace = true,
        googleVisionApiKey = null
    } = options;

    console.log('autoDetectKeywords called with options:', options);
    const allKeywords = [];

    // 1. EXIF данные
    if (useEXIF) {
        try {
            console.log('Extracting EXIF data...');
            const exifKeywords = await extractEXIFKeywords(file);
            console.log('EXIF keywords:', exifKeywords);
            allKeywords.push(...exifKeywords);
        } catch (error) {
            console.warn('EXIF extraction error:', error);
        }
    }

    // 2. Google Vision API (если доступен ключ)
    if (useGoogleVision && googleVisionApiKey) {
        try {
            console.log('Using Google Vision API...');
            const visionKeywords = await getKeywordsFromGoogleVision(imageBase64, googleVisionApiKey);
            console.log('Google Vision keywords:', visionKeywords);
            allKeywords.push(...visionKeywords);
        } catch (error) {
            console.warn('Google Vision error:', error);
        }
    }

    // 3. Hugging Face API (fallback или основной метод)
    if (useHuggingFace && (!useGoogleVision || !googleVisionApiKey)) {
        try {
            console.log('Using Hugging Face API...');
            const hfKeywords = await getKeywordsFromHuggingFace(imageBase64);
            console.log('Hugging Face keywords:', hfKeywords);
            allKeywords.push(...hfKeywords);
        } catch (error) {
            console.error('Hugging Face error:', error);
        }
    }

    // Убираем дубликаты и пустые значения
    const uniqueKeywords = [...new Set(allKeywords)]
        .filter(k => k && k.length > 0)
        .slice(0, 15); // Ограничиваем количество

    console.log('Final keywords:', uniqueKeywords);
    return uniqueKeywords;
}

// Экспортируем функции
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        autoDetectKeywords,
        extractEXIFKeywords,
        getKeywordsFromGoogleVision,
        getKeywordsFromHuggingFace
    };
}

// Для использования в браузере
window.autoDetectKeywords = autoDetectKeywords;

