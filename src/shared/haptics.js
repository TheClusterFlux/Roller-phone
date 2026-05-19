const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export const haptics = {
  tap() {
    if (canVibrate) navigator.vibrate(10);
  },
  impact() {
    if (canVibrate) navigator.vibrate(50);
  },
  success() {
    if (canVibrate) navigator.vibrate([30, 30, 30, 30, 30]);
  },
  error() {
    if (canVibrate) navigator.vibrate(100);
  },
  release() {
    if (canVibrate) navigator.vibrate(30);
  },
};
