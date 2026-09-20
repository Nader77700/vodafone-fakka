
import requests
import json
import os
import time
import shutil

RESET = "\033[0m"
CYAN = "\033[96m"
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
WHITE = "\033[97m"
GRAY = "\033[90m"

def clear():
    os.system("cls" if os.name == "nt" else "clear")

def terminal_width():
    try:
        return shutil.get_terminal_size().columns
    except Exception:
        return 60

WIDTH = min(62, terminal_width() - 4)
if WIDTH < 45:
    WIDTH = 45

def border(char="═"):
    print(CYAN + char * WIDTH + RESET)

def center(text, color=WHITE):
    text = str(text)
    if len(text) > WIDTH - 2:
        text = text[:WIDTH - 5] + "..."
    print(color + text.center(WIDTH) + RESET)

def pause():
    input("\nاضغط Enter للمتابعة...")

def header():
    clear()
    border()
    center("📱 فودافون | FAKKA & MARED", CYAN)
    center("نظام الشحن", CYAN)
    border()

def login():
    print()
    center("🔐 تسجيل الدخول", CYAN)
    border("─")

    number = input("📱 رقم الخط: ").strip()
    if not number:
        print(f"{RED}❌ رقم الخط مطلوب.{RESET}")
        return None, None

    password = input("🔑 كلمة مرور أنا فودافون: ").strip()
    if not password:
        print(f"{RED}❌ كلمة المرور مطلوبة.{RESET}")
        return None, None

    print()
    center("⏳ جاري تسجيل الدخول...", YELLOW)

    login_url = (
        "https://mobile.vodafone.com.eg/"
        "auth/realms/vf-realm/protocol/openid-connect/token"
    )

    login_payload = {
        "grant_type": "password",
        "username": number,
        "password": password,
        "client_secret": "dca0pbLUWXVhXR266Gw1iT5rqwvvJQoN",
        "client_id": "AnaVF"
    }

    login_headers = {
        "User-Agent": "okhttp/4.12.0",
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip",
        "silentLogin": "true",
        "msisdn": number,
        "x-agent-operatingsystem": "13",
        "clientId": "AnaVodafoneAndroid",
        "Accept-Language": "ar",
        "x-agent-device": "LENOVO TB310XU",
        "x-agent-version": "2026.4.1",
        "x-agent-build": "1139",
        "digitalId": "25ZQ6VBSZPI1V",
        "device-id": "e21f808017c900f3"
    }

    try:
        response = requests.post(
            login_url,
            data=login_payload,
            headers=login_headers,
            timeout=30
        )
    except requests.RequestException as e:
        print()
        border()
        center("❌ فشل الاتصال بفودافون", RED)
        border("─")
        print(f"📝 التفاصيل: {e}")
        border()
        return None, None

    try:
        result = response.json()
    except Exception:
        result = {}

    if response.status_code == 200 and result.get("access_token"):
        print()
        center("✅ تم تسجيل الدخول بنجاح", GREEN)
        border("─")
        print(f"📱 رقم الخط: {number}")
        border("─")
        time.sleep(1)
        return number, result["access_token"]

    print()
    border()
    center("❌ فشل تسجيل الدخول", RED)
    border("─")
    print(f"HTTP Status : {response.status_code}")

    if isinstance(result, dict):
        reason = (
            result.get("error_description")
            or result.get("error")
            or result.get("message")
        )
        if reason:
            print(f"📝 السبب: {reason}")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif response.text:
        print(response.text)

    border()
    return None, None

def get_cards():
    return {
        # ══════════════════ كروت جديدة ══════════════════
        "1":  {"name": "★ فكة 5 (جديد)",      "price": "5.00",  "units": "80 وحدة",  "duration": "2 أيام",  "product_id": "NewFakka_5_Unite"},
        "2":  {"name": "★ فكة 15 (جديد)",     "price": "15.00", "units": "300 وحدة", "duration": "2 أيام",  "product_id": "Fakka_15_Unite_v2"},
        "3":  {"name": "★ فكة 19 (جديد)",     "price": "19.00", "units": "425 وحدة", "duration": "6 أيام",  "product_id": "Fakka_19_Unite"},
        "4":  {"name": "★ فكة 22.5 (جديد)",   "price": "22.50", "units": "550 وحدة", "duration": "7 أيام",  "product_id": "Fakka_22.5_Unite"},
        "5":  {"name": "★ فكة 29 (جديد)",     "price": "29.00", "units": "800 وحدة", "duration": "2 أيام",  "product_id": "FakkaCard_29_Summer26"},
        "6":  {"name": "★ فكة 30 (جديد)",     "price": "30.00", "units": "750 وحدة", "duration": "10 أيام", "product_id": "Fakka_30_Unite"},
        # ══════════════════ كروت قديمة ══════════════════
        "7":  {"name": "فكة 2.5",              "price": "2.50",  "units": "45 وحدة",   "duration": "يوم واحد",  "product_id": "Fakka_2.5_Unite"},
        "8":  {"name": "فكة 3",                "price": "3.00",  "units": "125 وحدة",  "duration": "يوم واحد",  "product_id": "Fakka_3_Unite"},
        "9":  {"name": "فكة 4.25",             "price": "4.25",  "units": "190 وحدة",  "duration": "يوم واحد",  "product_id": "Fakka_4.25_Unite"},
        "10": {"name": "فكة 5",                "price": "5.00",  "units": "225 وحدة",  "duration": "يوم واحد",  "product_id": "Fakka_5_Unite"},
        "11": {"name": "فكة 6",                "price": "متغير", "units": "غير محدد",  "duration": "يوم واحد",  "product_id": "Fakka_6_Unite"},
        "12": {"name": "فكة 7",                "price": "7.00",  "units": "300 وحدة",  "duration": "3 أيام",    "product_id": "Fakka_7_Unite"},
        "13": {"name": "فكة 8",                "price": "متغير", "units": "غير محدد",  "duration": "أيام",      "product_id": "Fakka_8_Unite"},
        "14": {"name": "فكة 9",                "price": "9.00",  "units": "400 وحدة",  "duration": "4 أيام",    "product_id": "Fakka_9_Unite"},
        "15": {"name": "فكة 10",               "price": "10.00", "units": "450 وحدة",  "duration": "7 أيام",    "product_id": "Fakka_10_Unite"},
        "16": {"name": "فكة 10.5",             "price": "10.50", "units": "400 وحدة",  "duration": "7 أيام",    "product_id": "Fakka_10.5_Unite"},
        "17": {"name": "فكة 12",               "price": "12.00", "units": "425 وحدة",  "duration": "7 أيام",    "product_id": "Fakka_12_Unite"},
        "18": {"name": "فكة 12.5",             "price": "متغير", "units": "غير محدد",  "duration": "أيام",      "product_id": "Fakka_12.5_Unite"},
        "19": {"name": "فكة 13",               "price": "13.00", "units": "غير محدد",  "duration": "7 أيام",    "product_id": "Fakka_13_Unite"},
        "20": {"name": "فكة 13.5",             "price": "13.50", "units": "625 وحدة",  "duration": "7 أيام",    "product_id": "Fakka_13.5_Unite"},
        "21": {"name": "فكة 15",               "price": "15.00", "units": "550 وحدة",  "duration": "7 أيام",    "product_id": "Fakka_15_Unite"},
        "22": {"name": "فكة 15 (New)",         "price": "15.00", "units": "غير محدد",  "duration": "أيام",      "product_id": "Fakka_15_NewUnite"},
        "23": {"name": "فكة 15.5",             "price": "15.50", "units": "625 وحدة",  "duration": "7 أيام",    "product_id": "Fakka_15.5_Unite"},
        "24": {"name": "فكة 16.5",             "price": "16.50", "units": "غير محدد",  "duration": "10 أيام",   "product_id": "Fakka_16.5_Unite"},
        "25": {"name": "فكة 17.5",             "price": "17.50", "units": "650 وحدة",  "duration": "10 أيام",   "product_id": "Fakka_17.5_Unite"},
        "26": {"name": "فكة 19.5 NewUnite",    "price": "19.50", "units": "غير محدد",  "duration": "10 أيام",   "product_id": "Fakka_19.5_NewUnite"},
        "27": {"name": "فكة 20",               "price": "20.00", "units": "غير محدد",  "duration": "أيام",      "product_id": "Fakka_20_Unite"},
        "28": {"name": "فكة 26",               "price": "26.00", "units": "غير محدد",  "duration": "شهر",       "product_id": "Fakka_26_Unite"},
        "29": {"name": "مارد 10 دقائق",        "price": "متغير", "units": "10 دقائق",  "duration": "يوم واحد",  "product_id": "Mared_10_Minuts"},
        "30": {"name": "مارد 10 فليكس",        "price": "متغير", "units": "10 فليكس",  "duration": "يوم واحد",  "product_id": "Mared_10_Flexs"},
        "31": {"name": "مارد 10 سوشيال",       "price": "متغير", "units": "10 سوشيال", "duration": "يوم واحد",  "product_id": "Mared_10_Social"}
    }

def show_cards(cards):
    print()
    border()
    center("📋 الكروت المتاحة", CYAN)
    border("─")

    print(
        f"{CYAN}"
        f"{'رقم':^5} {'اسم الكرت':^19} {'السعر':^10} {'المحتوى':^17}"
        f"{RESET}"
    )

    border("─")

    for key, card in cards.items():
        name = card["name"]
        price = card["price"]
        units = card["units"]

        if len(name) > 18:
            name = name[:16] + ".."

        if len(units) > 16:
            units = units[:14] + ".."

        print(
            f"{CYAN}"
            f"[{key:^3}] {name:^18} {price:^9} {units:^16}"
            f"{RESET}"
        )

    border()

def show_details(card):
    print()
    border()
    center("📦 تفاصيل المنتج", CYAN)
    border("─")

    print(f"📦 الاسم     : {card['name']}")
    print(f"💰 السعر     : {card['price']} جنيه")
    print(f"🎁 المحتوى   : {card['units']}")
    print(f"⏱️ المدة     : {card['duration']}")
    print(f"🔢 Product ID: {card['product_id']}")

    border()

def get_error_info(code, reason):
    code = str(code).strip()
    reason_lower = str(reason).lower()

    if code in ["2252", "6051"]:
        return (
            "❌ الرصيد غير كافٍ",
            "رصيد الخط الحالي لا يكفي لتنفيذ العملية.",
            "💡 اشحن رصيد الخط ثم أعد المحاولة."
        )

    if code == "2035" or "customer not eligible" in reason_lower:
        return (
            "❌ العميل غير مؤهل",
            "Vodafone رفضت تنفيذ هذا المنتج على هذا الخط حاليًا.",
            "ℹ️ السبب التفصيلي غير موجود في رد Vodafone."
        )

    return (
        "❌ فشل تنفيذ الطلب",
        "Vodafone رفضت الطلب أو حدث خطأ أثناء التنفيذ.",
        "ℹ️ راجع كود وسبب Vodafone بالأسفل."
    )

def charge_card(number, token, card):
    print()
    center(f"⏳ جاري تنفيذ طلب {card['name']}...", YELLOW)

    order_url = (
        "https://mobile.vodafone.com.eg/"
        "services/dxl/pom/productOrder"
    )

    order_payload = {
        "channel": {"name": "MobileApp"},
        "orderItem": [{
            "action": "insert",
            "product": {
                "id": card["product_id"],
                "relatedParty": [{
                    "id": number,
                    "name": "MSISDN",
                    "role": "Subscriber"
                }]
            },
            "eCode": 0
        }],
        "@type": "FakkaAndMared"
    }

    order_headers = {
        "User-Agent": "okhttp/4.12.0",
        "Connection": "Keep-Alive",
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "api-host": "ProductOrderingManagement",
        "useCase": "FakkaAndMaredProduct",
        "Authorization": "Bearer " + token,
        "api-version": "v2",
        "device-id": "e21f808017c900f3",
        "x-agent-operatingsystem": "13",
        "clientId": "AnaVodafoneAndroid",
        "x-agent-device": "LENOVO TB310XU",
        "x-agent-version": "2026.4.1",
        "x-agent-build": "1139",
        "msisdn": number,
        "Accept-Language": "ar",
        "Content-Type": "application/json; charset=UTF-8"
    }

    try:
        response = requests.post(
            order_url,
            json=order_payload,
            headers=order_headers,
            timeout=30
        )
    except requests.RequestException as e:
        print()
        border()
        center("❌ فشل الاتصال", RED)
        border("─")
        print("📡 لم يتم الوصول إلى Vodafone.")
        print(f"📝 التفاصيل: {e}")
        border()
        return False

    try:
        result = response.json()
    except Exception:
        result = {}

    if isinstance(result, dict):
        code = str(result.get("code", "")).strip()
        reason = str(result.get("reason", "")).strip()
    else:
        code = ""
        reason = ""

    if response.status_code in [200, 201]:
        print()
        border()
        center("✅ تم قبول الطلب من Vodafone", GREEN)
        border("─")
        print(f"📦 المنتج : {card['name']}")
        print(f"💰 السعر  : {card['price']} جنيه")
        print(f"🎁 المحتوى: {card['units']}")
        print(f"⏱️ المدة  : {card['duration']}")

        if code:
            print(f"🔢 Code   : {code}")

        if reason:
            print(f"📝 Reason : {reason}")

        border()
        return True

    if response.status_code == 202:
        print()
        border()
        center("⏳ Vodafone قبلت الطلب للمعالجة", YELLOW)
        border("─")
        print("⚠️ الطلب قيد المعالجة.")
        print("لم يتم تأكيد اكتمال الشحن بشكل نهائي.")

        if code:
            print(f"🔢 Code   : {code}")

        if reason:
            print(f"📝 Reason : {reason}")

        border()
        return True

    title, message, action = get_error_info(code, reason)

    print()
    border()
    center(title, RED)
    border("─")
    print(message)
    print()
    print(f"📦 المنتج:")
    print(f"   {card['name']}")
    print()
    print(action)
    border("─")
    print("📡 HTTP Status:")
    print(f"   {response.status_code}")

    if code:
        print()
        print("🔢 Vodafone Code:")
        print(f"   {code}")

    if reason:
        print()
        print("📝 Vodafone Reason:")
        print(f"   {reason}")

    border()

    return False

def main():
    header()

    number, token = login()

    if not token:
        pause()
        return

    time.sleep(1)

    cards = get_cards()

    while True:
        header()

        border("─")
        center("✅ الحساب متصل", GREEN)
        center(f"📱 {number}", WHITE)
        border("─")

        show_cards(cards)

        print()

        choice = input(
            "🎯 اختر رقم الكرت [0 للخروج]: "
        ).strip()

        if choice == "0":
            print()
            border()
            center("👋 تم إنهاء البرنامج", CYAN)
            border()
            break

        if choice not in cards:
            print()
            center("❌ رقم غير صحيح", RED)
            time.sleep(1.5)
            continue

        card = cards[choice]

        header()
        show_details(card)

        print()
        center(
            "⚡ تنفيذ الطلب تلقائيًا...",
            YELLOW
        )

        time.sleep(0.7)

        charge_card(
            number,
            token,
            card
        )

        pause()

if __name__ == "__main__":
    try:
        main()

    except KeyboardInterrupt:
        print()
        border()
        center("⛔ تم إيقاف البرنامج", YELLOW)
        border()

    except Exception as e:
        print()
        border()
        center("❌ حدث خطأ غير متوقع", RED)
        border("─")
        print(f"📝 {e}")
        border()
        pause()
