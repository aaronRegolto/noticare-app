import { Href, Link } from 'expo-router';
import { type ComponentProps } from 'react';
import { Linking } from 'react-native';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: Href & string };

export function ExternalLink({ href, ...rest }: Props) {
  return (
    <Link
      target="_blank"
      {...rest}
      href={href}
      onPress={async (event) => {
        if (process.env.EXPO_OS !== 'web') {
          event.preventDefault();
          // Respect Android's default browser setting. When NotiCare is the system default,
          // the OS routes the link back into the app without showing a browser chooser.
          await Linking.openURL(href);
        }
      }}
    />
  );
}
