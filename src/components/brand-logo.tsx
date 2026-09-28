import { Image } from 'react-native';

const logo = require('@/assets/images/noticare-logo.png');

/** The NotiCare logo (shield, message, and status badges) on a transparent background. */
export function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={logo}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="NotiCare logo"
    />
  );
}
