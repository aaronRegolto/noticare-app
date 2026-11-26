import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:4173').replace(/\/+$/, '');

if (!/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(BASE_URL)) {
  throw new Error('This load test is local-only. BASE_URL must use localhost or 127.0.0.1.');
}

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 5 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    checks: ['rate>0.99'],
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const responses = http.batch([
    ['GET', `${BASE_URL}/`, null, { tags: { name: 'dashboard_html' } }],
    ['GET', `${BASE_URL}/styles.css`, null, { tags: { name: 'dashboard_styles' } }],
    ['GET', `${BASE_URL}/app.js`, null, { tags: { name: 'dashboard_app_script' } }],
    ['GET', `${BASE_URL}/dashboard.js`, null, { tags: { name: 'dashboard_data_script' } }],
    ['GET', `${BASE_URL}/api/config`, null, { tags: { name: 'dashboard_config' } }],
    ['GET', `${BASE_URL}/api/model`, null, { tags: { name: 'dashboard_model_metadata' } }],
  ]);

  const labels = [
    'dashboard page loads',
    'dashboard styles load',
    'dashboard app script loads',
    'dashboard data script loads',
    'dashboard config endpoint responds',
    'model metadata endpoint responds',
  ];

  responses.forEach((response, index) => {
    check(response, {
      [`${labels[index]} with HTTP 200`]: (result) => result.status === 200,
      [`${labels[index]} with a response body`]: (result) => result.body.length > 0,
    });
  });

  const config = responses[4].json();
  check(config, {
    'config endpoint returns a boolean configured flag': (result) => typeof result.configured === 'boolean',
  });

  const model = responses[5].json();
  check(model, {
    'model endpoint returns a version': (result) => typeof result.model_provenance?.version === 'string',
  });

  sleep(1);
}
