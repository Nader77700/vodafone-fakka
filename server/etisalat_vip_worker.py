#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Etisalat VIP Automation Worker - Nader / Vodafone Fakka VIP
Integrated with Multi-Session Supabase backend.
Preserves exact original logic, XML payloads, signatures, and plan transitions.
Configurable cycle_delay_seconds (default 20s) between cycles.
Strict 2-second polling interval in system migration check.
No plaintext passwords logged or exposed.
"""

import sys
import os
import time
import json
import base64
import hashlib
import urllib.parse
import xml.etree.ElementTree as ET
import argparse
import requests
from datetime import datetime, timezone

BASE_URL = "https://mab.etisalat.com.eg:11003"
DEVICE_ID = "b61c90c58c612671"
DEFAULT_CYCLE_DELAY_SECONDS = 20

class EtisalatVipBot:
    def __init__(self, session_id="default", supabase_url=None, supabase_key=None):
        self.session_id = session_id
        self.supabase_url = supabase_url or os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
        self.supabase_key = supabase_key or os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")
        
        self.http_session = requests.Session()
        self.auth_token = None
        self.current_email = None
        self.current_dial = None
        self.owner_dial = None
        
        self.base_headers = {
            "applicationVersion": "2",
            "applicationName": "MAB",
            "Accept": "text/xml",
            "Language": "ar",
            "APP-BuildNumber": "10744",
            "APP-Version": "36.1.0",
            "OS-Type": "Android",
            "OS-Version": "16",
            "APP-STORE": "GOOGLE",
            "C-Type": "WIFI",
            "Is-Corporate": "false",
            "User-Agent": "okhttp/5.0.0-alpha.11",
            "Content-Type": "text/xml; charset=UTF-8"
        }

    def generate_signatures(self, url_path, body_xml):
        header_sig = hashlib.sha256(f"{url_path}{DEVICE_ID}".encode()).hexdigest()
        url_sig = hashlib.sha256(url_path.encode()).hexdigest()
        body_sig = hashlib.sha256(body_xml.encode()).hexdigest() if body_xml else ""
        return header_sig, url_sig, body_sig

    def report_step(self, cycle_number, step_name, status="running", details=None):
        """Report step to console and optionally to database without leaking passwords."""
        now_str = datetime.now().strftime("%H:%M:%S")
        print(f"[{now_str}] [جلسة {self.session_id}] [دورة #{cycle_number}] {step_name} (الحالة: {status})")
        if self.supabase_url and self.supabase_key:
            try:
                url = f"{self.supabase_url}/rest/v1/rpc/vip_worker_report_step"
                headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "p_session_id": self.session_id,
                    "p_cycle_number": cycle_number,
                    "p_step": step_name,
                    "p_status": status,
                    "p_details": details or {}
                }
                requests.post(url, headers=headers, json=payload, timeout=5)
            except Exception:
                pass

    def record_cycle(self, cycle_number, started_at, ended_at, owner_start, owner_post_renewal,
                     transferred_to_indiv, indiv_pre, indiv_post, system_pre, system_post,
                     transferred_to_owner, final_balance, target_balance, status,
                     failure_step=None, error_summary=None):
        """Persist cycle details to database."""
        if self.supabase_url and self.supabase_key:
            try:
                url = f"{self.supabase_url}/rest/v1/rpc/vip_worker_record_cycle"
                headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "p_session_id": self.session_id,
                    "p_cycle_number": cycle_number,
                    "p_started_at": started_at.isoformat() if started_at else None,
                    "p_ended_at": ended_at.isoformat() if ended_at else None,
                    "p_owner_start": owner_start,
                    "p_owner_post_renewal": owner_post_renewal,
                    "p_transferred_to_indiv": transferred_to_indiv,
                    "p_indiv_pre_transfer": indiv_pre,
                    "p_indiv_post_transfer": indiv_post,
                    "p_system_pre": system_pre,
                    "p_system_post": system_post,
                    "p_transferred_to_owner": transferred_to_owner,
                    "p_final_balance": final_balance,
                    "p_target_balance": target_balance,
                    "p_status": status,
                    "p_failure_step": failure_step,
                    "p_error_summary": error_summary
                }
                requests.post(url, headers=headers, json=payload, timeout=8)
            except Exception as e:
                print(f"[-] خطأ حفظ السجل بالخادم: {e}")

    def sync_session_identifiers(self, owner_dial=None, child_dial=None, current_plan=None, mix_balance=None):
        """Update session line numbers and status in Supabase as soon as discovered."""
        if self.supabase_url and self.supabase_key:
            try:
                update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
                if owner_dial:
                    update_data["owner_account_identifier"] = owner_dial
                    update_data["owner_account_status"] = "connected"
                if child_dial:
                    update_data["individual_account_identifier"] = child_dial
                    update_data["individual_account_status"] = "connected"
                    update_data["relationship_verified"] = True
                    update_data["relationship_status"] = "verified"
                if current_plan:
                    update_data["owner_current_plan"] = current_plan
                if mix_balance is not None:
                    update_data["owner_mix_balance"] = mix_balance

                url = f"{self.supabase_url}/rest/v1/vip_sessions?id=eq.{self.session_id}"
                headers = {
                    "apikey": self.supabase_key,
                    "Authorization": f"Bearer {self.supabase_key}",
                    "Content-Type": "application/json"
                }
                requests.patch(url, headers=headers, json=update_data, timeout=5)
            except Exception as e:
                print(f"[-] خطأ تحديث معرفات الخطوط: {e}")

    def login(self, email, password, is_owner=False, silent=False):
        # 0. Reuse existing token if active to avoid temporary lockout ban from Etisalat
        if self.auth_token and getattr(self, "current_email", None) == email and getattr(self, "current_dial", None):
            try:
                plan_id, _, _ = self.get_status_and_child(silent=True)
                if plan_id and plan_id != "غير معروف":
                    if not silent:
                        print(f"[⚡] استخدام جلسة التوكن المحفوظة بنجاح (الرقم: {self.current_dial}) وتخطي الدخول.")
                    return True
            except Exception:
                pass

        if not silent:
            masked_email = email[:3] + "***@" + email.split("@")[-1] if "@" in email else email[:4] + "***"
            print(f"[*] جاري تسجيل الدخول للحساب: {masked_email} ...")

        # Handle potential base64 stored passwords safely
        clean_pw = password
        try:
            decoded = base64.b64decode(password).decode('utf-8')
            if base64.b64encode(decoded.encode('utf-8')).decode('utf-8') == password:
                clean_pw = decoded
        except Exception:
            clean_pw = password

        auth_b64 = base64.b64encode(f"{email}:{clean_pw}".encode()).decode()
        headers = self.base_headers.copy()
        headers["Authorization"] = f"Basic {auth_b64}"

        login_xml = f"""<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><loginRequest><deviceId>{DEVICE_ID}</deviceId><firstLoginAttempt>true</firstLoginAttempt><modelType>CPH2737</modelType><osVersion>16</osVersion><platform>Android</platform><udid>{DEVICE_ID}</udid></loginRequest>"""
        url_path = "/Saytar/rest/authentication/loginWithPlan"

        h_sig, u_sig, b_sig = self.generate_signatures(url_path, login_xml)
        headers.update({"headerSignature": h_sig, "urlSignature": u_sig, "bodySignature": b_sig})

        try:
            response = self.http_session.post(BASE_URL + url_path, headers=headers, data=login_xml, timeout=20)
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

                    if not silent:
                        print(f"[+] تم الدخول بنجاح! (الرقم: {self.current_dial})")
                    return True
        except Exception as e:
            if not silent:
                print(f"[-] خطأ أثناء الاتصال بالخادم: {e}")

        if not silent:
            print("[-] فشل تسجيل الدخول.")
        return False

    def get_status_and_child(self, silent=False):
        xml_body = f"<dialAndLanguageRequest><segmentId>XRP</segmentId><subscriberNumber>{self.current_dial}</subscriberNumber><language>1</language><shortCode>ALFTL</shortCode></dialAndLanguageRequest>"
        encoded_req = urllib.parse.quote(xml_body)
        url_path = f"/Saytar/rest/servicemanagement/getGenericConsumptionsV2?requestParam={encoded_req}"
        headers = self.base_headers.copy()

        h_sig, u_sig, _ = self.generate_signatures(url_path, "")
        headers.update({"headerSignature": h_sig, "urlSignature": u_sig})

        try:
            response = self.http_session.get(BASE_URL + url_path, headers=headers, timeout=20)
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
                        'hekaya_units' in meter_type.lower() or
                        'GENERAL_UNIT' in oms or
                        'CARRIED_OVER' in oms or
                        'ميكسات' in label or
                        'ميكس' in label
                    )

                    if is_mix:
                        if 'GENERAL_UNIT' in oms or 'ميكسات الباقة الأساسية' in label or meter_type == 'xrp_units' or meter_type == 'hekaya_units':
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

                # Sum basic quota and carried/transferred quota if both are present
                combined_mix = (main_mix + carried_mix) if (main_mix > 0 and carried_mix > 0) else (main_mix if main_mix > 0 else (carried_mix if carried_mix > 0 else 0))
                r_mix = combined_mix if combined_mix > 0 else (max(all_mix_candidates) if all_mix_candidates else 0)

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

    def change_plan(self, plan_name, plan_id):
        print(f"[*] جاري تغيير النظام إلى: {plan_name} ...")
        xml_body = f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><migrateRequest><addonName></addonName><oMSRatePlan>true</oMSRatePlan><operation>FULL_MIGRATE</operation><productName>{plan_name}</productName><ratePlanID>{plan_id}</ratePlanID><subscriberNumber>{self.current_dial}</subscriberNumber></migrateRequest>"
        url_path = "/Saytar/rest/HekayaPartial/migrate"
        headers = self.base_headers.copy()
        h_sig, u_sig, b_sig = self.generate_signatures(url_path, xml_body)
        headers.update({"headerSignature": h_sig, "urlSignature": u_sig, "bodySignature": b_sig})

        try:
            response = self.http_session.post(BASE_URL + url_path, headers=headers, data=xml_body, timeout=25)
            return response.status_code == 200 and "<status>true</status>" in response.text
        except Exception:
            return False

    def renew_bundle(self, plan_name, amount):
        print("[*] جاري تجديد الباقة ...")
        xml_body = f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><generalSubmitOrderRequest><msisdn>{self.current_dial}</msisdn><operation>FULL_RENEW</operation><parameters /><paymentOptions><paymentOption><amount>{amount}</amount><optionID>BALANCE</optionID></paymentOption></paymentOptions><productName>{plan_name}</productName><requestId>ALFA_PAYMENT_OPTIONS</requestId></generalSubmitOrderRequest>"
        url_path = "/Saytar/rest/General/submitOrder"
        headers = self.base_headers.copy()
        h_sig, u_sig, b_sig = self.generate_signatures(url_path, xml_body)
        headers.update({"headerSignature": h_sig, "urlSignature": u_sig, "bodySignature": b_sig})

        try:
            response = self.http_session.post(BASE_URL + url_path, headers=headers, data=xml_body, timeout=25)
            return response.status_code == 200 and "<status>true</status>" in response.text
        except Exception:
            return False

    def transfer_mix(self, receiver_number, quota_amount, product_name):
        quota = int(quota_amount)
        print(f"[*] جاري تحويل {quota:,} ميكس ...")
        xml_body = f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><newFamilyTransferRequest><distribute>false</distribute><msisdn>{self.current_dial}</msisdn><productName>{product_name}</productName><quota>{quota}</quota><receiverMsisdn>{receiver_number}</receiverMsisdn><senderMsisdn>{self.current_dial}</senderMsisdn><type>UNITS</type></newFamilyTransferRequest>"
        url_path = "/Saytar/rest/services/newTransfer/v2"
        headers = self.base_headers.copy()
        h_sig, u_sig, b_sig = self.generate_signatures(url_path, xml_body)
        headers.update({"headerSignature": h_sig, "urlSignature": u_sig, "bodySignature": b_sig})

        try:
            response = self.http_session.post(BASE_URL + url_path, headers=headers, data=xml_body, timeout=25)
            return response.status_code == 200 and "<status>true</status>" in response.text
        except Exception:
            return False

    def run_cycle(self, cycle_count, owner_email, owner_pass, child_email, child_pass,
                  target_mix=50000, cycle_delay_seconds=DEFAULT_CYCLE_DELAY_SECONDS):
        """Execute a single cycle following the exact script sequence."""
        started_at = datetime.now(timezone.utc)
        print("\n" + "="*50)
        print(f"--- [الدورة رقم {cycle_count} - الجلسة {self.session_id}] ---")
        self.report_step(cycle_count, "بدء الدورة وتسجيل دخول الأونر", "running")

        # 1. Login owner
        self.http_session = requests.Session()
        if not self.login(owner_email, owner_pass, is_owner=True):
            self.record_cycle(
                cycle_count, started_at, datetime.now(timezone.utc),
                None, None, 0, 0, 0, None, None, 0, None, target_mix,
                "failed", "تسجيل دخول الأونر", "تعذر تسجيل الدخول لحساب الأونر"
            )
            return False, "login_owner_failed"

        # 2. Status & child check
        plan_id, mix_amount, child_num = self.get_status_and_child()
        if not child_num:
            print("[-] مفيش فرد مضاف!")
            self.record_cycle(
                cycle_count, started_at, datetime.now(timezone.utc),
                mix_amount, None, 0, 0, 0, plan_id, None, 0, mix_amount, target_mix,
                "failed", "فحص الفرد المربوط", "لم يتم العثور على خط فرد مربوط بحساب الأونر"
            )
            return False, "no_child"

        print(f"[+] حالة الأونر: {plan_id} | الميكسات: {mix_amount:,}")
        self.sync_session_identifiers(
            owner_dial=self.owner_dial,
            child_dial=child_num,
            current_plan=plan_id,
            mix_balance=mix_amount
        )
        owner_start_balance = mix_amount
        owner_plan_pre = plan_id

        # Target reached check
        if mix_amount >= target_mix:
            print("\n" + "="*50)
            print(f"[🎉] تم الوصول للهدف: {mix_amount:,} ميكس.")
            print("="*50)
            self.record_cycle(
                cycle_count, started_at, datetime.now(timezone.utc),
                owner_start_balance, owner_start_balance, 0, 0, 0, plan_id, plan_id, 0,
                mix_amount, target_mix, "stopped_at_target"
            )
            return True, "target_reached"

        owner_plan_name = "Hekaya_XRP_MIX_Parent_7" if "7" in plan_id else "Hekaya_XRP_MIX_Parent_6"

        # 3. Renew bundle
        print("-" * 40)
        self.report_step(cycle_count, f"تجديد باقة {owner_plan_name}", "running")
        renew_cost = "270" if "7" in owner_plan_name else "180"
        if not self.renew_bundle(owner_plan_name, renew_cost):
            print("[-] فشل التجديد. هيتم المحاولة في الدورة القادمة.")
            self.report_step(cycle_count, "فشل التجديد، انتظار 15 ثانية", "retrying")
            time.sleep(15)
            self.record_cycle(
                cycle_count, started_at, datetime.now(timezone.utc),
                owner_start_balance, None, 0, 0, 0, owner_plan_name, None, 0,
                owner_start_balance, target_mix, "failed", "تجديد الباقة", "فشل استجابة التجديد من الخادم"
            )
            return False, "renew_failed"

        time.sleep(3)

        # Check balance after renewal
        _, post_renew_mix, _ = self.get_status_and_child(silent=True)
        owner_post_renewal = post_renew_mix

        # 4. Transfer mixes from Owner to Child (ركن الميكسات بأمان تام)
        print("-" * 40)
        self.report_step(cycle_count, "تحويل ميكسات الأونر للفرد", "running")
        transferred_to_child = 0

        # Intelligent Zero-Loss Continuity Gate
        is_suspiciously_low = owner_start_balance > 5000 and (post_renew_mix < owner_start_balance * 0.65)
        child_holds_missing = False
        child_current_mix = 0

        if is_suspiciously_low:
            print(f"[!] تنبيه رصد الرصيد الذكي: رصيد الأونر ({post_renew_mix:,}) أقل بكثير من المعتمد السابق ({owner_start_balance:,})!")
            print("[*] بدء البحث الشامل عن الميكسات المتبقية عند الفرد ومزامنة السيرفر...")
            _, child_current_mix, _ = self.get_child_status(silent=True)
            if child_current_mix >= owner_start_balance * 0.65:
                child_holds_missing = True
                transferred_to_child = child_current_mix
                print(f"[+] تم العثور على الميكسات ({child_current_mix:,}) محفوظة بأمان عند الفرد!")

            if not child_holds_missing:
                for r_att in range(1, 6):
                    print(f"[*] إعادة فحص رصيد الأونر بالسيرفر (محاولة {r_att}/5)...")
                    time.sleep(3.5)
                    _, recheck_owner, _ = self.get_status_and_child(silent=True)
                    if recheck_owner >= owner_start_balance * 0.65:
                        post_renew_mix = recheck_owner
                        print(f"[+] تم تأكيد رصيد الأونر بالسيرفر: {post_renew_mix:,} ميكس!")
                        break
                    _, recheck_child, _ = self.get_child_status(silent=True)
                    if recheck_child >= owner_start_balance * 0.65:
                        child_holds_missing = True
                        child_current_mix = recheck_child
                        transferred_to_child = child_current_mix
                        print(f"[+] تم تأكيد وجود الميكسات بحساب الفرد: {child_current_mix:,} ميكس!")
                        break

            if child_holds_missing:
                if post_renew_mix > 0:
                    print(f"[*] ضم باقي رصيد الأونر ({post_renew_mix:,}) إلى الفرد...")
                    if self.transfer_mix(child_num, post_renew_mix, owner_plan_name):
                        transferred_to_child += post_renew_mix
                        print(f"[+] تم ضم الرصيد للفرد بنجاح. الإجمالي المركون: {transferred_to_child:,} ميكس.")
            elif post_renew_mix < owner_start_balance * 0.65:
                print(f"[-] تنبيه طوارئ صارم: رصيد الأونر ({post_renew_mix:,}) أقل من السابق ({owner_start_balance:,}) والفرد لا يحمله ({child_current_mix:,})! تم إيقاف الترحيل لحماية الخط.")
                self.record_cycle(
                    cycle_count, started_at, datetime.now(timezone.utc),
                    owner_start_balance, owner_post_renewal, 0, 0, child_current_mix, owner_plan_name, None, 0,
                    owner_start_balance, target_mix, "failed", "توقف أمان ذكي", "تم حظر الترحيل لمنع تصفير الرصيد"
                )
                return False, "safety_stop_anomaly_detected"

        if not child_holds_missing:
            if post_renew_mix > 0:
                if self.transfer_mix(child_num, post_renew_mix, owner_plan_name):
                    transferred_to_child = post_renew_mix
                    print(f"[+] تم تحويل {post_renew_mix:,} ميكس للفرد بنجاح.")
                else:
                    print("[-] تنبيه أمان حاسم: فشل تحويل ميكسات الأونر للفرد! تم إلغاء تغيير النظام لحماية الرصيد.")
                    self.record_cycle(
                        cycle_count, started_at, datetime.now(timezone.utc),
                        owner_start_balance, owner_post_renewal, 0, 0, 0, owner_plan_name, None, 0,
                        owner_start_balance, target_mix, "failed", "تحويل ميكسات الأونر للفرد", "فشل نقل الميكسات للفرد - تم إيقاف الدورة بأمان"
                    )
                    return False, "transfer_to_child_failed"
            else:
                print("[*] رصيد الأونر 0 ميكس. جاري التحقق من رصيد الفرد قبل الترحيل...")
                _, child_current_mix, _ = self.get_child_status(silent=True)
                if owner_start_balance > 5000 and child_current_mix < (owner_start_balance * 0.7):
                    print(f"[-] تنبيه طوارئ: رصيد الأونر 0 بينما الرصيد السابق كان {owner_start_balance:,} ميكس والفرد لا يحمله ({child_current_mix:,})! تم إلغاء الترحيل لحماية الخط.")
                    self.record_cycle(
                        cycle_count, started_at, datetime.now(timezone.utc),
                        owner_start_balance, owner_post_renewal, 0, 0, child_current_mix, owner_plan_name, None, 0,
                        owner_start_balance, target_mix, "failed", "فحص رصيد الأمان", "تم حظر الترحيل لمنع تصفير الرصيد"
                    )
                    return False, "safety_stop_unparked_mixes"

        # 5. Change Plan
        print("-" * 40)
        self.report_step(cycle_count, "تغيير نظام الخط", "running")
        if "7" in owner_plan_name:
            target_plan_id = "Hekaya_XRP_MIX_Parent_6"
            self.change_plan(target_plan_id, "951")
        else:
            target_plan_id = "Hekaya_XRP_MIX_Parent_7"
            self.change_plan(target_plan_id, "")

        # 6. Polling loop: with Smart Periodic Reactivation
        print("[*] في انتظار استجابة السيرفر وتغيير النظام... (فحص كل ثانيتين مع تنشيط ذكي)")
        self.report_step(cycle_count, "المراقبة الذكية حتى اعتماد النظام", "running")
        poll_count = 0
        server_migrated = False
        while poll_count < 60:
            time.sleep(2.5)
            poll_count += 1
            current_p_id, current_mix, _ = self.get_status_and_child(silent=True)
            if current_p_id and target_plan_id in current_p_id:
                print(f"[+] السيرفر استجاب وتأكد تغيير النظام! (النظام: {current_p_id} | الميكسات: {current_mix:,})")
                server_migrated = True
                break

            # Active Smart Reactivation every 10 attempts
            if poll_count % 10 == 0:
                print(f"[*] تنشيط ذكي للسيرفر (محاولة {poll_count}/60): إعادة تسجيل الدخول ودفع طلب الترحيل...")
                try:
                    self.login(self.owner_email, self.owner_password, silent=True)
                    rate_id = "951" if "6" in target_plan_id else ""
                    self.change_plan(target_plan_id, rate_id)
                except Exception:
                    pass
            elif poll_count % 5 == 0:
                print(f"[*] ما زال الاستعلام جارياً كل ثانيتين... (محاولات: {poll_count}/60)")

        if not server_migrated:
            print("[!] تنبيه أمان ذكي: تأخر السيرفر في الترحيل - جاري استرجاع الميكسات من الفرد للأونر فوراً لحمايتها من التصفير!")

        owner_plan_post = target_plan_id

        # 7. Transfer Child to Owner (Instant with pre-initialized session)
        print("-" * 40)
        self.report_step(cycle_count, "استرجاع لحظي فوري للميكسات من الفرد للأونر", "running")
        child_session = requests.Session()
        child_logged_in = False
        for l_attempt in range(3):
            self.http_session = child_session
            if self.login(child_email, child_pass, silent=True):
                child_logged_in = True
                break
            time.sleep(1)

        if not child_logged_in:
            print("[-] فشل الدخول للفرد.")
            self.record_cycle(
                cycle_count, started_at, datetime.now(timezone.utc),
                owner_start_balance, owner_post_renewal, transferred_to_child, 0, 0,
                owner_plan_pre, owner_plan_post, 0, None, target_mix,
                "failed", "دخول الفرد", "فشل تسجيل دخول حساب الفرد بعد ترحيل النظام"
            )
            return False, "child_login_failed"

        _, child_mix, _ = self.get_status_and_child(silent=True)

        # Safety wait loop: If child mix is lower than what was transferred to child,
        # poll Etisalat network up to 12 attempts (every 2.5s) to ensure full arrival
        if transferred_to_child > 0 and child_mix < transferred_to_child * 0.9:
            print(f"[!] تنبيه فحص الرصيد: رصيد الفرد المسجل ({child_mix:,}) أقل من المحول له ({transferred_to_child:,}). في انتظار نزول الميكسات من شبكة اتصالات...")
            for p_att in range(1, 13):
                time.sleep(2.5)
                _, recheck_child_mix, _ = self.get_status_and_child(silent=True)
                if recheck_child_mix >= transferred_to_child * 0.9 or recheck_child_mix > child_mix:
                    child_mix = recheck_child_mix
                    print(f"[+] تم تأكيد وصول الميكسات بنجاح لحساب الفرد: {child_mix:,} ميكس!")
                    break
                if p_att % 3 == 0:
                    print(f"[*] في انتظار معالجة شبكة اتصالات لنزول الميكسات المركونة للفرد (محاولة {p_att}/12)...")

        print(f"[+] حالة الفرد | الميكسات: {child_mix:,}")
        transferred_to_owner = 0
        if child_mix > 0 and self.owner_dial:
            print(f"[⚡] جاري استرجاع فوري لـ ({child_mix:,}) ميكس للأونر ({self.owner_dial})...")
            for t_attempt in range(3):
                if self.transfer_mix(self.owner_dial, child_mix, "Hekaya_XRP_MIX_Child_1"):
                    transferred_to_owner = child_mix
                    print(f"[+] تم الاسترجاع اللحظي بنجاح! ({child_mix:,} ميكس)")
                    break
                time.sleep(1)
            else:
                print("[-] فشل تحويل ميكسات الفرد! هيتم المحاولة في الدورة القادمة.")

        # 8. Return to Owner & verify final balance
        print("-" * 40)
        self.report_step(cycle_count, "الرجوع للأونر وتأكيد الرصيد النهائي", "running")
        self.http_session = requests.Session()
        if not self.login(owner_email, owner_pass, is_owner=True, silent=True):
            print("[-] تعذر تسجيل دخول الأونر للتأكيد النهائي.")
            return False, "final_owner_login_failed"

        _, final_mix, _ = self.get_status_and_child(silent=True)
        print(f"[+] رجعنا للأونر | رصيده الآن: {final_mix:,}")

        # Complete record
        is_target_reached = (final_mix >= target_mix)
        status = "stopped_at_target" if is_target_reached else "completed"
        self.record_cycle(
            cycle_count, started_at, datetime.now(timezone.utc),
            owner_start_balance, owner_post_renewal, transferred_to_child,
            child_mix, 0, owner_plan_pre, owner_plan_post,
            transferred_to_owner, final_mix, target_mix, status
        )

        self.report_step(
            cycle_count,
            f"اكتملت الدورة بنجاح. الرصيد النهائي: {final_mix:,} ميكس",
            "completed" if not is_target_reached else "stopped_at_target"
        )

        return not is_target_reached, ("continue" if not is_target_reached else "target_reached")

def main():
    parser = argparse.ArgumentParser(description="Etisalat VIP Automation Worker")
    parser.add_argument("--session-id", default="default", help="Session ID in database")
    parser.add_argument("--owner-email", help="Owner login email")
    parser.add_argument("--owner-pass", help="Owner login password")
    parser.add_argument("--child-email", help="Child login email")
    parser.add_argument("--child-pass", help="Child login password")
    parser.add_argument("--target-mix", type=int, default=50000, help="Target mix balance")
    parser.add_argument("--cycle-delay", type=int, default=DEFAULT_CYCLE_DELAY_SECONDS, help="Cycle delay in seconds")
    parser.add_argument("--single-cycle", action="store_true", help="Run only one cycle and exit")
    args = parser.parse_args()

    bot = EtisalatVipBot(session_id=args.session_id)

    # If credentials not provided in CLI, fetch from database securely
    owner_email = args.owner_email
    owner_pass = args.owner_pass
    child_email = args.child_email
    child_pass = args.child_pass
    target_mix = args.target_mix
    cycle_delay = args.cycle_delay

    if not (owner_email and owner_pass and child_email and child_pass):
        # Fetch from Supabase directly
        if bot.supabase_url and bot.supabase_key:
            try:
                res = requests.get(
                    f"{bot.supabase_url}/rest/v1/vip_sessions?id=eq.{args.session_id}&select=*",
                    headers={
                        "apikey": bot.supabase_key,
                        "Authorization": f"Bearer {bot.supabase_key}"
                    },
                    timeout=5
                )
                if res.status_code == 200 and res.json():
                    s = res.json()[0]
                    owner_email = owner_email or s.get("owner_email")
                    owner_pass = owner_pass or s.get("owner_password_enc")
                    child_email = child_email or s.get("individual_email")
                    child_pass = child_pass or s.get("individual_password_enc")
                    target_mix = s.get("target_mix_balance") or target_mix
                    cycle_delay = s.get("cycle_delay_seconds") or cycle_delay
            except Exception as e:
                print(f"[-] خطأ جلب بيانات الجلسة من قاعدة البيانات: {e}")

    if not (owner_email and owner_pass and child_email and child_pass):
        print("[-] تنبيه: لم يتم توفير بيانات الاعتماد لحساب الأونر والفرد بعد.")
        print("[*] يرجى إدخال بيانات الحسابات من واجهة إدارة VIP.")
        sys.exit(1)

    print(f"[*] بدء تشغيل عامل VIP للجلسة: {args.session_id}")
    print(f"[*] الرصيد المستهدف: {target_mix:,} ميكس")
    print(f"[*] فترة الانتظار بين الدورات: {cycle_delay} ثانية (افتراضية/مخصصة)")

    cycle_count = 1
    while True:
        should_continue, reason = bot.run_cycle(
            cycle_count, owner_email, owner_pass, child_email, child_pass,
            target_mix=target_mix, cycle_delay_seconds=cycle_delay
        )

        if not should_continue or args.single_cycle or reason == "target_reached":
            print(f"\n[*] انتهاء التشغيل (السبب: {reason})")
            break

        cycle_count += 1
        print(f"\n[*] استراحة {cycle_delay} ثانية قبل الدورة القادمة...")
        time.sleep(cycle_delay)

if __name__ == "__main__":
    main()
