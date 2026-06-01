// ========== ПРОВЕРКА АВТОРИЗАЦИИ ==========
async function checkAuth() {
    try {
        const response = await fetch('/get_user_info');
        if (!response.ok) {
            window.location.href = '/';
            return null;
        }
        return await response.json();
    } catch (e) {
        window.location.href = '/';
        return null;
    }
}

// ========== ЗАГРУЗКА КОРЗИНЫ ==========
async function loadCart() {
    const cartItems = document.getElementById('cartItems');
    const cartSidebar = document.getElementById('cartSidebar');
    const emptyCart = document.getElementById('emptyCart');
    
    try {
        const response = await fetch('/api/cart');
        const data = await response.json();
        
        updateCartCount(data.count);
        
        if (data.items.length === 0) {
            cartItems.style.display = 'none';
            cartSidebar.style.display = 'none';
            emptyCart.style.display = 'block';
            return;
        }
        
        cartItems.style.display = 'block';
        cartSidebar.style.display = 'block';
        emptyCart.style.display = 'none';
        
        cartItems.innerHTML = '';
        
        data.items.forEach(item => {
            const itemElement = createCartItemElement(item);
            cartItems.appendChild(itemElement);
        });
        
        document.getElementById('itemsTotal').textContent = formatPrice(data.total);
        document.getElementById('finalTotal').textContent = formatPrice(data.total);
        
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
        cartItems.innerHTML = '<div class="error">Ошибка загрузки корзины</div>';
    }
}

function createCartItemElement(item) {
    const div = document.createElement('div');
    div.className = 'cart-item';
    div.dataset.id = item.id;
    
    // Проверяем, является ли image путём к файлу или эмодзи
    let imageContent;
    if (item.image && (item.image.startsWith('/static/') || item.image.startsWith('http'))) {
        imageContent = `<img src="${item.image}" alt="${item.name}" onerror="this.src='/static/images/products/placeholder.jpg'" style="width: 100%; height: 100%; object-fit: cover; border-radius: 15px;">`;
    } else {
        imageContent = item.image || '📦';
    }
    
    div.innerHTML = `
        <div class="cart-item-image">${imageContent}</div>
        <div class="cart-item-info">
            <h4>${item.name}</h4>
            <div class="cart-item-price">${formatPrice(item.price)}</div>
            <div class="cart-item-size">Размер: ${item.size}</div>
        </div>
        <div class="cart-item-controls">
            <div class="quantity-control">
                <button class="qty-btn minus" onclick="updateQuantity(${item.id}, ${item.quantity - 1})">−</button>
                <input type="number" class="qty-input" value="${item.quantity}" min="1" 
                       onchange="updateQuantity(${item.id}, this.value)">
                <button class="qty-btn plus" onclick="updateQuantity(${item.id}, ${item.quantity + 1})">+</button>
            </div>
            <button class="remove-btn" onclick="removeItem(${item.id})">🗑️</button>
        </div>
        <div class="cart-item-total">${formatPrice(item.price * item.quantity)}</div>
    `;
    
    return div;
}

function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
}

async function updateQuantity(itemId, newQuantity) {
    if (newQuantity < 0) return;
    
    try {
        const response = await fetch('/api/cart/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({item_id: itemId, quantity: newQuantity})
        });
        
        if (response.ok) {
            await loadCart();
        }
    } catch (error) {
        console.error('Ошибка обновления:', error);
    }
}

async function removeItem(itemId) {
    if (!confirm('Удалить товар из корзины?')) return;
    
    try {
        const response = await fetch('/api/cart/remove', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({item_id: itemId})
        });
        
        if (response.ok) {
            await loadCart();
        }
    } catch (error) {
        console.error('Ошибка удаления:', error);
    }
}

async function checkout() {
    // Проверяем авторизацию
    try {
        const authResponse = await fetch('/get_user_info');
        if (!authResponse.ok) {
            alert('Сессия истекла. Пожалуйста, войдите снова.');
            window.location.href = '/';
            return;
        }
    } catch (e) {
        alert('Ошибка проверки авторизации');
        return;
    }
    
    if (!confirm('Оформить заказ?')) return;
    
    try {
        const response = await fetch('/api/cart/checkout', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        });
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            if (response.status === 401) {
                alert('Сессия истекла. Пожалуйста, войдите снова.');
                window.location.href = '/';
                return;
            }
            throw new Error('Сервер вернул не JSON ответ');
        }
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('trackingNumber').textContent = data.tracking_number;
            document.getElementById('successModal').style.display = 'block';
            await loadCart();
            updateCartCount(0);
        } else {
            alert(data.message || 'Ошибка при оформлении заказа');
        }
    } catch (error) {
        console.error('Ошибка оформления:', error);
        alert('Ошибка при оформлении заказа. Попробуйте позже.');
    }
}

async function clearCart() {
    if (!confirm('Очистить корзину?')) return;
    
    try {
        const response = await fetch('/api/cart');
        const data = await response.json();
        
        for (const item of data.items) {
            await fetch('/api/cart/remove', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({item_id: item.id})
            });
        }
        
        await loadCart();
    } catch (error) {
        console.error('Ошибка очистки:', error);
    }
}

function updateCartCount(count) {
    const countEl = document.getElementById('cartCount');
    if (countEl) {
        countEl.textContent = count > 0 ? `(${count})` : '(0)';
    }
}

// ========== ВЫХОД ==========
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/logout', {method: 'POST'});
    window.location.href = '/';
});

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadCart();
    
    document.getElementById('checkoutBtn').addEventListener('click', checkout);
    document.getElementById('clearCartBtn').addEventListener('click', clearCart);
    
    const modal = document.getElementById('successModal');
    const closeBtn = modal.querySelector('.close');
    
    closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => {
        if (e.target == modal) modal.style.display = 'none';
    };
});

window.updateQuantity = updateQuantity;
window.removeItem = removeItem;