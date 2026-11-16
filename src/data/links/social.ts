import { logoFacebook, logoInstagram } from 'ionicons/icons';
import { logoTelegram } from '@/components/icons';

/**
 * A-120 (1): THE addresses of inok.info's pages in the social networks (one source, A-15) - the owner's three, in his order. The names are
 * the networks' own (the same in uk / ru / en, never translated); `icon` = a filled vector logo (ionicons / Simple Icons, currentColor).
 */
export const SOCIAL_LINKS = [
  { id: 'telegram', name: 'Telegram', url: 'https://t.me/inokinfo', icon: logoTelegram },
  { id: 'facebook', name: 'Facebook', url: 'https://www.facebook.com/inok.info', icon: logoFacebook },
  { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/inok.info/', icon: logoInstagram },
] as const;
export type SocialId = (typeof SOCIAL_LINKS)[number]['id'];
