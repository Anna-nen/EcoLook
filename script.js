// ========== АВТОРИЗАЦИЯ ==========
const modal = document.getElementById('authModal');
const authBtn = document.getElementById('authBtn');
const cabinetBtn = document.getElementById('cabinetBtn');
const cartLink = document.getElementById('cartLink');
const cartCountSpan = document.getElementById('cartCount');
const closeBtn = document.querySelector('.close');

// Проверка авторизации при загрузке
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
closeBtn.onclick = () => modal.style.display = 'none';
window.onclick = (e) => {
    if (e.target == modal) modal.style.display = 'none';
}

// Переключение вкладок
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
    chatMessages.scrollTop = chatMessages.scrollHeight;

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
        addMessage('Ошибка соединения 😔 Попробуйте позже.', false);
    }
}

async function clearChatHistory() {
    try {
        await fetch('/clear_chat', {method: 'POST'});
        chatMessages.innerHTML = '';
        addMessage('👋 Привет! Я OrderBot магазина EcoLook. Могу помочь узнать статус заказа, условия доставки или ответить на другие вопросы.', false);
    } catch (error) {}
}

// Сворачивание/разворачивание чата
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

// ========== ПЛАВНАЯ ПРОКРУТКА ==========
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({behavior: 'smooth'});
        }
    });
});

// ========== КНОПКИ "В КОРЗИНУ" ==========
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

document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const productId = btn.dataset.productId;
        
        const isAuth = await checkAuth();
        if (!isAuth) {
            modal.style.display = 'block';
            alert('Для добавления в корзину необходимо войти или зарегистрироваться');
            return;
        }
        
        // Данные товаров с путями к изображениям
        const products = {
            'tshirt1': {
                name: 'Футболка Organic Basic', 
                image: '/static/images/products/tshirt1_white.png', 
                price: 1990,
                colors: ['Белый', 'Черный', 'Бежевый']
            },
            'hoodie1': {
                name: 'Худи Recycled', 
                image: '/static/images/products/hoodie1_black.png', 
                price: 3990,
                colors: ['Черный', 'Серый', 'Синий']
            },
            'pants1': {
                name: 'Джинсы Eco Slim', 
                image: '/static/images/products/pants1_blue.jpg', 
                price: 4990,
                colors: ['Синий', 'Черный']
            },
            'acc1': {
                name: 'Эко-сумка шоппер', 
                image: '/static/images/products/acc1_natural.jpg', 
                price: 890,
                colors: ['Натуральный', 'Черный']
            }
        };
        
        const product = products[productId];
        if (!product) return;
        
        try {
            const response = await fetch('/api/cart/add', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    product_id: productId,
                    name: `${product.name} (${product.colors[0]})`,
                    image: product.image,
                    price: product.price,
                    quantity: 1,
                    size: 'M'
                })
            });
            
            const data = await response.json();
            if (data.success) {
                showNotification('✅ Товар добавлен в корзину!');
                loadCartCount();
            } else {
                alert('Ошибка добавления в корзину');
            }
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка соединения');
        }
    };
});

// Приветственное сообщение
window.addEventListener('DOMContentLoaded', () => {
    addMessage('👋 Привет! Я OrderBot магазина EcoLook. Могу помочь узнать статус заказа, условия доставки или ответить на другие вопросы.', false);
});