// معرّف الجهاز — ثابت لكل جهاز/متصفح
const KEY = 'vf_device_id';

import { generateUUID } from "./uuid";

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = generateUUID();
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }
    localStorage.setItem(KEY, id);
  }
  return id;
}
