const puppeteer = require('puppeteer');
const fs = require('fs');
const fsPromises = require('fs').promises;

global.uniqueGames = {};

async function parseLogs(e) {
  const args = await Promise.all(e.args().map(a => a.jsonValue()));
  if (args && args.length === 1) {
    const game = args[0];
    const { key } = game;
    if (!key || global.uniqueGames[key]) {
      return;
    }

    console.log(`Found new game with key ${key}`);

    global.uniqueGames[key] = game;
  }
}

async function readGameFromPage(page) {
  await page.evaluate(async () => {
    const buttonElements = document.getElementsByClassName(
      "md-icon-button md-fab md-accent md-button md-dance-theme md-ink-ripple");
    const btn = buttonElements[0];
    if (!btn) {
      throw `No button found on ${url}`;
    }
    btn.click();

    // wait for logs
    await new Promise(function (resolve) {
      setTimeout(resolve, 1500);
    });

  });
}


async function getUrls() {
  const parseInput = (inputString) => inputString.replace(/\t.*/gm, '').split('\n').filter(u => !!u);
  let inputData = '';
  try {
    inputData = await fsPromises.readFile('input.txt', 'utf8');
  } catch (e) {
    console.error('Cannot read in input.txt', e);
  }

  return parseInput(inputData);

}

async function run() {
  console.log('####### EXECUTING GAME EXTRACTION #######');
  const browser = await puppeteer.launch();
  const urls = await getUrls();
  const amount = urls.length;
  console.log(`Found ${amount} urls!`);

  let idx = 1;
  for (let url of urls) {
    console.log(`Parsing ${idx}/${amount}... URL:${url}`)
    const page = await browser.newPage();
    // page.on('console', (e) => parseLogs(e));
    await page.goto(url);

    const cdp = await page.target().createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');

    const printResponse = response => {
      //console.log('response: ', response.response.payloadData);

      // parse
      let payload;
      if (response.response.payloadData.includes('key')) {
        try {

          payload = response.response.payloadData.toString().replace(/^\d+/, '');
          const parsedJson = JSON.parse(payload);
        } catch (e) {

          console.error('cannot parse', response.response.payloadData)
          console.error(payload);
        }
      }


      //console.log(parsedJson);

    }

    cdp.on('Network.webSocketFrameReceived', printResponse); // Fired when WebSocket message is received.


    await readGameFromPage(page);
    await page.close();
    idx++;
  }

  console.log('PARSING DONE. Writing output to games.json');
  browser.close();
  fs.writeFileSync('games.json', JSON.stringify(global.uniqueGames), { flag: 'w' });
}

run();
