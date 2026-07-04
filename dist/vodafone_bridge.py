#!/usr/bin/env python3
"""
Vodafone Fakka Bridge Server
============================
شغّل السكريبت ده على موبايلك وانت على بيانات فودافون.
الموقع هيتصل بيه تلقائياً ويعمل الشحن من خلاله.

التثبيت:
    pip install requests flask flask-cors

التشغيل:
    python vodafone_bridge.py

بعدين افتح الموقع وهتلاقي إنه اتصل بالجسر تلقائياً ✅
"""

import requests
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
# السماح للموقع بالاتصال من أي مصدر
CORS(app, resources={r"/*": {"origins": "*"}})

PORT = 8765

DEVICE_HEADERS = {
    'User-Agent': 'okhttp/4.11.0',
    'Connection': 'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'x-dynatrace': 'MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21317_157',
    'x-agent-operatingsystem': '13',
    'clientId': 'AnaVodafoneAndroid',
    'Accept-Language': 'ar',
    'x-agent-device': 'OPPO CPH2235',
    'x-agent-version': '2024.7.2.1',
    'x-agent-build': '1050',
    'digitalId': '24S0M31T0I9RK',
}


@app.route('/ping', methods=['GET', 'OPTIONS'])
def ping():
    """فحص أن الجسر شغال"""
    return jsonify({"ok": True, "msg": "Vodafone Bridge Active ✅"})


@app.route('/charge', methods=['POST', 'OPTIONS'])
def charge():
    """تنفيذ عملية الشحن"""
    if request.method == 'OPTIONS':
        return jsonify({"ok": True})

    data = request.get_json()
    product_id = data.get('product_id')
    receiver   = data.get('receiver')
    pin        = data.get('pin')
    sender     = data.get('sender')  # رقم المحفظة (للتحقق فقط)

    if not all([product_id, receiver, pin]):
        return jsonify({"success": False, "error": "بيانات غير مكتملة"}), 400

    # ── خطوة 1: seamless token ──
    try:
        r = requests.get(
            'http://mobile.vodafone.com.eg/checkSeamless/realms/vf-realm/protocol/openid-connect/auth?client_id=ana-vodafone-app-seamless',
            headers=DEVICE_HEADERS,
            timeout=10
        )
        seamless_data = r.json()
        seamless_token = seamless_data.get('seamlessToken')
        sender_msisdn  = seamless_data.get('msisdn')
    except Exception as e:
        return jsonify({"success": False, "error": f"فشل الاتصال بفودافون: {str(e)}"}), 502

    if not seamless_token:
        return jsonify({
            "success": False,
            "error": "فشل seamless — تأكد إن بيانات الموبايل شغالة على خط فودافون كاش"
        }), 502

    # ── خطوة 2: access token ──
    try:
        token_headers = {
            **DEVICE_HEADERS,
            'Accept': 'application/json, text/plain, */*',
            'silentLogin': 'true',
            'seamlessToken': seamless_token,
            'firstTimeLogin': 'true',
            'x-dynatrace': 'MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_21520_165',
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        token_payload = {
            'grant_type': 'password',
            'client_secret': 'b86e30a8-ae29-467a-a71f-65c73f2ff5e3',
            'client_id': 'cash-app',
        }
        r2 = requests.post(
            'https://mobile.vodafone.com.eg/auth/realms/vf-realm/protocol/openid-connect/token',
            data=token_payload,
            headers=token_headers,
            timeout=15
        )
        access_token = r2.json().get('access_token')
    except Exception as e:
        return jsonify({"success": False, "error": f"فشل المصادقة: {str(e)}"}), 502

    if not access_token:
        return jsonify({"success": False, "error": "فشل الحصول على access token — الرقم السري غير صحيح"}), 502

    msisdn_str = str(sender_msisdn)
    formatted  = msisdn_str if msisdn_str.startswith('0') else f'0{msisdn_str}'

    # ── خطوة 3: productOrder ──
    try:
        order_payload = {
            "channel": {"name": "MobileApp"},
            "orderItem": [{
                "action": "insert",
                "id": product_id,
                "product": {
                    "characteristic": [
                        {"name": "PaymentMethod", "value": "VFCash"},
                        {"name": "USE_EMONEY",    "value": "False"},
                        {"name": "MerchantCode",  "value": ""},
                    ],
                    "id": product_id,
                    "relatedParty": [
                        {"id": msisdn_str, "name": "MSISDN",   "role": "Subscriber"},
                        {"id": receiver,   "name": "Receiver", "role": "Receiver"},
                    ],
                },
                "@type": product_id,
                "eCode": 0,
            }],
            "relatedParty": [{"id": pin, "name": "pin", "role": "Requestor"}],
            "@type": "CashFakkaAndMared",
        }
        order_headers = {
            **DEVICE_HEADERS,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'api-host': 'ProductOrderingManagement',
            'useCase': 'CashFakkaAndMared',
            'x-dynatrace': 'MT_3_5_2386790616_1-0_a556db1b-4506-43f3-854a-1d2527767923_0_2_160',
            'api-version': 'v2',
            'msisdn': formatted,
            'Authorization': f'Bearer {access_token}',
        }
        r3 = requests.post(
            'https://mobile.vodafone.com.eg/services/dxl/pom/productOrder',
            data=json.dumps(order_payload),
            headers=order_headers,
            timeout=20
        )
        result = r3.json()
    except Exception as e:
        return jsonify({"success": False, "error": f"فشل طلب الشحن: {str(e)}"}), 502

    if result.get('state') == 'Completed' or result.get('complete'):
        return jsonify({"success": True, "message": "✅ تم الشحن بنجاح!"})

    raw_err = str(result.get('message') or result.get('description') or result.get('error') or '')
    friendly = 'فشل الطلب — تحقق من رصيدك وبيانات المحفظة'
    if 'insufficient' in raw_err.lower() or 'رصيد' in raw_err:
        friendly = '❌ رصيد محفظتك غير كافٍ'
    elif 'pin' in raw_err.lower() or 'password' in raw_err.lower():
        friendly = '❌ الرقم السري للمحفظة غير صحيح'
    elif raw_err:
        friendly = f'❌ {raw_err}'

    return jsonify({"success": False, "error": friendly}), 422


if __name__ == '__main__':
    print(f"""
╔══════════════════════════════════════════╗
║   Vodafone Fakka Bridge  — Port {PORT}     ║
║   شغّال ✅  — افتح الموقع دلوقتي          ║
╚══════════════════════════════════════════╝
""")
    app.run(host='0.0.0.0', port=PORT, debug=False)
