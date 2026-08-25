import { chromium } from 'playwright';

console.log('🚀 Testing LAN IP (http://172.20.10.8:3000) Browser Access...\n');

const browser = await chromium.launch({ headless: true });

// Host on LAN IP
const hostContext = await browser.newContext();
const hostPage = await hostContext.newPage();
hostPage.on('console', (msg) => console.log(`[Host Console] ${msg.type()}: ${msg.text()}`));
hostPage.on('pageerror', (err) => console.error(`[Host Error] ${err.message}`));

console.log('1. Opening http://172.20.10.8:3000/host...');
await hostPage.goto('http://172.20.10.8:3000/host', { waitUntil: 'networkidle' });

await hostPage.fill('input[placeholder*="name"]', 'LANHost');
await hostPage.click('button:has-text("Create Room")');

await hostPage.waitForSelector('.room-code', { timeout: 10000 });
const roomCode = (await hostPage.innerText('.room-code')).trim();
console.log(`\n🎉 LAN Host created room! Code: [${roomCode}]`);

// Player on LAN IP (mobile view)
console.log('\n2. Opening mobile player http://172.20.10.8:3000/join...');
const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' });
const playerPage = await playerContext.newPage();
playerPage.on('console', (msg) => console.log(`[Player Console] ${msg.type()}: ${msg.text()}`));
playerPage.on('pageerror', (err) => console.error(`[Player Error] ${err.message}`));

await playerPage.goto('http://172.20.10.8:3000/join', { waitUntil: 'networkidle' });

const inputs = await playerPage.$$('input');
if (inputs.length >= 2) {
  await inputs[0].fill(roomCode);
  await inputs[1].fill('MobileLANPlayer');
}

console.log('3. Mobile player clicking "🚀 Join Game"...');
await playerPage.click('button:has-text("Join Game")');

await playerPage.waitForURL(/\/player\?room=/, { timeout: 10000 });
console.log(`🎉 MOBILE PLAYER NAVIGATED TO PLAYER DASHBOARD SUCCESSFULLY! URL: ${playerPage.url()}`);

await hostPage.waitForTimeout(1000);
const hostContent = await hostPage.content();
const playerOnHost = hostContent.includes('MobileLANPlayer');
console.log(`\n• Player "MobileLANPlayer" on LAN Host screen: ${playerOnHost ? 'YES ✅' : 'NO ❌'}`);

await browser.close();
