/**
 * Test WebSocket connection to multiple relays
 */

const WebSocket = require('ws');

const RELAYS = [
  'wss://r1.fingerfan.top',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

const TIMEOUT_MS = 10000;

function testRelay(url) {
  return new Promise((resolve) => {
    const result = { url, status: 'unknown', error: null, data: null };
    const ws = new WebSocket(url);

    const timeout = setTimeout(() => {
      result.status = 'timeout';
      result.error = 'Connection timeout (10s)';
      ws.close();
      resolve(result);
    }, TIMEOUT_MS);

    ws.on('open', () => {
      clearTimeout(timeout);
      result.status = 'connected';
      ws.send(JSON.stringify(["REQ", "test", { kinds: [1], limit: 1 }]));
    });

    ws.on('message', (data) => {
      result.data = data.toString().slice(0, 200);
      ws.close();
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      result.status = 'error';
      result.error = err.message;
      resolve(result);
    });

    ws.on('close', () => {
      if (result.status !== 'timeout') {
        resolve(result);
      }
    });
  });
}

async function main() {
  console.log('Testing WebSocket connections...\n');

  const results = await Promise.all(RELAYS.map(testRelay));

  console.log('Results:');
  console.log('='.repeat(60));

  for (const r of results) {
    const status = r.status === 'connected' ? '✅' : '❌';
    console.log(`\n${status} ${r.url}`);
    console.log(`   Status: ${r.status}`);
    if (r.error) console.log(`   Error: ${r.error}`);
    if (r.data) console.log(`   Data: ${r.data}`);
  }

  console.log('\n' + '='.repeat(60));
}

main();