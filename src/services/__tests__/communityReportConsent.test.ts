import { Alert } from 'react-native';

import { ENGLISH_WARNING_COPY, TAGALOG_WARNING_COPY } from '@/src/features/translation/warningCopy';
import { confirmCommunityReport } from '@/src/services/communityReportConsent';

afterEach(() => {
  jest.restoreAllMocks();
});

test('report consent explains community visibility and resolves false when declined', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const reportText = 'Your account PIN is 1234.';
  const report = jest.fn(async () => {});
  const consent = confirmCommunityReport(reportText, report, ENGLISH_WARNING_COPY);
  const [, message, buttons] = alert.mock.calls[0];

  expect(message).toContain(reportText);
  expect(message).toContain('redaction may miss personal information');
  expect(message).toContain('Users who enabled Community Alerts');
  buttons?.[0].onPress?.();
  await expect(consent).resolves.toBe(false);
  expect(report).not.toHaveBeenCalled();
});

test('report consent resolves true only after the user confirms', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const report = jest.fn(async () => {});
  const consent = confirmCommunityReport('Reported message', report, ENGLISH_WARNING_COPY);
  const buttons = alert.mock.calls[0][2];

  buttons?.[1].onPress?.();
  await expect(consent).resolves.toBe(true);
  expect(report).toHaveBeenCalledTimes(1);
});

test('dismissing the consent prompt does not consent to sharing', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const report = jest.fn(async () => {});
  const consent = confirmCommunityReport('Reported message', report, ENGLISH_WARNING_COPY);

  alert.mock.calls[0][3]?.onDismiss?.();
  await expect(consent).resolves.toBe(false);
  expect(report).not.toHaveBeenCalled();
});

test('report consent follows the selected Tagalog language', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const report = jest.fn(async () => {});
  const consent = confirmCommunityReport('Mensahe', report, TAGALOG_WARNING_COPY);
  const [title, body, buttons] = alert.mock.calls[0];

  expect(title).toBe(TAGALOG_WARNING_COPY.reportConsentTitle);
  expect(body).toContain('maaaring may personal na impormasyong hindi matukoy');
  buttons?.[1].onPress?.();
  await expect(consent).resolves.toBe(true);
});
