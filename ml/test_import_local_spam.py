import unittest

from import_local_spam import sanitize_message


class SanitizeMessageTests(unittest.TestCase):
    def test_masks_contact_details_and_numeric_codes(self):
        result = sanitize_message('Call +63 917 123 4567 or mail test@example.ph. OTP 123456')
        self.assertNotIn('9171234567', result)
        self.assertNotIn('test@example.ph', result)
        self.assertNotIn('123456', result)
        self.assertIn('<phone>', result)
        self.assertIn('<email>', result)
        self.assertIn('<number>', result)

    def test_keeps_domain_but_removes_url_path_and_query(self):
        result = sanitize_message('Claim now: https://promo.example.ph/path?id=secret')
        self.assertIn('<url:promo.example.ph>', result)
        self.assertNotIn('secret', result)
        self.assertNotIn('/path', result)

    def test_masks_www_urls_without_scheme(self):
        self.assertEqual(sanitize_message('Visit www.example.ph/a'), 'Visit <url:example.ph>')


if __name__ == '__main__':
    unittest.main()
