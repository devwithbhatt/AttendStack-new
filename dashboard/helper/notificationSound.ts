// Chat Notification Sound Helper
// Exclusively plays /nofication-sound.mp3

const NOTIFICATION_SOUND_PATH = '/nofication-sound.mp3';

let notificationAudio: HTMLAudioElement | null = null;
let lastPlayedAt = 0;
let isAudioUnlocked = false;

/**
 * Unlock audio playback on mobile browsers on first user interaction
 */
const unlockMobileAudio = (): void => {
  if (isAudioUnlocked || typeof window === 'undefined') return;

  try {
    if (!notificationAudio) {
      notificationAudio = new Audio(NOTIFICATION_SOUND_PATH);
      notificationAudio.preload = 'auto';
    }

    // Unmute & unlock on user touch
    notificationAudio.volume = 0;
    const p = notificationAudio.play();
    if (p !== undefined) {
      p.then(() => {
        if (notificationAudio) {
          notificationAudio.pause();
          notificationAudio.currentTime = 0;
          notificationAudio.volume = 0.85;
        }
        isAudioUnlocked = true;
      }).catch(() => {});
    } else {
      isAudioUnlocked = true;
    }
  } catch (err) {
    console.debug('Mobile audio unlock attempt:', err);
  }
};

/**
 * Preload and cache the audio element for low-latency playback
 */
export const preloadNotificationSound = (): void => {
  if (typeof window === 'undefined') return;
  try {
    if (!notificationAudio) {
      notificationAudio = new Audio(NOTIFICATION_SOUND_PATH);
      notificationAudio.preload = 'auto';
      notificationAudio.volume = 0.85;
    }

    ['touchstart', 'touchend', 'click', 'keydown'].forEach((evt) => {
      window.addEventListener(evt, unlockMobileAudio, { once: true, passive: true });
    });
  } catch (err) {
    console.debug('Failed to preload notification sound:', err);
  }
};

export const isChatSoundMuted = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('attendstack_chat_sound_muted') === 'true';
};

export const setChatSoundMuted = (muted: boolean): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('attendstack_chat_sound_muted', muted ? 'true' : 'false');
};

/**
 * Plays ONLY /nofication-sound.mp3
 */
export const playMessageChime = (): void => {
  if (typeof window === 'undefined') return;
  if (isChatSoundMuted()) return;

  // Prevent double-play within 400ms
  const now = Date.now();
  if (now - lastPlayedAt < 400) {
    return;
  }
  lastPlayedAt = now;

  try {
    const sound = new Audio(NOTIFICATION_SOUND_PATH);
    sound.volume = 0.85;
    const playPromise = sound.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.debug('Notification audio playback prevented:', err);
      });
    }
  } catch (err) {
    console.debug('Error playing notification sound:', err);
  }
};

// Convenient alias
export const playNotificationSound = playMessageChime;

