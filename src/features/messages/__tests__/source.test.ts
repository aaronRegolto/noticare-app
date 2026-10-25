import { messageSourceForPackage, messageSourceLabel } from '../source';

test('identifies Messenger alerts and keeps other message providers labeled Messages', () => {
  const messenger = messageSourceForPackage('com.facebook.orca');
  const messages = messageSourceForPackage('com.google.android.apps.messaging');

  expect(messageSourceLabel(messenger)).toBe('Messenger');
  expect(messageSourceLabel(messages)).toBe('Messages');
});
