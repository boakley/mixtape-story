// Smoke test for Apple Music API credentials.
//
// Verifies that the three secrets (APPLE_MUSIC_KEY_ID, APPLE_MUSIC_TEAM_ID,
// APPLE_MUSIC_PRIVATE_KEY) actually let us sign a JWT that Apple accepts
// and call the search endpoint. Run BEFORE building the real apple-music.ts
// module so credential problems surface as fast as possible.
//
// Run:
//   node --env-file=.env.local scripts/test-apple-music.mjs
//
// Uses Web Crypto (not Node's `crypto` module) so the same signing logic
// will work unchanged inside Cloudflare Workers later.

const KEY_ID = process.env.APPLE_MUSIC_KEY_ID;
const TEAM_ID = process.env.APPLE_MUSIC_TEAM_ID;
const PRIVATE_KEY = process.env.APPLE_MUSIC_PRIVATE_KEY;

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!KEY_ID) die('APPLE_MUSIC_KEY_ID is missing or empty');
if (!TEAM_ID) die('APPLE_MUSIC_TEAM_ID is missing or empty');
if (!PRIVATE_KEY) die('APPLE_MUSIC_PRIVATE_KEY is missing or empty');

// Apple's Team ID is a 10-character alphanumeric. If a longer string sneaks
// in (e.g. the display-name line from the dev portal), the JWT will sign but
// Apple will reject the `iss` claim with a 401. Surface that early.
if (!/^[A-Z0-9]{10}$/.test(TEAM_ID)) {
  console.warn(
    `! APPLE_MUSIC_TEAM_ID looks suspicious: "${TEAM_ID}". Expected 10 uppercase alphanumeric chars (e.g. HAXVH8L3SW). Continuing anyway.`
  );
}
if (!/^[A-Z0-9]{10}$/.test(KEY_ID)) {
  console.warn(
    `! APPLE_MUSIC_KEY_ID looks suspicious: "${KEY_ID}". Expected 10 uppercase alphanumeric chars.`
  );
}

console.log(`Key ID:  ${KEY_ID}`);
console.log(`Team ID: ${TEAM_ID}`);
console.log(`Key:     ${PRIVATE_KEY.length} chars, starts ${PRIVATE_KEY.slice(0, 30)}…`);
console.log();

// ---- JWT signing (ES256 via Web Crypto) ----------------------------------

function base64UrlEncodeString(s) {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeBytes(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem) {
  // Strip the BEGIN/END lines and all whitespace; base64-decode the middle.
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}

async function signAppleMusicJwt() {
  let keyData;
  try {
    keyData = pemToPkcs8(PRIVATE_KEY);
  } catch (e) {
    die(`Failed to decode PEM: ${e.message}. Check that APPLE_MUSIC_PRIVATE_KEY includes the BEGIN/END lines and that newlines are preserved.`);
  }

  let privateKey;
  try {
    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
  } catch (e) {
    die(`crypto.subtle.importKey failed: ${e.message}. Almost certainly the private key is malformed — re-download the .p8 from Apple Developer Portal.`);
  }

  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: TEAM_ID, iat: now, exp: now + 3600 };

  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncodeBytes(signature)}`;
}

// ---- Hit the search endpoint ---------------------------------------------

const jwt = await signAppleMusicJwt();
console.log(`✓ Signed JWT — head: ${jwt.slice(0, 30)}…  tail: …${jwt.slice(-20)}`);
console.log();

const query = 'a horse with no name america';
const url = `https://api.music.apple.com/v1/catalog/us/search?term=${encodeURIComponent(query)}&types=songs&limit=3`;
console.log(`→ GET ${url}`);

const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
console.log(`← HTTP ${res.status} ${res.statusText}`);
console.log();

const text = await res.text();

if (!res.ok) {
  console.error('✗ Apple Music API rejected the request. Response body:');
  console.error(text);
  if (res.status === 401) {
    console.error('\nHINT: 401 usually means a bad Key ID, Team ID, or signature. Common fixes:');
    console.error('  - APPLE_MUSIC_TEAM_ID must be the 10-char code (e.g. HAXVH8L3SW), not the display-name line.');
    console.error('  - APPLE_MUSIC_KEY_ID must match the Key ID shown in Apple Developer Portal → Keys.');
    console.error('  - The .p8 private key must be the one Apple gave you for THIS specific key.');
  }
  process.exit(1);
}

const data = JSON.parse(text);
const songs = data?.results?.songs?.data ?? [];

if (songs.length === 0) {
  console.error('? Apple Music returned 0 songs for that query. That should not happen — investigate.');
  console.error(JSON.stringify(data, null, 2).slice(0, 1000));
  process.exit(1);
}

console.log(`✓ Apple Music API is working — got ${songs.length} result${songs.length === 1 ? '' : 's'}:`);
console.log();
for (const s of songs) {
  const a = s.attributes ?? {};
  const year = a.releaseDate?.slice(0, 4) ?? '?';
  console.log(`  ${a.name} · ${a.artistName} (${year})`);
  console.log(`    album:    ${a.albumName ?? '?'}`);
  console.log(`    isrc:     ${a.isrc ?? '?'}`);
  console.log(`    deep URL: ${a.url ?? '?'}`);
  console.log();
}

console.log('All three credentials check out. You are ready to build the real apple-music.ts module.');
