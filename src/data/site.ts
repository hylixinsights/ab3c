export const site = {
  origin: 'https://ab3c.org',
  eventPath: 'https://xmeeting27.ab3c.org/',
  logo: '/ab3c/logo.jpeg',
  media: {
    manifest: 'ab3c/hero-sequence/manifest.json',
  },
  // The event mark comes from the X-Meeting 2027 project (public/brand); replace both files together.
  eventLogo: '/ab3c/xmeeting-2027.webp',
  eventLogoFallback: '/ab3c/xmeeting-2027.png',
  // The emblem alone, 4:3, for the phone's narrow frame.
  eventEmblem: '/ab3c/xmeeting-2027-emblem.webp',
  eventEmblemFallback: '/ab3c/xmeeting-2027-emblem.png',
} as const;
