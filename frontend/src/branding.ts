// Central brand config. Change values here to re-skin the whole frontend.

export const BRAND = {
  name: 'VR Robotics Academy',
  shortName: 'VR Robotics',
  legalName: 'VR Robotics Academy',
  tagline: 'Live in Future',
  domain: 'vrroboticsacademy.com',
  email: 'info@vrroboticsacademy.com',
  // Hosted logo (Cloudinary). Swap this URL to change the logo everywhere
  // that imports BRAND.logo.
  logo: 'https://res.cloudinary.com/dicfqwlfq/image/upload/v1764505259/VR_Robotics_Logo_upscaled_1_rrrrn8.png',
  // Brand palette — WHITE + ORANGE (no black).
  // Mirrored in index.css / tailwind.config.ts.
  colors: {
    orange: '#FF6A00',
    orangeDark: '#cc5500',
    orangeLight: '#FF9A4D',
    lime: '#D8FF91',
    bgWhite: '#FFFFFF',
    ink: '#2a2a2a',
  },
} as const;

// Convenience default export usable as `import Logo from '@/branding'`-style
// is NOT provided; import { BRAND } and use BRAND.logo / BRAND.name.
export default BRAND;
