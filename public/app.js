// Хранилище фотографий с метаданными
let photos = [];

// Загружаем данные из localStorage при загрузке страницы
function loadPhotos() {
    const saved = localStorage.getItem('mysight_photos');
    if (saved) {
        photos = JSON.parse(saved);
    }
}

// Сохраняем данные в localStorage с проверкой размера
function savePhotos() {
    try {
        const dataString = JSON.stringify(photos);
        const dataSize = new Blob([dataString]).size;
        const maxSize = 4 * 1024 * 1024; // 4MB лимит для безопасности
        
        if (dataSize > maxSize) {
            throw new Error(`Данные слишком большие (${(dataSize / 1024 / 1024).toFixed(2)}MB). Удалите некоторые фотографии или используйте меньше файлов.`);
        }
        
        localStorage.setItem('mysight_photos', dataString);
    } catch (error) {
        if (error.name === 'QuotaExceededError' || error.message.includes('QuotaExceeded')) {
            throw new Error('Локальное хранилище переполнено. Удалите старые фотографии или используйте меньше файлов.');
        }
        throw error;
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadPhotos();
    setupEventListeners();
    renderPreview();
    
    // Проверяем протокол и показываем предупреждение о CORS
    if (window.location.protocol === 'file:') {
        showStatusMessage('⚠️ Файл открыт через file://. Для работы API запустите локальный сервер: python -m http.server 8000', 'warning');
    } else {
        showStatusMessage('✅ Приложение запущено через локальный сервер. API доступны.', 'success');
    }
});

// Показ статусных сообщений пользователю
function showStatusMessage(message, type = 'info') {
    const statusContainer = document.getElementById('statusMessages');
    if (!statusContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `status-${type}`;
    messageDiv.textContent = message;
    
    statusContainer.innerHTML = ''; // Очищаем предыдущие сообщения
    statusContainer.appendChild(messageDiv);
    
    // Автоматически скрываем через 10 секунд для info сообщений
    if (type === 'info') {
        setTimeout(() => {
            messageDiv.style.opacity = '0';
            messageDiv.style.transition = 'opacity 0.5s';
            setTimeout(() => messageDiv.remove(), 500);
        }, 10000);
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const modal = document.getElementById('keywordsModal');
    const closeModal = document.querySelector('.close');
    const saveKeywordsBtn = document.getElementById('saveKeywordsBtn');
    const cancelKeywordsBtn = document.getElementById('cancelKeywordsBtn');

    // Загрузка файлов
    fileInput.addEventListener('change', handleFileSelect);
    
    // Также добавляем обработчик на label для надежности
    const uploadLabel = document.querySelector('.upload-label');
    if (uploadLabel) {
        uploadLabel.addEventListener('click', (e) => {
            // Предотвращаем двойной клик, если label уже связан с input
            if (fileInput && e.target !== fileInput) {
                fileInput.click();
            }
        });
    }
    
    // Также добавляем обработчик на upload-area для клика в любом месте
    const uploadArea = document.getElementById('uploadArea');
    if (uploadArea) {
        uploadArea.addEventListener('click', (e) => {
            // Кликаем на input только если клик не на самом input или label
            if (e.target !== fileInput && !uploadLabel.contains(e.target)) {
                fileInput.click();
            }
        });
    }

    // Поиск
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        document.getElementById('resultsContainer').innerHTML = 
            '<p class="empty-state">Введите ключевые слова для поиска</p>';
    });

    // Модальное окно
    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    cancelKeywordsBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    saveKeywordsBtn.addEventListener('click', saveKeywords);

    // Закрытие модального окна при клике вне его
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Обработка выбора файлов с автоматическим определением ключевых слов
async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) return;
    
    const autoKeywords = document.getElementById('autoKeywordsCheckbox').checked;
    const apiType = document.getElementById('apiSelect').value;
    const totalFiles = imageFiles.length;
    let processedFiles = 0;
    
    // Показываем прогресс для массовой загрузки
    if (totalFiles > 1) {
        showUploadProgress(0, totalFiles);
    }
    
    // Получаем API ключ Google Vision если используется
    const googleApiKey = typeof CONFIG !== 'undefined' && CONFIG.GOOGLE_VISION_API_KEY 
        ? CONFIG.GOOGLE_VISION_API_KEY 
        : null;
    
    // Обрабатываем файлы последовательно
    const errors = [];
    for (const file of imageFiles) {
        try {
            const photoData = await processImageFile(file, autoKeywords, apiType, googleApiKey);
            photos.push(photoData);
            processedFiles++;
            
            // Обновляем прогресс
            if (totalFiles > 1) {
                showUploadProgress(processedFiles, totalFiles);
            }
            
            // Пытаемся сохранить, обрабатываем ошибки localStorage
            try {
                savePhotos();
            } catch (saveError) {
                // Если не удалось сохранить, удаляем последнюю добавленную фотографию
                photos.pop();
                throw new Error(`Не удалось сохранить фотографию. Возможно, localStorage переполнен. Попробуйте удалить старые фотографии или использовать меньше файлов.`);
            }
            
            renderPreview();
            
            // Для одиночных файлов открываем модальное окно (если не авто-ключевые слова)
            if (totalFiles === 1 && !autoKeywords) {
                openKeywordsModal(photoData.id);
            }
        } catch (error) {
            console.error('Error processing file:', file.name, error);
            errors.push({
                filename: file.name,
                error: error.message || 'Неизвестная ошибка'
            });
        }
    }
    
    // Показываем ошибки если есть
    if (errors.length > 0) {
        showUploadErrors(errors);
    }
    
    // Скрываем прогресс
    if (totalFiles > 1) {
        setTimeout(() => {
            document.getElementById('uploadProgress').style.display = 'none';
        }, 500);
    }
    
    // Очищаем input для возможности повторной загрузки тех же файлов
    e.target.value = '';
}

// Обработка одного файла изображения с проверкой размера и сжатием
async function processImageFile(file, autoKeywords, apiType, googleApiKey) {
    return new Promise((resolve, reject) => {
        // Проверяем размер файла (5MB лимит для безопасности)
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_FILE_SIZE) {
            reject(new Error(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(2)}MB). Максимальный размер: 5MB. Попробуйте сжать изображение.`));
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                let dataUrl = event.target.result;
                
                // Сжимаем изображение если оно слишком большое
                dataUrl = await compressImageIfNeeded(dataUrl, file.type);
                
                // Проверяем размер после сжатия (base64 увеличивает размер на ~33%)
                const base64Size = (dataUrl.length * 3) / 4;
                if (base64Size > 4 * 1024 * 1024) { // 4MB после base64
                    reject(new Error(`Изображение слишком большое даже после сжатия. Попробуйте уменьшить разрешение.`));
                    return;
                }
                
                let keywords = [];
                
                // Автоматическое определение ключевых слов
                if (autoKeywords && typeof window.autoDetectKeywords === 'function') {
                    try {
                        console.log('Starting auto keywords detection...', { apiType, autoKeywords });
                        const options = {
                            useEXIF: apiType === 'exif' || apiType === 'combined',
                            useGoogleVision: apiType === 'google' || apiType === 'combined',
                            useHuggingFace: apiType === 'huggingface' || apiType === 'combined',
                            googleVisionApiKey: googleApiKey
                        };
                        
                        keywords = await window.autoDetectKeywords(file, dataUrl, options);
                        console.log('Auto-detected keywords:', keywords);
                        
                        if (keywords.length === 0) {
                            if (apiType === 'huggingface') {
                                showStatusMessage('⚠️ Hugging Face API недоступен. Задеплойте проект на Cloudflare Pages для работы API. См. DEPLOY.md', 'warning');
                            } else {
                                showStatusMessage('⚠️ Ключевые слова не определены. Добавьте их вручную для лучшего поиска.', 'warning');
                            }
                        } else {
                            showStatusMessage(`✅ Определено ${keywords.length} ключевых слов: ${keywords.slice(0, 5).join(', ')}${keywords.length > 5 ? '...' : ''}`, 'success');
                        }
                    } catch (error) {
                        console.error('Auto keywords detection failed:', error);
                        showStatusMessage(`❌ Ошибка определения ключевых слов: ${error.message || 'Неизвестная ошибка'}`, 'warning');
                        // Продолжаем без ключевых слов, пользователь может добавить вручную
                    }
                }
                
                const photoData = {
                    id: Date.now() + Math.random(),
                    dataUrl: dataUrl,
                    filename: file.name,
                    keywords: keywords,
                    addedAt: new Date().toISOString(),
                    autoKeywords: autoKeywords,
                    originalSize: file.size,
                    compressedSize: base64Size
                };
                
                resolve(photoData);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.readAsDataURL(file);
    });
}

// Сжатие изображения если оно слишком большое
function compressImageIfNeeded(dataUrl, mimeType, maxWidth = 1920, maxHeight = 1920, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // Если изображение меньше максимальных размеров, возвращаем как есть
            if (img.width <= maxWidth && img.height <= maxHeight) {
                // Но все равно проверяем размер base64
                const currentSize = (dataUrl.length * 3) / 4;
                if (currentSize < 2 * 1024 * 1024) { // Меньше 2MB
                    resolve(dataUrl);
                    return;
                }
            }
            
            // Вычисляем новые размеры с сохранением пропорций
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth || height > maxHeight) {
                const ratio = Math.min(maxWidth / width, maxHeight / height);
                width = width * ratio;
                height = height * ratio;
            }
            
            // Создаем canvas для сжатия
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // Рисуем изображение на canvas
            ctx.drawImage(img, 0, 0, width, height);
            
            // Конвертируем в base64 с качеством
            const outputFormat = mimeType || 'image/jpeg';
            const compressedDataUrl = canvas.toDataURL(outputFormat, quality);
            
            resolve(compressedDataUrl);
        };
        img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
        img.src = dataUrl;
    });
}

// Показ прогресса загрузки
function showUploadProgress(processed, total) {
    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    progressDiv.style.display = 'block';
    const percentage = Math.round((processed / total) * 100);
    progressFill.style.width = percentage + '%';
    progressText.textContent = `Обработано ${processed} из ${total} фотографий (${percentage}%)`;
}

// Показ ошибок загрузки
function showUploadErrors(errors) {
    const errorMessages = errors.map(e => `• ${e.filename}: ${e.error}`).join('\n');
    alert(`Ошибки при загрузке:\n\n${errorMessages}\n\nПроверьте размер файлов (максимум 5MB) и доступное место в браузере.`);
}

// Открытие модального окна для добавления ключевых слов
let currentPhotoId = null;

function openKeywordsModal(photoId) {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    currentPhotoId = photoId;
    const modal = document.getElementById('keywordsModal');
    const modalImagePreview = document.getElementById('modalImagePreview');
    const keywordsInput = document.getElementById('keywordsInput');

    modalImagePreview.src = photo.dataUrl;
    keywordsInput.value = photo.keywords.join(', ');
    modal.style.display = 'block';
    keywordsInput.focus();
}

// Сохранение ключевых слов
function saveKeywords() {
    if (!currentPhotoId) return;

    const keywordsInput = document.getElementById('keywordsInput');
    const keywords = keywordsInput.value
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

    const photo = photos.find(p => p.id === currentPhotoId);
    if (photo) {
        photo.keywords = keywords;
        savePhotos();
        renderPreview();
    }

    document.getElementById('keywordsModal').style.display = 'none';
    currentPhotoId = null;
}

// Отображение превью загруженных фотографий
function renderPreview() {
    const container = document.getElementById('previewContainer');
    
    if (photos.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">Нет загруженных фотографий</p>';
        return;
    }

    container.innerHTML = photos.map(photo => `
        <div class="preview-item">
            <img src="${photo.dataUrl}" alt="${photo.filename}">
            <div class="preview-info">
                ${photo.autoKeywords ? '<span class="auto-badge">🤖 Авто</span>' : ''}
                <span class="keywords-count">${photo.keywords.length} ключевых слов</span>
            </div>
            ${photo.keywords.length > 0 ? `
                <div class="preview-keywords">
                    <div class="preview-keywords-label">Ключевые слова:</div>
                    <div class="preview-keywords-list">${photo.keywords.join(', ')}</div>
                </div>
            ` : ''}
            <button class="add-keywords-btn" onclick="openKeywordsModal(${photo.id})">
                ${photo.keywords.length > 0 ? '✏️ Редактировать' : '➕ Добавить'}
            </button>
        </div>
    `).join('');
}

// Поиск по ключевым словам
function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        document.getElementById('resultsContainer').innerHTML = 
            '<p class="empty-state">Введите ключевые слова для поиска</p>';
        return;
    }

    // Разбиваем запрос на отдельные слова
    const searchTerms = query.split(/\s+/).filter(term => term.length > 0);

    // Ищем фотографии, которые содержат хотя бы одно из ключевых слов
    const results = photos.filter(photo => {
        const photoKeywords = photo.keywords.join(' ').toLowerCase();
        return searchTerms.some(term => photoKeywords.includes(term));
    });

    displaySearchResults(results, searchTerms);
}

// Отображение результатов поиска
function displaySearchResults(results, searchTerms) {
    const container = document.getElementById('resultsContainer');

    if (results.length === 0) {
        container.innerHTML = '<p class="empty-state">Ничего не найдено. Попробуйте другие ключевые слова.</p>';
        return;
    }

    // Подсвечиваем найденные ключевые слова
    function highlightKeywords(keywords, terms) {
        return keywords.map(keyword => {
            const lowerKeyword = keyword.toLowerCase();
            const matched = terms.find(term => lowerKeyword.includes(term));
            if (matched) {
                return `<strong style="color: #667eea;">${keyword}</strong>`;
            }
            return keyword;
        }).join(', ');
    }

    container.innerHTML = results.map(photo => `
        <div class="result-item">
            <img src="${photo.dataUrl}" alt="${photo.filename}">
            <div class="keywords">
                <div class="keywords-label">Ключевые слова:</div>
                <div class="keywords-list">${highlightKeywords(photo.keywords, searchTerms)}</div>
            </div>
        </div>
    `).join('');
}

// Экспортируем функцию для использования в HTML
window.openKeywordsModal = openKeywordsModal;

