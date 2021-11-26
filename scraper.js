const puppeteer = require('puppeteer');
const fs = require('fs');
const fsPromises = require('fs').promises;

uniqueGames = {};

const saveGame = (key, game) => {
  if (!key || uniqueGames[key]) {
    return;
  }

  console.log(`Saving game with key ${key}`);

  uniqueGames[key] = game;
}

async function parseLogs(e) {
  const args = await Promise.all(e.args().map(a => a.jsonValue()));
  if (args && args.length === 1) {
    const game = args[0];
    const { key } = game;
    saveGame(key, game);
  }
}

const parseWebsocketFrame = response => {
  let payload;
  if (response && response.response && response.response.payloadData.includes('key')) {
    try {
      payload = response.response.payloadData.toString().replace(/^\d+/, '');
      const games = JSON.parse(payload);
      games.forEach(game => {
        saveGame(game.key, game);
      })
    } catch (e) {
      console.error(`Error while parsing payload ${response.response.payloadData}`)
      console.error(payload);
    }
  }
}

async function clickButtonOnPageAndWait(page) {
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
    cdp.on('Network.webSocketFrameReceived', parseWebsocketFrame);

    await clickButtonOnPageAndWait(page);
    await page.close();
    idx++;
  }

  console.log('PARSING DONE. Writing output to games.json');
  browser.close();
  fs.writeFileSync('games.json', JSON.stringify(uniqueGames), { flag: 'w' });
}

run();
