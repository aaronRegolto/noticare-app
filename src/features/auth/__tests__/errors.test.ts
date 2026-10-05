import { isAuthServerFailure } from '../errors';

describe('isAuthServerFailure', () => {
  it('flags 5xx auth errors', () => {
    const error = Object.assign(new Error('Hook requires authorization token'), { status: 500 });
    expect(isAuthServerFailure(error)).toBe(true);
  });

  it('flags a raw serialized response used as the message', () => {
    expect(isAuthServerFailure(new Error('{"type":"default","status":500,"ok":false}'))).toBe(true);
  });

  it('leaves user-facing errors alone', () => {
    const error = Object.assign(new Error('Token has expired or is invalid'), { status: 403 });
    expect(isAuthServerFailure(error)).toBe(false);
    expect(isAuthServerFailure('not an error')).toBe(false);
  });
});
