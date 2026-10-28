import requests
import time
import xml.etree.ElementTree as ET
import urllib.parse
import hashlib
import base64
import json
import os

# ==========================================
# إعدادات ثابتة
# ==========================================
BASE_URL = "https://mab.etisalat.com.eg:11003"
DEVICE_ID = "b61c90c58c612671"

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

class EtisalatBot:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.owner_email = None
        self.owner_pass = None
        self.current_email = None
        self.current_dial = None
        self.owner_dial = None 
        self.child_dial = None
        self.owner_current_plan = "جاري الفحص..."
        self.base_headers = {
            "applicationVersion": "2", "applicationName": "MAB", "Accept": "text/xml",
            "Language": "ar", "APP-BuildNumber": "10744", "APP-Version": "36.1.0",
            "OS-Type": "Android", "OS-Version": "16", "APP-STORE": "GOOGLE",
            "C-Type": "WIFI", "Is-Corporate": "false", "User-Agent": "okhttp/5.0.0-alpha.11",
            "Content-Type": "text/xml; charset=UTF-8"
        }

    # دالة لترجمة اسم النظام للعربي
    def get_plan_name(self, plan_id):
        if not plan_id: return "غير معروف"
        if "Parent_7" in plan_id: return "حكاية ميكسات 270"
        if "Parent_6" in plan_id: return "حكاية ميكسات 180"
        if "Parent_5" in plan_id: return "حكاية ميكسات 240"
        if "Parent_8" in plan_id: return "حكاية ميكسات 52"
        return plan_id

    def draw_dashboard(self, cycle_count, target_mix, current_mix=0):
        clear_screen()
        print("╔" + "═"*56 + "╗")
        print("║" + " "*16 + "نظام أتمتة اتصالات" + " "*22 + "║")
        print("╠" + "═"*56 + "╣")

        owner_str = f"إيميل الأونر: {self.owner_email if self.owner_email else 'غير مسجل'}"
        print(f"║ {owner_str:<54} ║")

        dial_str = f"رقم الأونر: {self.owner_dial if self.owner_dial else 'غير معروف'}"
        print(f"║ {dial_str:<54} ║")

        plan_str = f"النظام الحالي: {self.owner_current_plan}"
        print(f"║ {plan_str:<54} ║")

        print("╠" + "═"*56 + "╣")

        cycle_str = f"الدورة الحالية: {cycle_count}"
        print(f"║ {cycle_str:<54} ║")

        target_str = f"الهدف المطلوب: {target_mix:,} ميكس"
        print(f"║ {target_str:<54} ║")

        if current_mix > 0:
            mix_str = f"الرصيد الحالي: {current_mix:,} ميكس"
            print(f"║ {mix_str:<54} ║")

        print("╚" + "═"*56 + "╝")
        print("\n[*] بدء العمليات...\n")

    def generate_signatures(self, url_path, body_xml):
        header_sig = hashlib.sha256(f"{url_path}{DEVICE_ID}".encode()).hexdigest()
        url_sig = hashlib.sha256(url_path.encode()).hexdigest()
        body_sig = hashlib.sha256(body_xml.encode()).hexdigest() if body_xml else ""
        return header_sig, url_sig, body_sig

    def login(self, email, password, is_owner=False, silent=False):
        if not silent:
            print(f"[*] جاري تسجيل الدخول للحساب: {email} ...")

        auth_b64 = base64.b64encode(f"{email}:{password}".encode()).decode()

        for attempt in range(3):
            headers = self.base_headers.copy()
            headers["Authorization"] = f"Basic {auth_b64}"

            login_xml = f"""<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><loginRequest><deviceId>{DEVICE_ID}</deviceId><firstLoginAttempt>true</firstLoginAttempt><modelType>CPH2737</modelType><osVersion>16</osVersion><platform>Android</platform><udid>{DEVICE_ID}</udid></loginRequest>"""
            url_path = "/Saytar/rest/authentication/loginWithPlan"

            h_sig, u_sig, b_sig = self.generate_signatures(url_path, login_xml)
            headers.update({"headerSignature": h_sig, "urlSignature": u_sig, "bodySignature": b_sig})

            try:
                response = self.session.post(BASE_URL + url_path, headers=headers, data=login_xml, timeout=10)
                if response.status_code == 200 and "<status>true</status>" in response.text:
                    self.auth_token = response.headers.get('auth')
                    if self.auth_token:
                        self.base_headers["auth"] = f"Bearer {self.auth_token}"
                        token_payload = self.auth_token.split('.')[1]
                        token_payload += '=' * (-len(token_payload) % 4)
                        decoded_payload = json.loads(base64.b64decode(token_payload))
                        self.current_dial = decoded_payload.get('selectedDial')
                        self.current_email = email

                        if is_owner:
                            self.owner_dial = self.current_dial
                        else:
                            self.child_dial = self.current_dial

                        if not silent:
                            print(f"[+] تم الدخول بنجاح! (الرقم: {self.current_dial})")
                        return True
            except Exception:
                time.sleep(2)

        if not silent:
            print(f"[-] فشل تسجيل الدخول بعد 3 محاولات.")
        return False

    def get_status_and_child(self, silent=False):
        xml_body = f"<dialAndLanguageRequest><segmentId>XRP</segmentId><subscriberNumber>{self.current_dial}</subscriberNumber><language>1</language><shortCode>ALFTL</shortCode></dialAndLanguageRequest>"
        encoded_req = urllib.parse.quote(xml_body)
        url_path = f"/Saytar/rest/servicemanagement/getGenericConsumptionsV2?requestParam={encoded_req}"
        headers = self.base_headers.copy()

        h_sig, u_sig, _ = self.generate_signatures(url_path, "")
        headers.update({"headerSignature": h_sig, "urlSignature": u_sig})

        try:
            response = self.session.get(BASE_URL + url_path, headers=headers, timeout=10)
            if response.status_code == 200:
                root = ET.fromstring(response.text)
                p_id = root.findtext('.//ratePlanConsumption/productId') or root.findtext('.//productId') or "غير معروف"

                main_mix = 0
                carried_mix = 0
                all_mix_candidates = []

                for c in root.iter('consumption'):
                    label = (c.findtext('consumedLabel') or c.findtext('remainingLabel') or '').strip()
                    oms = (c.findtext('remainingOmsName') or c.findtext('consumedOmsName') or '').strip()
                    unit = (c.findtext('remainingUnit') or c.findtext('totalUnit') or c.findtext('consumedUnit') or '').strip()
                    meter_type = (c.findtext('consumptionMeterType') or '').strip()

                    rem_str = c.findtext('remainingValue') or '0'
                    try:
                        rem_val = int(float(rem_str))
                    except Exception:
                        rem_val = 0

                    is_social = ('whatsapp' in oms.lower() or 'facebook' in oms.lower() or
                                 'فيسبوك' in label or 'واتساب' in label or 'انترنت' in label or 'vdsl' in oms.lower())
                    if is_social and 'ميكسات الباقة' not in label:
                        continue

                    is_mix = (
                        'ميكس' in unit or
                        'unit' in unit.lower() or
                        'xrp_units' in meter_type.lower() or
                        'GENERAL_UNIT' in oms or
                        'CARRIED_OVER' in oms or
                        'ميكسات' in label or
                        'ميكس' in label
                    )

                    if is_mix:
                        if 'GENERAL_UNIT' in oms or 'ميكسات الباقة الأساسية' in label or meter_type == 'xrp_units':
                            main_mix = max(main_mix, rem_val)
                        elif 'CARRIED_OVER' in oms or 'الميكسات المرحلة' in label:
                            carried_mix = max(carried_mix, rem_val)
                        all_mix_candidates.append(rem_val)

                if not all_mix_candidates:
                    for rm in root.findall('.//remainingValue'):
                        try:
                            v = int(float(rm.text or '0'))
                            if v > 0:
                                all_mix_candidates.append(v)
                        except Exception:
                            pass

                r_mix = main_mix if main_mix > 0 else (carried_mix if carried_mix > 0 else (max(all_mix_candidates) if all_mix_candidates else 0))

                child_number = None
                faf_list = root.findall('.//fafNumberList/fafNumber/value')
                for f in faf_list:
                    val = (f.text or '').strip()
                    clean_val = val.lstrip('20') if val.startswith('20') else val
                    clean_dial = self.current_dial.lstrip('20') if self.current_dial.startswith('20') else self.current_dial
                    if clean_val and clean_val != clean_dial:
                        child_number = clean_val
                return p_id, r_mix, child_number
        except Exception:
            pass
        return None, 0, None

    def change_plan(self, plan_name, plan_id=""):
        display_name = self.get_plan_name(plan_name)
        print(f"[*] جاري تغيير النظام إلى: {display_name} ...")

        xml_body = f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><migrateRequest><addonName></addonName><oMSRatePlan>true</oMSRatePlan><operation>FULL_MIGRATE</operation><productName>{plan_name}</productName><ratePlanID>{plan_id}</ratePlanID><subscriberNumber>{self.current_dial}</subscriberNumber></migrateRequest>"
        url_path = "/Saytar/rest/HekayaPartial/migrate"
        headers = self.base_headers.copy()
        h_sig, u_sig, b_sig = self.generate_signatures(url_path, xml_body)
        headers.update({"headerSignature": h_sig, "urlSignature": u_sig, "bodySignature": b_sig})

        try:
            response = self.session.post(BASE_URL + url_path, headers=headers, data=xml_body, timeout=10)
            return response.status_code == 200 and "<status>true</status>" in response.text
        except:
            return False

    def renew_bundle_action(self, plan_name, amount):
        display_name = self.get_plan_name(plan_name)
        print(f"[*] جاري إرسال حركة تنشيطية لنظام {display_name}...")

        xml_body = f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><generalSubmitOrderRequest><msisdn>{self.current_dial}</msisdn><operation>FULL_RENEW</operation><parameters /><paymentOptions><paymentOption><amount>{amount}</amount><optionID>BALANCE</optionID></paymentOption></paymentOptions><productName>{plan_name}</productName><requestId>ALFA_PAYMENT_OPTIONS</requestId></generalSubmitOrderRequest>"
        url_path = "/Saytar/rest/General/submitOrder"
        headers = self.base_headers.copy()
        h_sig, u_sig, b_sig = self.generate_signatures(url_path, xml_body)
        headers.update({"headerSignature": h_sig, "urlSignature": u_sig, "bodySignature": b_sig})

        try:
            self.session.post(BASE_URL + url_path, headers=headers, data=xml_body, timeout=10)
            print("[+] تم إرسال الحركة التنشيطية.")
        except:
            print("[-] فشل إرسال الحركة التنشيطية.")

    def transfer_mix(self, receiver_number, quota_amount, product_name):
        quota = int(quota_amount)
        print(f"[*] جاري تحويل {quota:,} ميكس ...")
        xml_body = f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><newFamilyTransferRequest><distribute>false</distribute><msisdn>{self.current_dial}</msisdn><productName>{product_name}</productName><quota>{quota}</quota><receiverMsisdn>{receiver_number}</receiverMsisdn><senderMsisdn>{self.current_dial}</senderMsisdn><type>UNITS</type></newFamilyTransferRequest>"
        url_path = "/Saytar/rest/services/newTransfer/v2"
        headers = self.base_headers.copy()
        h_sig, u_sig, b_sig = self.generate_signatures(url_path, xml_body)
        headers.update({"headerSignature": h_sig, "urlSignature": u_sig, "bodySignature": b_sig})

        try:
            response = self.session.post(BASE_URL + url_path, headers=headers, data=xml_body, timeout=10)
            return response.status_code == 200 and "<status>true</status>" in response.text
        except:
            return False

    def auto_loop(self):
        clear_screen()
        print("="*50)
        print("=== إعداد الدورة التلقائية ===")
        self.owner_email = input("أدخل إيميل الأونر: ").strip()
        self.owner_pass = input("أدخل باسورد الأونر: ").strip()
        child_email = input("أدخل إيميل الفرد: ").strip()
        child_pass = input("أدخل باسورد الفرد: ").strip()

        clear_screen()
        print("="*50)
        print("=== اختر هدف الميكسات (Target) ===")
        print("1. 50,000 ميكس")
        print("2. 100,000 ميكس")
        print("3. 150,000 ميكس")
        print("4. 200,000 ميكس")
        print("5. إدخال رقم يدوي")

        choice = input("\nاختر رقم الهدف: ").strip()
        if choice == '1': target_mix = 50000
        elif choice == '2': target_mix = 100000
        elif choice == '3': target_mix = 150000
        elif choice == '4': target_mix = 200000
        else:
            while True:
                try:
                    target_mix = int(input("أدخل الرقم يدوياً: ").strip())
                    if target_mix > 0: break
                except ValueError:
                    print("[-] يرجى إدخال رقم صحيح.")

        print("\n[*] جاري تسجيل الدخول...")
        if not self.login(self.owner_email, self.owner_pass, is_owner=True): return

        # 1. تجهيز النظام
        clear_screen()
        print("[*] جاري فحص نظام الأونر...")
        plan_id, mix_amount, _ = self.get_status_and_child(silent=True)

        if not plan_id:
            plan_id = "Unknown"

        self.owner_current_plan = self.get_plan_name(plan_id)

        # لو النظام مش 270 أو 180، نحوله لـ 270
        if "Parent_7" not in plan_id and "Parent_6" not in plan_id:
            print(f"[!] النظام الحالي هو ({self.owner_current_plan}). جاري تحويله لـ 270 لدعم العيلة...")
            self.change_plan("Hekaya_XRP_MIX_Parent_7") 

            print("[*] في انتظار السيرفر لتأكيد تغيير النظام...")
            while True:
                time.sleep(3)
                new_plan_id, _, _ = self.get_status_and_child(silent=True)
                if new_plan_id and "Parent_7" in new_plan_id:
                    self.owner_current_plan = self.get_plan_name(new_plan_id)
                    print(f"[+] تم تأكيد تغيير النظام بنجاح إلى: {self.owner_current_plan}")
                    plan_id = new_plan_id
                    break

        # 2. فحص وإضافة الفرد
        print("\n[*] جاري التحقق من وجود الفرد...")
        _, _, existing_child = self.get_status_and_child(silent=True)
        if not existing_child:
            print("\n[!] تنبيه: لا يوجد فرد مضاف في العيلة.")
            add_choice = input("هل تريد إضافة فرد الآن؟ (y/n): ").strip().lower()
            if add_choice == 'y':

                # 1. تفعيل الأونر الأول
                self.renew_bundle_action("Hekaya_XRP_MIX_Parent_7", "270") 
                time.sleep(3) 

                # 2. تسجيل دخول الفرد وتفعيله
                print("\n[*] جاري تسجيل الدخول للفرد لتفعيل حسابه قبل الدعوة...")
                self.session = requests.Session()
                if self.login(child_email, child_pass, silent=True):
                    child_plan_id, _, _ = self.get_status_and_child(silent=True)
                    if "Parent_7" in child_plan_id:
                        self.renew_bundle_action("Hekaya_XRP_MIX_Parent_7", "270")
                    else:
                        self.renew_bundle_action("Hekaya_XRP_MIX_Parent_6", "180")
                    time.sleep(3)
                else:
                    print("[-] فشل تسجيل الدخول للفرد.")
                    return

                # 3. الرجوع للأونر عشان نبعت الدعوة
                self.session = requests.Session()
                self.login(self.owner_email, self.owner_pass, is_owner=True, silent=True)

                new_child = input("أدخل رقم الفرد اللي عايز تضيفه: ").strip()

                attempts = 0
                while attempts < 3:
                    attempts += 1
                    def add_child_temp():
                        if new_child.startswith("0"): child_intl = "20" + new_child[1:]
                        else: child_intl = new_child
                        print(f"[*] جاري إرسال دعوة لإضافة الرقم {child_intl} (محاولة {attempts})...")
                        xml_body = f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><addChildRequest><childNumber>{child_intl}</childNumber><childPercentage>0.10</childPercentage><productId>Hekaya_XRP_MIX_Parent_7</productId><subscriberNumber>{self.current_dial}</subscriberNumber></addChildRequest>"
                        url_path = "/Saytar/rest/services/addChild"
                        headers = self.base_headers.copy()
                        h_sig, u_sig, b_sig = self.generate_signatures(url_path, xml_body)
                        headers.update({"headerSignature": h_sig, "urlSignature": u_sig, "bodySignature": b_sig})
                        try:
                            r = self.session.post(BASE_URL + url_path, headers=headers, data=xml_body)
                            return r.status_code == 200 and "<status>true</status>" in r.text
                        except: return False

                    if add_child_temp():
                        print("\n[+] تم إرسال الدعوة بنجاح!")
                        print("[*] جاري الدخول للفرد وتحديث البيانات لقبول الدعوة...")

                        self.session = requests.Session()
                        if self.login(child_email, child_pass, silent=True):
                            self.renew_bundle_action("Hekaya_XRP_MIX_Parent_7", "270")
                            time.sleep(3)

                        self.session = requests.Session()
                        self.login(self.owner_email, self.owner_pass, is_owner=True, silent=True)
                        _, _, check_child = self.get_status_and_child(silent=True)

                        if check_child:
                            print(f"[+] مبروك! تم تأكيد إضافة الفرد: {check_child}")
                            break
                        else:
                            print("[-] الدعوة لم يتم تأكيدها بعد (السيرفر لسه بيحدث).")
                    else:
                        print("[-] فشل إرسال الدعوة. جاري المحاولة بعد 5 ثواني...")
                        time.sleep(5)

                if attempts >= 3:
                    print("\n[!] فشلت محاولات إضافة الفرد تلقائياً.")
                    print("[!] يرجى الدخول على تطبيق My Etisalat من جهاز الفرد لقبول الدعوة يدوياً.")
                    input("اضغط Enter بعد قبول الدعوة من الموبايل...")

                    self.session = requests.Session()
                    self.login(self.owner_email, self.owner_pass, is_owner=True, silent=True)
                    _, _, check_child = self.get_status_and_child(silent=True)
                    if not check_child:
                         print("[-] الفرد لم يضف. الخروج...")
                         return
                    else:
                        print("[+] مبروك! تم رصد الفرد بعد القبول اليدوي.")
            else:
                return

        # 3. الدورات
        cycle_count = 1

        while True:
            plan_id, mix_amount, child_num = self.get_status_and_child(silent=True)

            if not plan_id: # حماية لو السيرفر رجع فاضي
                time.sleep(3)
                continue

            self.owner_current_plan = self.get_plan_name(plan_id)
            owner_plan_name = plan_id

            self.draw_dashboard(cycle_count, target_mix, mix_amount)

            if not child_num:
                print("[-] مفيش فرد مضاف!")
                break

            if mix_amount >= target_mix:
                print("\n" + "="*50)
                print(f"[🎉] مبروك! تم الوصول للهدف: {mix_amount:,} ميكس.")
                print("="*50)
                ask_new = input("هل تريد بدء عملية جديدة (هدف جديد)؟ (y/n): ").strip().lower()
                if ask_new != 'y': return
                else: break

            print("-" * 40)
            self.renew_bundle_action(owner_plan_name, "270" if "7" in owner_plan_name else "180")
            time.sleep(3) 

            print("-" * 40)
            _, new_mix, _ = self.get_status_and_child(silent=True)

            if new_mix > 0:
                if not self.transfer_mix(child_num, new_mix, owner_plan_name):
                    print("\n[!] خطأ فادح: فشل تحويل ميكسات الأونر للفرد!")
                    print("[!] تم إيقاف الدورة لحماية الميكسات من الضياع.")
                    time.sleep(20) 
                    continue 
            else:
                print("[*] الأونر ليس لديه ميكسات حالياً. جاري فحص الفرد...")
                self.session = requests.Session() 
                if self.login(child_email, child_pass, silent=True):
                    _, child_mix, _ = self.get_status_and_child(silent=True)
                    if child_mix > 0:
                        print(f"[+] الفرد لديه ({child_mix:,}) ميكس. سيكمل السكريبت خطواته.")
                    else:
                        print("[-] الفرد أيضاً ليس لديه ميكسات. إيقاف الدورة لحماية النظام.")
                        time.sleep(20)
                        continue
                self.session = requests.Session()
                self.login(self.owner_email, self.owner_pass, is_owner=True, silent=True)

            time.sleep(2)

            print("-" * 40)
            if "7" in owner_plan_name:
                target_plan_id = "Hekaya_XRP_MIX_Parent_6"
                target_plan_display = "حكاية ميكسات 180"
                self.change_plan(target_plan_id, "951")
            else:
                target_plan_id = "Hekaya_XRP_MIX_Parent_7"
                target_plan_display = "حكاية ميكسات 270"
                self.change_plan(target_plan_id, "")

            print(f"[*] في انتظار تحديث السيرفر (ممكن ياخد وقت)...")
            poll_attempt = 0
            while poll_attempt < 60:
                time.sleep(2.5) 
                poll_attempt += 1
                current_p_id, current_mix, _ = self.get_status_and_child(silent=True)

                if current_p_id and target_plan_id in current_p_id:
                    print(f"[+] السيرفر استجاب وتأكد تغيير النظام! (النظام: {target_plan_display} | الميكسات: {current_mix:,})")
                    break

                if poll_attempt % 10 == 0:
                    print(f"[*] تنشيط ذكي للسيرفر (محاولة {poll_attempt}/60): إعادة إرسال طلب الترحيل...")
                    try:
                        self.login(self.owner_email, self.owner_pass, is_owner=True, silent=True)
                        rate_id = "951" if "6" in target_plan_id else ""
                        self.change_plan(target_plan_id, rate_id)
                    except Exception:
                        pass

            print("-" * 40)
            self.session = requests.Session() 
            if not self.login(child_email, child_pass, silent=True): 
                print("[-] فشل الدخول للفرد.")
                break

            _, child_mix, _ = self.get_status_and_child(silent=True)
            print(f"[+] حالة الفرد | الميكسات: {child_mix:,}")

            if child_mix > 0:
                if not self.transfer_mix(self.owner_dial, child_mix, "Hekaya_XRP_MIX_Child_1"):
                    print("[-] فشل تحويل ميكسات الفرد!")

            print("-" * 40)
            self.session = requests.Session()
            if not self.login(self.owner_email, self.owner_pass, is_owner=True, silent=True): break

            _, final_mix, _ = self.get_status_and_child(silent=True)
            print(f"[+] رجعنا للأونر | رصيده الآن: {final_mix:,}")

            cycle_count += 1
            print(f"\n[*] استراحة 20 ثانية...")
            time.sleep(20)

if __name__ == "__main__":
    bot = EtisalatBot()
    bot.auto_loop()
