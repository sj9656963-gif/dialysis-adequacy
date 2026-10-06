const http = require('http');
const fs = require('fs');
const WebSocket = globalThis.WebSocket;

async function main() {
  const targetUrl = 'file:///C:/Users/USER/dialysis-adequacy/%ED%88%AC%EC%84%9D%ED%9A%A8%EC%9C%A8%EB%8F%84.html';
  const newTab = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 9222,
      path: '/json/new?' + encodeURIComponent(targetUrl),
      method: 'PUT'
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
  console.log('Opened tab:', newTab.id);

  const ws = new WebSocket(newTab.webSocketDebuggerUrl);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const msgId = id++;
    const handler = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === msgId) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1.5,
    mobile: false
  });

  await new Promise(r => setTimeout(r, 1500));

  // Case 1: Warn (URR 미달, spKt/V 충족)
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('f-preWt').value = '62.5';
      document.getElementById('f-postWt').value = '60.0';
      document.getElementById('f-uf').value = '2.75';
      document.getElementById('f-preBun').value = '70';
      document.getElementById('f-postBun').value = '26';
      document.getElementById('f-hours').value = '4';
      document.getElementById('f-minutes').value = '0';
      document.getElementById('f-postBun').dispatchEvent(new Event('input', { bubbles: true }));
    `
  });
  await new Promise(r => setTimeout(r, 800));

  const ssWarn = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/USER/.gemini/antigravity/brain/55746823-5be9-4f78-aed5-3b5f72902433/screen_warn_fixed.png', Buffer.from(ssWarn.data, 'base64'));
  console.log('Saved screen_warn_fixed.png');

  // Case 2: OK (둘 다 충족)
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('f-postBun').value = '21';
      document.getElementById('f-postBun').dispatchEvent(new Event('input', { bubbles: true }));
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const ssOk = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/USER/.gemini/antigravity/brain/55746823-5be9-4f78-aed5-3b5f72902433/screen_ok_fixed.png', Buffer.from(ssOk.data, 'base64'));
  console.log('Saved screen_ok_fixed.png');

  // Case 3: Bad (둘 다 미달)
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('f-postBun').value = '35';
      document.getElementById('f-hours').value = '2';
      document.getElementById('f-hours').dispatchEvent(new Event('input', { bubbles: true }));
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const ssBad = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/USER/.gemini/antigravity/brain/55746823-5be9-4f78-aed5-3b5f72902433/screen_bad_fixed.png', Buffer.from(ssBad.data, 'base64'));
  console.log('Saved screen_bad_fixed.png');

  ws.close();
}
main().catch(console.error);
