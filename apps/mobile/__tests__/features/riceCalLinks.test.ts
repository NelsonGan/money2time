import {
  RICECAL_APP_STORE_URL,
  RICECAL_DOWNLOAD_URL,
  RICECAL_PLAY_STORE_URL,
  riceCalStoreUrl,
} from '~/features/news/riceCalLinks';

describe('RiceCal download links', () => {
  it.each([
    ['ios', RICECAL_APP_STORE_URL],
    ['android', RICECAL_PLAY_STORE_URL],
    ['web', RICECAL_DOWNLOAD_URL],
  ])('sends %s users to the right listing', (platformOS, expected) => {
    expect(riceCalStoreUrl(platformOS)).toBe(expected);
  });
});
