let permissionState = 'unknown'; // 'unknown' | 'granted' | 'denied' | 'not-needed'

export async function requestMotionPermission() {
  if (typeof DeviceMotionEvent === 'undefined') {
    permissionState = 'denied';
    return false;
  }

  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const result = await DeviceMotionEvent.requestPermission();
      permissionState = result === 'granted' ? 'granted' : 'denied';
      return permissionState === 'granted';
    } catch (e) {
      permissionState = 'denied';
      return false;
    }
  }

  permissionState = 'not-needed';
  return true;
}

export function getPermissionState() {
  return permissionState;
}

export function hasSensorSupport() {
  return typeof DeviceMotionEvent !== 'undefined';
}

export function needsPermissionRequest() {
  return typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function';
}
