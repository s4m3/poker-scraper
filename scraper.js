const puppeteer = require('puppeteer');
const fs = require('fs');
const fsPromises = require('fs').promises;
const bluebird = require("bluebird");

const saveGame = (key, game, uniqueGames) => {
  if (!key || uniqueGames[key]) {
    return;
  }
  console.log(`Saving game with key ${key}`);
  uniqueGames[key] = game;
}

/*
async function parseLogs(e) {
  const args = await Promise.all(e.args().map(a => a.jsonValue()));
  if (args && args.length === 1) {
    const game = args[0];
    const { key } = game;
    saveGame(key, game);
  }
}
 */


async function clickButtonOnPageAndWait(page, url, uniqueGames) {
  await new Promise(async function (resolve) {
    const parseWebsocketFrame = (response) => {
      let payload;
      if (response &&
        response.response &&
        response.response.payloadData.includes('key') &&
        response.response.payloadData.includes('rounds')
      ) {
        try {
          payload = response.response.payloadData.toString().replace(/^\d+/, '');
          const games = JSON.parse(payload);
          games.forEach(game => {
            saveGame(game.key, game, uniqueGames);
            resolve();
          })
        } catch (e) {
          console.error(`Error while parsing payload ${response.response.payloadData}`)
          console.error(payload);
        }
      }
    }

    try {
      await page.goto(url);
      const cdp = await page.target().createCDPSession();
      await cdp.send('Network.enable');
      await cdp.send('Page.enable');
      cdp.on('Network.webSocketFrameReceived', parseWebsocketFrame);

      await page.evaluate(async () => {
        const buttonElements = document.getElementsByClassName(
          "md-icon-button md-fab md-accent md-button md-dance-theme md-ink-ripple");
        const btn = buttonElements[0];
        if (!btn) {
          throw `No button found on ${url}`;
        }
        btn.click();
      });
    } catch (e) {
      console.error(e);

    }

  });
}


async function readUrlsFromFile() {
  let inputData = '';
  try {
    inputData = await fsPromises.readFile('input.txt', 'utf8');
  } catch (e) {
    console.error('Cannot read in input.txt', e);
  }
  return inputData;
}


const withBrowser = async (fn) => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

const withPage = (browser) => async (fn) => {
  const page = await browser.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close();
  }
}

const parseUrls = (inputString) => inputString.replace(/\t.*/gm, '').split('\n').filter(u => !!u.trim());


async function extractGames(urlString) {
  console.log('####### EXECUTING GAME EXTRACTION #######');
  console.log('Extracting urls: ', urlString);
  const uniqueGames = {};
  const urls = parseUrls(urlString);
  console.log('parsed urls', urls);
  const amount = urls.length;
  console.log(`Found ${amount} urls!`);
  try {
    const results = await withBrowser(async (browser) => {
      return bluebird.map(urls, async (url, idx) => {
        return withPage(browser)(async (page) => {
          console.log(`Parsing ${idx}/${amount}... URL:${url}`)
          await clickButtonOnPageAndWait(page, url, uniqueGames);
        });
      }, { concurrency: 10 });
    });
  } catch (e) {
    console.error(e);
    return e;
  }


  return uniqueGames;
}

async function run() {
  const urlsFromFile = await readUrlsFromFile();
  const uniqueGames = await extractGames(urlsFromFile);
  console.log('PARSING DONE. Writing output to games.json');
  fs.writeFileSync('games.json', JSON.stringify(uniqueGames), { flag: 'w' });
}


exports.extractGames = extractGames;

// run();
