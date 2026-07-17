// معرّف الجهاز — ثابت لكل جهاز/متصفح
const KEY = 'vf_device_id';

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
