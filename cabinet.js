const cartCountSpan = document.getElementById('cartCount');

async function checkAuth() {
    try {
        const response = await fetch('/get_user_info');
        if (!response.ok) { window.location.href = '/'; return null; }
        const data = await response.json();
        document.getElementById('username').textContent = data.username;
        return data;
    } catch (e) { window.location.href = '/'; return null; }
}

async function loadCartCount() {
    try {
        const response = await fetch('/api/cart/count');
        const data = await response.json();
        if (cartCountSpan) cartCountSpan.textContent = data.count > 0 ? `(${data.count})` : '';
    } catch (e) {}
}

// ========== КОШЕЛЁК ==========
async function loadWallet() {
    try {
        const response = await fetch('/api/wallet');
        const data = await response.json();
        document.getElementById('walletBalance').textContent = formatPrice(data.balance);
        
        const cardInfo = document.getElementById('cardInfo');
        if (data.card_number) {
            cardInfo.innerHTML = `
                <div class="card-display">
                    <div class="card-number">${data.card_number}</div>
                    <div class="card-holder">${data.card_name}</div>
                    <div class="card-expiry">${data.card_expiry}</div>
                </div>
                <button class="btn-outline btn-sm" onclick="showAddCardModal()">Изменить карту</button>`;
        } else {
            cardInfo.innerHTML = '<p>Карта не привязана</p><button class="btn-outline" onclick="showAddCardModal()">Привязать карту</button>';
        }
        
        const list = document.getElementById('transactionsList');
        if (data.transactions.length === 0) {
            list.innerHTML = '<p>Нет операций</p>';
        } else {
            list.innerHTML = data.transactions.map(t => `
                <div class="transaction-item">
                    <div class="transaction-info">
                        <span class="transaction-type ${t.type}">${t.description}</span>
                        <span class="transaction-date">${new Date(t.date).toLocaleString('ru-RU')}</span>
                    </div>
                    <span class="transaction-amount ${t.type === 'пополнение' ? 'positive' : 'negative'}">${t.type === 'пополнение' ? '+' : '-'}${formatPrice(t.amount)}</span>
                </div>`).join('');
        }
    } catch (e) { console.error('Ошибка кошелька:', e); }
}

function showTopUpModal() { document.getElementById('topUpModal').style.display = 'block'; }
function showAddCardModal() { document.getElementById('addCardModal').style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function topUpAmount(a) { document.getElementById('topUpAmount').value = a; }

async function topUpWallet() {
    const amount = parseFloat(document.getElementById('topUpAmount').value);
    if (!amount || amount <= 0) { document.getElementById('topUpMessage').textContent = 'Введите сумму'; return; }
    const response = await fetch('/api/wallet/top-up', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({amount})
    });
    const data = await response.json();
    if (data.success) { closeModal('topUpModal'); document.getElementById('topUpAmount').value = ''; await loadWallet(); alert(data.message); }
    else { document.getElementById('topUpMessage').textContent = data.message; }
}

async function addCard() {
    const cardNumber = document.getElementById('cardNumber').value.trim();
    const cardName = document.getElementById('cardName').value.trim();
    const cardExpiry = document.getElementById('cardExpiry').value.trim();
    if (!cardNumber || !cardName || !cardExpiry) { document.getElementById('addCardMessage').textContent = 'Все поля обязательны'; return; }
    const response = await fetch('/api/wallet/add-card', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({card_number: cardNumber, card_name: cardName, card_expiry: cardExpiry})
    });
    const data = await response.json();
    if (data.success) { closeModal('addCardModal'); document.getElementById('cardNumber').value = ''; document.getElementById('cardName').value = ''; document.getElementById('cardExpiry').value = ''; await loadWallet(); alert('Карта привязана!'); }
    else { document.getElementById('addCardMessage').textContent = data.message; }
}

// ========== ЗАКАЗЫ ==========
async function loadOrders() {
    const ordersList = document.getElementById('ordersList');
    try {
        const response = await fetch('/get_orders');
        const data = await response.json();
        if (data.orders.length === 0) { ordersList.innerHTML = '<div class="empty-orders">У вас пока нет заказов</div>'; return; }
        ordersList.innerHTML = data.orders.map(order => {
            const statusClass = {'Доставлен':'status-delivered','В пути':'status-shipped','В обработке':'status-processing'}[order.status] || 'status-processing';
            let img = (order.image && (order.image.startsWith('/static/')||order.image.startsWith('http'))) ? `<img src="${order.image}" onerror="this.src='/static/images/products/placeholder.jpg'" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : (order.image || '📦');
            return `<div class="order-card">
                <div class="order-info"><div class="order-image">${img}</div>
                <div class="order-details"><h4>${order.product}</h4><div class="order-price">${formatPrice(order.price)}</div><div class="order-tracking">🔖 Трек-номер: ${order.tracking}</div><div class="order-date">📅 ${new Date(order.date).toLocaleDateString('ru-RU')}</div></div></div>
                <div class="order-status ${statusClass}">${order.status}</div></div>`;
        }).join('');
    } catch (e) { ordersList.innerHTML = '<div class="error">Ошибка</div>'; }
}

function formatPrice(p) { return new Intl.NumberFormat('ru-RU').format(p) + ' ₽'; }

// ========== ЧАТ ==========
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
document.getElementById('sendMessageBtn').onclick = sendMessage;
document.getElementById('clearChatBtn').onclick = async () => { await fetch('/clear_chat', {method:'POST'}); chatMessages.innerHTML = ''; addMessage('👋 Привет! Я OrderBot.', false); };
messageInput.onkeypress = e => { if (e.key === 'Enter') sendMessage(); };

function addMessage(text, isUser) {
    const div = document.createElement('div');
    div.className = isUser ? 'message user' : 'message bot';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const msg = messageInput.value.trim();
    if (!msg) return;
    addMessage(msg, true);
    messageInput.value = '';
    const loading = document.createElement('div');
    loading.className = 'message bot';
    loading.textContent = '⏳ Думаю...';
    chatMessages.appendChild(loading);
    try {
        const res = await fetch('/send_message', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({message: msg})});
        const data = await res.json();
        loading.remove();
        addMessage(data.response, false);
    } catch (e) { loading.remove(); addMessage('Ошибка 😔', false); }
}

// ========== ВЫХОД ==========
document.getElementById('logoutBtn').onclick = async () => { await fetch('/logout', {method:'POST'}); window.location.href = '/'; };

// ========== ИНИЦИАЛИЗАЦИЯ ==========
window.onclick = e => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };
window.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();
    if (user) {
        await loadCartCount();
        await loadWallet();
        await loadOrders();
        addMessage(`👋 Привет, ${user.username}! Я OrderBot.`, false);
    }
});

window.showTopUpModal = showTopUpModal;
window.showAddCardModal = showAddCardModal;
window.closeModal = closeModal;
window.topUpAmount = topUpAmount;
window.topUpWallet = topUpWallet;
window.addCard = addCard;