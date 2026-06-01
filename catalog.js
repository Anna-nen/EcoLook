// ========== ПЕРЕМЕННЫЕ ==========
const modal = document.getElementById('authModal');
const productModal = document.getElementById('productModal');
const authBtn = document.getElementById('authBtn');
const cabinetBtn = document.getElementById('cabinetBtn');
const cartLink = document.getElementById('cartLink');
const cartCountSpan = document.getElementById('cartCount');
const closeBtns = document.querySelectorAll('.close');

let currentProducts = [];
let currentCategory = 'all';
let currentSort = 'popular';
let searchQuery = '';
let selectedColor = null;
let selectedSize = null;

// ========== АВТОРИЗАЦИЯ ==========
async function checkAuth() {
    try {
        const response = await fetch('/get_user_info');
        if (response.ok) {
            const data = await response.json();
            authBtn.style.display = 'none';
            cabinetBtn.style.display = 'inline-block';
            if (cartLink) cartLink.style.display = 'inline-flex';
            loadCartCount();
            return true;
        }
    } catch (e) {
        console.log('Не авторизован');
    }
    return false;
}

async function loadCartCount() {
    try {
        const response = await fetch('/api/cart/count');
        const data = await response.json();
        if (cartCountSpan) {
            cartCountSpan.textContent = data.count > 0 ? `(${data.count})` : '';
        }
    } catch (e) {}
}

checkAuth();

authBtn.onclick = () => modal.style.display = 'block';

closeBtns.forEach(btn => {
    btn.onclick = function() {
        modal.style.display = 'none';
        productModal.style.display = 'none';
    }
});

window.onclick = (e) => {
    if (e.target == modal) modal.style.display = 'none';
    if (e.target == productModal) productModal.style.display = 'none';
}

// Вкладки авторизации
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab + 'Form').classList.add('active');
        document.getElementById('loginMessage').textContent = '';
        document.getElementById('registerMessage').textContent = '';
    };
});

// Логин
document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    const response = await fetch('/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    
    const result = await response.json();
    if (result.success) {
        location.reload();
    } else {
        document.getElementById('loginMessage').textContent = result.message;
    }
};

// Регистрация
document.getElementById('registerForm').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    if (data.password !== data.confirm_password) {
        document.getElementById('registerMessage').textContent = 'Пароли не совпадают';
        return;
    }
    
    if (data.password.length < 6) {
        document.getElementById('registerMessage').textContent = 'Пароль должен быть не менее 6 символов';
        return;
    }
    
    const response = await fetch('/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            username: data.username,
            email: data.email,
            password: data.password
        })
    });
    
    const result = await response.json();
    if (result.success) {
        location.reload();
    } else {
        document.getElementById('registerMessage').textContent = result.message;
    }
};

// ========== КАТАЛОГ ==========
async function loadProducts() {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '<div class="loading">Загрузка товаров...</div>';
    
    try {
        const params = new URLSearchParams({
            category: currentCategory,
            sort: currentSort,
            search: searchQuery
        });
        
        const response = await fetch(`/api/products?${params}`);
        const data = await response.json();
        
        currentProducts = data.products;
        renderProducts(data.products);
        document.querySelector('#productsCount span').textContent = data.products.length;
        
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        grid.innerHTML = '<div class="error">Ошибка загрузки товаров</div>';
    }
}

function renderProducts(products) {
    const grid = document.getElementById('productsGrid');
    
    if (products.length === 0) {
        grid.innerHTML = `
            <div class="no-products">
                <div class="no-products-icon">🔍</div>
                <h3>Товары не найдены</h3>
                <p>Попробуйте изменить параметры поиска</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = products.map(product => `
        <div class="product-card-full" onclick="showProductModal('${product.id}')">
            ${product.old_price ? `<span class="product-badge sale">-${Math.round((1 - product.price / product.old_price) * 100)}%</span>` : ''}
            ${product.new ? '<span class="product-badge new">NEW</span>' : ''}
            <div class="product-image-full">
                <img src="${product.image}" alt="${product.name}" onerror="this.src='/static/images/products/placeholder.jpg'">
            </div>
            <div class="product-info">
                <h3>${product.name}</h3>
                <p class="product-description">${product.description}</p>
                <div class="product-price">
                    <span class="current-price">${formatPrice(product.price)}</span>
                    ${product.old_price ? `<span class="old-price">${formatPrice(product.old_price)}</span>` : ''}
                </div>
                <div class="product-sizes">
                    Размеры: ${product.sizes.join(' • ')}
                </div>
                <button class="btn-add-cart" onclick="event.stopPropagation(); addToCart('${product.id}')">
                    🛒 В корзину
                </button>
            </div>
        </div>
    `).join('');
}

function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
}

// Фильтры
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.category;
        loadProducts();
    };
});

// Сортировка
document.getElementById('sortSelect').onchange = (e) => {
    currentSort = e.target.value;
    loadProducts();
};

// Поиск
let searchTimeout;
document.getElementById('searchInput').oninput = (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchQuery = e.target.value;
        loadProducts();
    }, 500);
};

// ========== КОРЗИНА ==========
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

async function addToCart(productId) {
    const isAuth = await checkAuth();
    if (!isAuth) {
        modal.style.display = 'block';
        alert('Для добавления в корзину необходимо войти');
        return;
    }
    
    const product = currentProducts.find(p => p.id === productId);
    if (!product) return;
    
    const firstColor = product.colors[0];
    
    try {
        const response = await fetch('/api/cart/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                product_id: product.id,
                name: `${product.name} (${firstColor})`,
                image: product.images[firstColor],
                price: product.price,
                quantity: 1,
                size: product.sizes[0]
            })
        });
        
        const data = await response.json();
        if (data.success) {
            showNotification(`✅ ${product.name} добавлен в корзину!`);
            loadCartCount();
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при добавлении в корзину');
    }
}

// ========== КАРУСЕЛЬ ==========
function createCarousel(images, colors, onColorChange) {
    const container = document.createElement('div');
    container.className = 'carousel-container';
    
    const slidesDiv = document.createElement('div');
    slidesDiv.className = 'carousel-slides';
    
    colors.forEach((color, index) => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide';
        slide.innerHTML = `<img src="${images[color]}" alt="${color}" onerror="this.src='/static/images/products/placeholder.jpg'">`;
        slidesDiv.appendChild(slide);
    });
    
    container.appendChild(slidesDiv);
    
    if (colors.length > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'carousel-btn prev';
        prevBtn.innerHTML = '❮';
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            const currentIndex = parseInt(slidesDiv.dataset.index || 0);
            const newIndex = currentIndex > 0 ? currentIndex - 1 : colors.length - 1;
            updateSlide(slidesDiv, dots, newIndex);
            if (onColorChange) onColorChange(colors[newIndex]);
        };
        
        const nextBtn = document.createElement('button');
        nextBtn.className = 'carousel-btn next';
        nextBtn.innerHTML = '❯';
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            const currentIndex = parseInt(slidesDiv.dataset.index || 0);
            const newIndex = currentIndex < colors.length - 1 ? currentIndex + 1 : 0;
            updateSlide(slidesDiv, dots, newIndex);
            if (onColorChange) onColorChange(colors[newIndex]);
        };
        
        container.appendChild(prevBtn);
        container.appendChild(nextBtn);
        
        const dotsDiv = document.createElement('div');
        dotsDiv.className = 'carousel-dots';
        
        colors.forEach((_, index) => {
            const dot = document.createElement('button');
            dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
            dot.onclick = (e) => {
                e.stopPropagation();
                updateSlide(slidesDiv, dots, index);
                if (onColorChange) onColorChange(colors[index]);
            };
            dotsDiv.appendChild(dot);
        });
        
        container.appendChild(dotsDiv);
        var dots = dotsDiv.children;
    }
    
    slidesDiv.dataset.index = 0;
    
    return container;
}

function updateSlide(slidesDiv, dots, index) {
    slidesDiv.style.transform = `translateX(-${index * 100}%)`;
    slidesDiv.dataset.index = index;
    
    if (dots) {
        Array.from(dots).forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });
    }
}

// ========== МОДАЛЬНОЕ ОКНО ТОВАРА ==========
function showProductModal(productId) {
    const product = currentProducts.find(p => p.id === productId);
    if (!product) return;
    
    selectedColor = product.colors[0];
    selectedSize = product.sizes[0];
    
    const content = document.getElementById('productModalContent');
    content.innerHTML = `
        <div class="product-modal-grid">
            <div class="product-modal-image" id="productCarouselContainer"></div>
            <div class="product-modal-info">
                <h2>${product.name}</h2>
                <p class="product-description-full">${product.description}</p>
                
                <div class="product-price-large">
                    <span class="current-price">${formatPrice(product.price)}</span>
                    ${product.old_price ? `<span class="old-price">${formatPrice(product.old_price)}</span>` : ''}
                </div>
                
                <div class="product-colors">
                    <label>Цвет: <span id="selectedColorDisplay">${product.colors[0]}</span></label>
                    <div class="color-options">
                        ${product.colors.map(color => {
                            const colorClass = getColorClass(color);
                            return `
                                <span class="color-badge ${color === product.colors[0] ? 'active' : ''}" 
                                      onclick="selectColorAndSlide(this, '${color}', ${product.colors.indexOf(color)})">
                                    <span class="color-dot ${colorClass}"></span>${color}
                                </span>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="product-sizes-full">
                    <label>Размер: <span id="selectedSizeDisplay">${product.sizes[0]}</span></label>
                    <div class="size-options">
                        ${product.sizes.map(size => `
                            <button class="size-btn ${size === product.sizes[0] ? 'active' : ''}" onclick="selectSize(this, '${size}')">${size}</button>
                        `).join('')}
                    </div>
                </div>
                
                <div class="product-actions">
                    <button class="btn-primary btn-large" onclick="addToCartFromModal('${product.id}')">
                        🛒 Добавить в корзину
                    </button>
                </div>
                
                <div class="product-features">
                    <div class="feature">🌱 Органические материалы</div>
                    <div class="feature">♻️ Экологичное производство</div>
                    <div class="feature">📦 Биоразлагаемая упаковка</div>
                </div>
            </div>
        </div>
    `;
    
    const carouselContainer = document.getElementById('productCarouselContainer');
    const carousel = createCarousel(product.images, product.colors, (color) => {
        selectedColor = color;
        document.getElementById('selectedColorDisplay').textContent = color;
        
        document.querySelectorAll('.color-badge').forEach((badge, i) => {
            badge.classList.toggle('active', product.colors[i] === color);
        });
    });
    carouselContainer.appendChild(carousel);
    
    productModal.style.display = 'block';
}

function getColorClass(color) {
    const map = {
        'Белый': 'white', 'Черный': 'black', 'Бежевый': 'beige',
        'Серый': 'grey', 'Синий': 'blue', 'Зеленый': 'green',
        'Коричневый': 'brown', 'Натуральный': 'natural', 'Хаки': 'khaki',
        'Темно-синий': 'navy', 'Розовый': 'pink', 'Голубой': 'blue'
    };
    return map[color] || 'grey';
}

function selectColorAndSlide(el, color, index) {
    document.querySelectorAll('.color-badge').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    selectedColor = color;
    document.getElementById('selectedColorDisplay').textContent = color;
    
    const slidesDiv = document.querySelector('.carousel-slides');
    const dots = document.querySelectorAll('.carousel-dot');
    if (slidesDiv) {
        updateSlide(slidesDiv, dots, index);
    }
}

function selectColor(el, color) {
    selectColorAndSlide(el, color, 0);
}

function selectSize(btn, size) {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSize = size;
    document.getElementById('selectedSizeDisplay').textContent = size;
}

async function addToCartFromModal(productId) {
    const isAuth = await checkAuth();
    if (!isAuth) {
        productModal.style.display = 'none';
        modal.style.display = 'block';
        return;
    }
    
    const product = currentProducts.find(p => p.id === productId);
    const finalSize = selectedSize || product.sizes[0];
    const finalColor = selectedColor || product.colors[0];
    
    try {
        const response = await fetch('/api/cart/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                product_id: product.id,
                name: `${product.name} (${finalColor})`,
                image: product.images[finalColor],
                price: product.price,
                quantity: 1,
                size: finalSize
            })
        });
        
        const data = await response.json();
        if (data.success) {
            productModal.style.display = 'none';
            showNotification(`✅ ${product.name} (${finalColor}, размер ${finalSize}) добавлен в корзину!`);
            loadCartCount();
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при добавлении в корзину');
    }
}

// ========== ЧАТ-БОТ ==========
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendMessageBtn');
const chatHeader = document.getElementById('chatHeader');
const chatBody = document.getElementById('chatBody');
const chatToggle = document.getElementById('chatToggle');
const clearChatBtn = document.getElementById('clearChat');

function addMessage(text, isUser) {
    const div = document.createElement('div');
    div.className = isUser ? 'message user' : 'message bot';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    addMessage(message, true);
    messageInput.value = '';

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot';
    loadingDiv.textContent = '⏳ Думаю...';
    chatMessages.appendChild(loadingDiv);

    try {
        const response = await fetch('/send_message', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({message: message})
        });

        const data = await response.json();
        loadingDiv.remove();
        addMessage(data.response, false);
    } catch (error) {
        loadingDiv.remove();
        addMessage('Ошибка соединения 😔', false);
    }
}

async function clearChatHistory() {
    try {
        await fetch('/clear_chat', {method: 'POST'});
        chatMessages.innerHTML = '';
        addMessage('👋 Привет! Я OrderBot магазина EcoLook. Могу помочь с выбором товара или узнать статус заказа.', false);
    } catch (error) {}
}

chatHeader.onclick = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    chatBody.classList.toggle('collapsed');
    chatToggle.textContent = chatBody.classList.contains('collapsed') ? '▲' : '▼';
};

chatToggle.onclick = (e) => {
    e.stopPropagation();
    chatBody.classList.toggle('collapsed');
    chatToggle.textContent = chatBody.classList.contains('collapsed') ? '▲' : '▼';
};

sendBtn.onclick = sendMessage;
clearChatBtn.onclick = (e) => {
    e.stopPropagation();
    clearChatHistory();
};

messageInput.onkeypress = (e) => {
    if (e.key === 'Enter') sendMessage();
};

// ========== ИНИЦИАЛИЗАЦИЯ ==========
window.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    addMessage('👋 Привет! Я OrderBot магазина EcoLook. Могу помочь с выбором товара или узнать статус заказа.', false);
});

window.showProductModal = showProductModal;
window.addToCart = addToCart;
window.selectColor = selectColor;
window.selectColorAndSlide = selectColorAndSlide;
window.selectSize = selectSize;
window.addToCartFromModal = addToCartFromModal;