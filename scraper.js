// const puppeteer = require('puppeteer');
const fs = require('fs');
const fsPromises = require('fs').promises;
const bluebird = require("bluebird");
const UserAgent = require("user-agents");

const puppeteer = require('puppeteer-extra')

// add stealth plugin and use defaults (all evasion techniques)
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())

const saveGame = (key, game, uniqueGames) => {
  if (!key || uniqueGames[key]) {
    return;
  }
  console.log(`Saving game with key ${key}`);
  uniqueGames[key] = game;
}


async function parseLogs(e, uniqueGames) {
  const args = await Promise.all(e.args().map(a => a.jsonValue()));
  if (args && args.length === 1) {
    const game = args[0];
    const { key } = game;
    saveGame(key, game, uniqueGames);
  }
}


async function readGameFromPage(page, url) {
  const errorString = `No button found on ${url}`;
  try {
    // await new Promise(function (resolve) {
    //       setTimeout(resolve, 5500);
    //     });
    await page.waitForTimeout(4000)
    //await page.waitForSelector("md-icon-button md-fab md-accent md-button md-dance-theme md-ink-ripple", {visible:
    // true}); await page.$eval("md-icon-button md-fab md-accent md-button md-dance-theme md-ink-ripple", btn =>
    // btn.click());
    await Promise.all([
      await page.click("md-icon-button md-fab md-accent md-button md-dance-theme md-ink-ripple")
    ]);
    // await page.evaluate(async () => {
    //   const buttonElements = document.getElementsByClassName(
    //     "md-icon-button md-fab md-accent md-button md-dance-theme md-ink-ripple");
    //   const btn = buttonElements[0];
    //   if (!btn) {
    //     throw new Error(errorString);
    //   }
    //   btn.click();
    //
    //   // wait for logs
    //   await new Promise(function (resolve) {
    //     setTimeout(resolve, 5500);
    //   });
    // });
  } catch (e) {
    console.error(e);
  }

}

async function readFromWebsocketTraffic(page, url, uniqueGames) {
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
        }
      }
    }
    console.log('Go to url', url);
    const cdp = await page.target().createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');
    cdp.on('Network.webSocketFrameReceived', parseWebsocketFrame);

    await page.goto(url);


    // // DEBUGGING
    // const html = await page.content();
    // console.log('html', html);

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

const parseUrls = (inputString) => inputString
  .replace(/\t.*/gm, '')
  .split('\n')
  .filter(u => !!u.trim())
  .map(url => url.trim());


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
          console.log(`Parsing ${idx + 1}/${amount}... URL:${url}`);
          const userAgent = new UserAgent();
          await page.setUserAgent(userAgent.toString());

          // browser console log based
          page.on('console', (e) => parseLogs(e, uniqueGames));

          await page.goto(url, {
              timeout: 60000,
              waitUntil: "domcontentloaded",
            }
          );
          await readGameFromPage(page, url);

          // websocket based
          // await readFromWebsocketTraffic(page, url, uniqueGames);
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
