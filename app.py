from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_session import Session
import requests
import os
from dotenv import load_dotenv
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
import re
from functools import wraps
import random
import string

load_dotenv()

app = Flask(__name__)

app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "super-secret-key-2024")
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

OPENROUTER_KEY = os.getenv("OPENROUTER_KEY")
API_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """
Ты — OrderBot, чат-бот поддержки интернет-магазина EcoLook.

ЖЁСТКИЕ ПРАВИЛА:
1. Отвечай СТРОГО 1-3 предложениями. Не больше.
2. НИКАКОГО форматирования. Не используй **, ##, 🔹, ✅, списки, жирный текст, курсив.
3. Пиши ТОЛЬКО простым текстом, как обычный человек в мессенджере.
4. Не используй эмодзи кроме тех, что в твоём ответе по делу.
5. Будь КРАТКИМ. Если можно ответить одним предложением — ответь одним.

ЧТО ГОВОРИТЬ О ТОВАРАХ:
- Футболки из органического хлопка, от 1990 руб.
- Худи и свитшоты из переработанных материалов, от 3490 руб.
- Джинсы и штаны из эко-денима, от 3290 руб.
- Куртки и жилеты, от 5490 руб.
- Аксессуары: сумки-шопперы, кепки, носки, от 590 руб.
- Все товары смотрите в каталоге на сайте.

О ДОСТАВКЕ:
- Бесплатно по РФ при заказе от 3000 руб, иначе 350 руб. Срок 3-7 дней.

ОБ ОПЛАТЕ:
- Только через кошелёк на сайте.

О ВОЗВРАТЕ:
- 14 дней, товар должен быть в упаковке. Деньги на кошелёк за 3 дня.

СТРОЖАЙШИЕ ЗАПРЕТЫ:
- НИКАКИХ промокодов. НИКАКИХ скидок. НИКАКИХ акций.
- Если просят скидку или промокод: "Скидок и промокодов сейчас нет."
- НЕ выдумывай товары, которых нет в ассортименте.
- НЕ используй фразы "С удовольствием!", "Конечно!", "Обязательно!".
- НЕ строй из себя слишком дружелюбного. Ты поддержка, а не друг.
- Если клиент спрашивает про конкретный товар — скажи посмотреть в каталоге на сайте.
- Если клиент спрашивает статус заказа — попроси трек-номер.
- Если клиент пишет не по теме магазина — скажи что помогаешь только с вопросами об EcoLook.

ПРИМЕРЫ ОТВЕТОВ:
Пользователь: Какие есть футболки?
Ты: У нас есть футболки из органического хлопка от 1990 руб. Доступны белый, чёрный и бежевый цвета. Посмотрите в каталоге на сайте.

Пользователь: Дайте скидку
Ты: Скидок и промокодов сейчас нет.

Пользователь: Сколько стоит доставка?
Ты: Доставка бесплатно при заказе от 3000 руб, иначе 350 руб. Срок 3-7 дней.
"""

# ==========================================
# ДЕКОРАТОР ДЛЯ ПРОВЕРКИ АВТОРИЗАЦИИ
# ==========================================
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({"success": False, "message": "Не авторизован"}), 401
            return redirect(url_for('home'))
        return f(*args, **kwargs)
    return decorated_function

# ==========================================
# БАЗА ДАННЫХ
# ==========================================
def get_db():
    """Подключение к базе данных"""
    return sqlite3.connect('database.db', timeout=10)

def init_db():
    """Создание таблиц"""
    conn = get_db()
    c = conn.cursor()
    
    # Пользователи
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    # Заказы
    c.execute('''CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product TEXT NOT NULL,
        product_image TEXT DEFAULT '📦',
        price REAL NOT NULL,
        status TEXT DEFAULT 'В обработке',
        tracking_number TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')
    
    # Корзина
    c.execute('''CREATE TABLE IF NOT EXISTS cart (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_image TEXT DEFAULT '📦',
        price REAL NOT NULL,
        quantity INTEGER DEFAULT 1,
        size TEXT DEFAULT 'M',
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id, size),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')
    
    # Кошелёк
    c.execute('''CREATE TABLE IF NOT EXISTS wallet (
        user_id INTEGER PRIMARY KEY,
        balance REAL DEFAULT 0,
        card_number TEXT,
        card_name TEXT,
        card_expiry TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')
    
    # Транзакции
    c.execute('''CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )''')
    
    # Добавляем тестового пользователя если база пустая
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        hashed = generate_password_hash("123456")
        c.execute("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
                 ("test_user", "test@ecolook.ru", hashed))
        user_id = c.lastrowid
        
        # Тестовый кошелёк
        c.execute("INSERT INTO wallet (user_id, balance) VALUES (?, ?)", (user_id, 5000))
        
        # Тестовые заказы
        test_orders = [
            (user_id, "Футболка Organic Cotton", "👕", 1990, "Доставлен", "ECO12345"),
            (user_id, "Худи Recycled", "🧥", 3990, "В пути", "ECO67890"),
            (user_id, "Эко-сумка шоппер", "🛍️", 890, "В обработке", "ECO11223")
        ]
        c.executemany(
            "INSERT INTO orders (user_id, product, product_image, price, status, tracking_number) VALUES (?, ?, ?, ?, ?, ?)",
            test_orders
        )
    
    conn.commit()
    conn.close()
    print("✅ База данных готова")

init_db()

# ==========================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ==========================================
def generate_tracking_number():
    return f"ECO{''.join(random.choices(string.digits, k=8))}"

def get_order(tracking_number):
    if not re.match("^[A-Za-z0-9-]+$", tracking_number):
        return None
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT product, status, price, tracking_number FROM orders WHERE tracking_number=?", (tracking_number,))
    order = c.fetchone()
    conn.close()
    return order

def get_user_orders(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT product, product_image, price, status, tracking_number, created_at FROM orders WHERE user_id=? ORDER BY created_at DESC", (user_id,))
    orders = c.fetchall()
    conn.close()
    return orders

# ==========================================
# AI ЧАТ
# ==========================================
def filter_response(reply: str) -> str:
    """Фильтрует ответ бота на запрещённый контент"""
    import re as re_module
    
    # Шаблоны запрещённых паттернов
    forbidden_patterns = [
        r'промокод\s*\w*\d*',       # промокод ECO...
        r'ECO[A-Z]+\d+',            # любой ECO... с цифрами
        r'[A-Z]+\d+\s*скидк',       # ECOLOVE20 скидка
        r'\d+%\s*скидк',            # 20% скидка
        r'скидка\s*\d+%',           # скидка 20%
        r'скидк\w*\s*\d+%',         # скидку 20%
        r'купон',
        r'ПРОМО',
        r'SALE',
        r'специально для вас',      # фраза которая часто предшествует промокоду
        r'персональн\w*\s*промо',   # персональный промокод
        r'вот\s*\w*\s*промокод',    # вот ... промокод
        r'да[её]т\s*\d+%',          # даёт 20%
        r'экономи\w*',              # сэкономить
        r'сохрани\w*',              # сохранить
    ]
    
    reply_lower = reply.lower()
    
    # Проверяем все паттерны
    for pattern in forbidden_patterns:
        if re_module.search(pattern, reply_lower):
            return "Скидок и промокодов сейчас нет. Могу помочь с выбором товара или информацией о заказе."
    
    # Дополнительная проверка - если в ответе есть проценты
    if re_module.search(r'\d+%', reply) and ('скидк' in reply_lower or 'промокод' in reply_lower or 'экономи' in reply_lower):
        return "Скидок и промокодов сейчас нет. Могу помочь с выбором товара или информацией о заказе."
    
    # Проверка на эмодзи праздника/подарка
    gift_emojis = ['🎉', '🎁', '🎊', '🎀', '💝', '✨']
    if 'промокод' in reply_lower or 'скидк' in reply_lower:
        return "Скидок и промокодов сейчас нет. Могу помочь с выбором товара или информацией о заказе."
    
    # Убираем все эмодзи (на всякий случай)
    import re as re_module
    reply = re_module.sub(r'[^\x00-\x7F\u0410-\u044F\u0401\u0451\s.,!?\-:;()]', '', reply)
    
    return reply


def chat_with_ai(message: str) -> str:
    # Проверка трек-номера
    words = message.split()
    for word in words:
        if len(word) >= 6 and any(c.isdigit() for c in word):
            order = get_order(word)
            if order:
                status_emoji = {"Доставлен": "✅", "В пути": "🚚", "В обработке": "⏳"}.get(order[1], "📦")
                return f"{status_emoji} Заказ: {order[0]}\nСумма: {order[2]} руб\nСтатус: {order[1]}\nТрек-номер: {order[3]}"

    headers = {
        "Authorization": f"Bearer {OPENROUTER_KEY}",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "EcoLook OrderBot"
    }

    if "chat_history" not in session:
        session["chat_history"] = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Если пользователь просит скидку - отвечаем сразу, не обращаясь к AI
    msg_lower = message.lower()
    if any(word in msg_lower for word in ['скидк', 'промокод', 'купон', 'подешевле', 'дешевл', 'акци']):
        reply = "Скидок и промокодов сейчас нет."
        session["chat_history"].append({"role": "user", "content": message})
        session["chat_history"].append({"role": "assistant", "content": reply})
        return reply

    session["chat_history"].append({"role": "user", "content": message})
    
    if len(session["chat_history"]) > 10:
        session["chat_history"] = [session["chat_history"][0]] + session["chat_history"][-9:]

    data = {
        "model": "deepseek/deepseek-chat",
        "messages": session["chat_history"],
        "temperature": 0.1,
        "max_tokens": 150
    }

    try:
        response = requests.post(API_URL, json=data, headers=headers)
        result = response.json()
        
        if "error" in result:
            return "Произошла ошибка. Попробуйте позже."
            
        reply = result["choices"][0]["message"]["content"]
        
        # Фильтрация
        reply = filter_response(reply)
        
        # Очистка
        reply = reply.replace('**', '').replace('##', '').replace('__', '')
        
        session["chat_history"].append({"role": "assistant", "content": reply})
        return reply

    except Exception as e:
        print(e)
        return "Ошибка при обращении к AI."

# ==========================================
# СТРАНИЦЫ
# ==========================================
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/catalog")
def catalog_page():
    return render_template("catalog.html")

@app.route("/cabinet")
@login_required
def cabinet():
    return render_template("cabinet.html")

@app.route("/cart")
@login_required
def cart_page():
    return render_template("cart.html")

# ==========================================
# API АВТОРИЗАЦИИ
# ==========================================
@app.route("/register", methods=["POST"])
def register():
    try:
        data = request.json
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        
        if not username or not email or not password:
            return jsonify({"success": False, "message": "Все поля обязательны"}), 400
        if len(password) < 6:
            return jsonify({"success": False, "message": "Пароль минимум 6 символов"}), 400
        
        conn = get_db()
        c = conn.cursor()
        c.execute("SELECT id FROM users WHERE username=? OR email=?", (username, email))
        if c.fetchone():
            conn.close()
            return jsonify({"success": False, "message": "Пользователь или email уже занят"}), 400
        
        hashed = generate_password_hash(password)
        c.execute("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)", (username, email, hashed))
        conn.commit()
        
        user_id = c.lastrowid
        session['user_id'] = user_id
        session['username'] = username
        conn.close()
        
        return jsonify({"success": True, "message": "Регистрация успешна"})
    except Exception as e:
        print(f"Ошибка регистрации: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.json
        login = data.get('login', '').strip()
        password = data.get('password', '')
        
        if not login or not password:
            return jsonify({"success": False, "message": "Логин и пароль обязательны"}), 400
        
        conn = get_db()
        c = conn.cursor()
        c.execute("SELECT id, username, password_hash FROM users WHERE username=? OR email=?", (login, login))
        user = c.fetchone()
        conn.close()
        
        if user and check_password_hash(user[2], password):
            session['user_id'] = user[0]
            session['username'] = user[1]
            return jsonify({"success": True, "message": "Успешный вход"})
        return jsonify({"success": False, "message": "Неверный логин или пароль"}), 401
    except Exception as e:
        print(f"Ошибка входа: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True, "message": "Выход выполнен"})

@app.route("/get_user_info")
@login_required
def get_user_info():
    return jsonify({"user_id": session.get('user_id'), "username": session.get('username')})

# ==========================================
# API ЧАТ-БОТА
# ==========================================
@app.route("/send_message", methods=["POST"])
def send_message():
    msg = request.json.get("message", "")
    if not msg:
        return jsonify({"response": "Пустое сообщение"})
    return jsonify({"response": chat_with_ai(msg)})

@app.route("/clear_chat", methods=["POST"])
def clear_chat():
    session.pop("chat_history", None)
    return jsonify({"message": "История очищена"})

# ==========================================
# API ЗАКАЗОВ
# ==========================================
@app.route("/get_orders")
@login_required
def get_orders():
    orders = get_user_orders(session['user_id'])
    return jsonify({"orders": [{"product": o[0], "image": o[1], "price": o[2], "status": o[3], "tracking": o[4], "date": o[5]} for o in orders]})

# ==========================================
# API КОРЗИНЫ
# ==========================================
@app.route("/api/cart", methods=["GET"])
@login_required
def get_cart():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, product_id, product_name, product_image, price, quantity, size FROM cart WHERE user_id=? ORDER BY added_at DESC", (session['user_id'],))
    items = c.fetchall()
    conn.close()
    
    cart_items = [{"id": i[0], "product_id": i[1], "name": i[2], "image": i[3], "price": i[4], "quantity": i[5], "size": i[6]} for i in items]
    total = sum(item["price"] * item["quantity"] for item in cart_items)
    count = sum(item["quantity"] for item in cart_items)
    
    return jsonify({"items": cart_items, "total": total, "count": count})

@app.route("/api/cart/add", methods=["POST"])
@login_required
def add_to_cart():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT id, quantity FROM cart WHERE user_id=? AND product_id=? AND size=?", 
             (session['user_id'], data['product_id'], data.get('size', 'M')))
    existing = c.fetchone()
    
    if existing:
        c.execute("UPDATE cart SET quantity = quantity + ? WHERE id = ?", (data.get('quantity', 1), existing[0]))
    else:
        c.execute("INSERT INTO cart (user_id, product_id, product_name, product_image, price, quantity, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
                 (session['user_id'], data['product_id'], data['name'], data.get('image', '📦'), data['price'], data.get('quantity', 1), data.get('size', 'M')))
    
    conn.commit()
    c.execute("SELECT SUM(quantity) FROM cart WHERE user_id=?", (session['user_id'],))
    count = c.fetchone()[0] or 0
    conn.close()
    
    return jsonify({"success": True, "message": "Товар добавлен", "cart_count": count})

@app.route("/api/cart/update", methods=["POST"])
@login_required
def update_cart():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    if int(data['quantity']) <= 0:
        c.execute("DELETE FROM cart WHERE id=? AND user_id=?", (data['item_id'], session['user_id']))
    else:
        c.execute("UPDATE cart SET quantity=? WHERE id=? AND user_id=?", (data['quantity'], data['item_id'], session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/cart/remove", methods=["POST"])
@login_required
def remove_from_cart():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM cart WHERE id=? AND user_id=?", (data['item_id'], session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/cart/checkout", methods=["POST"])
@login_required
def checkout():
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute("BEGIN IMMEDIATE")
        
        c.execute("SELECT product_name, product_image, price, quantity FROM cart WHERE user_id=?", (session['user_id'],))
        cart_items = c.fetchall()
        
        if not cart_items:
            conn.rollback()
            conn.close()
            return jsonify({"success": False, "message": "Корзина пуста"}), 400
        
        total_amount = sum(float(item[2]) * int(item[3]) for item in cart_items)
        
        # Проверяем кошелёк
        c.execute("INSERT OR IGNORE INTO wallet (user_id, balance) VALUES (?, 0)", (session['user_id'],))
        c.execute("SELECT balance FROM wallet WHERE user_id=?", (session['user_id'],))
        balance = c.fetchone()[0]
        
        if balance < total_amount:
            conn.rollback()
            conn.close()
            return jsonify({"success": False, "message": f"Недостаточно средств! Нужно: {total_amount} ₽, на счету: {balance} ₽"}), 400
        
        # Списываем
        c.execute("UPDATE wallet SET balance = balance - ? WHERE user_id=?", (total_amount, session['user_id']))
        c.execute("INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'покупка', ?, 'Оплата заказа')", (session['user_id'], total_amount))
        
        # Создаём заказы
        for item in cart_items:
            tracking = generate_tracking_number()
            c.execute("INSERT INTO orders (user_id, product, product_image, price, status, tracking_number) VALUES (?, ?, ?, ?, 'В обработке', ?)",
                     (session['user_id'], item[0], item[1] if item[1] else '📦', float(item[2]) * int(item[3]), tracking))
        
        c.execute("DELETE FROM cart WHERE user_id=?", (session['user_id'],))
        conn.commit()
        
        c.execute("SELECT balance FROM wallet WHERE user_id=?", (session['user_id'],))
        new_balance = c.fetchone()[0]
        conn.close()
        
        return jsonify({"success": True, "message": f"Заказ оформлен! Списанo: {total_amount} ₽", "balance": new_balance})
        
    except Exception as e:
        print(f"Ошибка checkout: {e}")
        try:
            conn.rollback()
        except:
            pass
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/cart/count")
@login_required
def get_cart_count():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT SUM(quantity) FROM cart WHERE user_id=?", (session['user_id'],))
    count = c.fetchone()[0] or 0
    conn.close()
    return jsonify({"count": count})

# ==========================================
# API КОШЕЛЬКА
# ==========================================
@app.route("/api/wallet")
@login_required
def get_wallet():
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT OR IGNORE INTO wallet (user_id, balance) VALUES (?, 0)", (session['user_id'],))
    conn.commit()
    c.execute("SELECT balance, card_number, card_name, card_expiry FROM wallet WHERE user_id=?", (session['user_id'],))
    wallet = c.fetchone()
    c.execute("SELECT type, amount, description, created_at FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 10", (session['user_id'],))
    transactions = [{"type": t[0], "amount": t[1], "description": t[2], "date": t[3]} for t in c.fetchall()]
    conn.close()
    return jsonify({"balance": wallet[0], "card_number": wallet[1], "card_name": wallet[2], "card_expiry": wallet[3], "transactions": transactions})

@app.route("/api/wallet/add-card", methods=["POST"])
@login_required
def add_card():
    data = request.json
    card_number = data.get('card_number', '').strip().replace(' ', '')
    card_name = data.get('card_name', '').strip()
    card_expiry = data.get('card_expiry', '').strip()
    
    if not card_number or not card_name or not card_expiry:
        return jsonify({"success": False, "message": "Все поля обязательны"})
    
    masked = '•••• ' + card_number[-4:]
    
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT OR IGNORE INTO wallet (user_id, balance) VALUES (?, 0)", (session['user_id'],))
    c.execute("UPDATE wallet SET card_number=?, card_name=?, card_expiry=? WHERE user_id=?", (masked, card_name, card_expiry, session['user_id']))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Карта привязана"})

@app.route("/api/wallet/top-up", methods=["POST"])
@login_required
def top_up():
    amount = float(request.json.get('amount', 0))
    if amount <= 0:
        return jsonify({"success": False, "message": "Сумма должна быть больше 0"})
    
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT OR IGNORE INTO wallet (user_id, balance) VALUES (?, 0)", (session['user_id'],))
    c.execute("UPDATE wallet SET balance = balance + ? WHERE user_id=?", (amount, session['user_id']))
    c.execute("INSERT INTO transactions (user_id, type, amount, description) VALUES (?, 'пополнение', ?, 'Пополнение с карты')", (session['user_id'], amount))
    conn.commit()
    c.execute("SELECT balance FROM wallet WHERE user_id=?", (session['user_id'],))
    balance = c.fetchone()[0]
    conn.close()
    return jsonify({"success": True, "message": f"Пополнено на {amount} ₽", "balance": balance})

# ==========================================
# API КАТАЛОГА
# ==========================================
@app.route("/api/products")
def get_products():
    category = request.args.get('category', 'all')
    sort = request.args.get('sort', 'popular')
    search = request.args.get('search', '')
    
    all_products = [
        {"id": "tshirt1", "category": "tshirts", "name": "Футболка Organic Basic",
         "images": {"Белый": "/static/images/products/tshirt1_white.png", "Черный": "/static/images/products/tshirt1_black.png", "Бежевый": "/static/images/products/tshirt1_beige.png"},
         "price": 1990, "old_price": 2490, "description": "Базовая футболка из 100% органического хлопка",
         "sizes": ["XS", "S", "M", "L", "XL"], "colors": ["Белый", "Черный", "Бежевый"], "in_stock": True, "popular": True, "new": False},
        
        {"id": "tshirt2", "category": "tshirts", "name": "Футболка Eco Print",
         "images": {"Белый": "/static/images/products/tshirt2_white.png", "Серый": "/static/images/products/tshirt2_grey.png"},
         "price": 2290, "old_price": None, "description": "Футболка с экологичным принтом",
         "sizes": ["S", "M", "L", "XL"], "colors": ["Белый", "Серый"], "in_stock": True, "popular": True, "new": True},
        
        {"id": "hoodie1", "category": "hoodies", "name": "Худи Recycled",
         "images": {"Черный": "/static/images/products/hoodie1_black.png", "Серый": "/static/images/products/hoodie1_grey.png", "Синий": "/static/images/products/hoodie1_blue.png"},
         "price": 3990, "old_price": 4990, "description": "Худи из переработанного полиэстера",
         "sizes": ["S", "M", "L", "XL"], "colors": ["Черный", "Серый", "Синий"], "in_stock": True, "popular": True, "new": False},
        
        {"id": "pants1", "category": "pants", "name": "Джинсы Eco Slim",
         "images": {"Синий": "/static/images/products/pants1_blue.jpg", "Черный": "/static/images/products/pants1_black.jpg"},
         "price": 4990, "old_price": 5990, "description": "Узкие джинсы из органического денима",
         "sizes": ["28", "30", "32", "34", "36"], "colors": ["Синий", "Черный"], "in_stock": True, "popular": True, "new": False},
        
        {"id": "acc1", "category": "accessories", "name": "Эко-сумка шоппер",
         "images": {"Натуральный": "/static/images/products/acc1_natural.jpg", "Черный": "/static/images/products/acc1_black.jpg"},
         "price": 890, "old_price": 1290, "description": "Многоразовая сумка из органического хлопка",
         "sizes": ["One size"], "colors": ["Натуральный", "Черный"], "in_stock": True, "popular": True, "new": False},
    ]
    
    for p in all_products:
        p["image"] = p["images"][p["colors"][0]]
    
    if category != 'all':
        all_products = [p for p in all_products if p['category'] == category]
    if search:
        s = search.lower()
        all_products = [p for p in all_products if s in p['name'].lower() or s in p['description'].lower()]
    if sort == 'price_asc':
        all_products.sort(key=lambda x: x['price'])
    elif sort == 'price_desc':
        all_products.sort(key=lambda x: x['price'], reverse=True)
    elif sort == 'new':
        all_products.sort(key=lambda x: x['new'], reverse=True)
    else:
        all_products.sort(key=lambda x: x['popular'], reverse=True)
    
    return jsonify({"products": all_products})

if __name__ == "__main__":
    app.run(debug=True, threaded=True)