import '@mpv-easy/polyfill';
import {
  addForcedKeyBinding,
  getPropertyNumber,
  hideNotification,
  setPropertyNumber,
  showNotification,
} from '@mpv-easy/tool';

const speed = getPropertyNumber('speed', 1);
const scale = 4;
addForcedKeyBinding(
  'ENTER',
  'speed',
  ({ event }) => {
    if (event === 'down') {
      setPropertyNumber('speed', speed * scale);
      showNotification(`X${scale}`, 0);
    }
    if (event === 'up') {
      setPropertyNumber('speed', speed);
      hideNotification();
    }
  },
  { complex: true }
);
