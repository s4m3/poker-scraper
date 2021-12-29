var WebSocketServer = require("ws").Server
var http = require("http")
var express = require("express")
var scraper = require('./scraper');
var converter = require('./converter');

var app = express()
var port = process.env.PORT || 5000

app.use(express.static(__dirname + "/"))

var server = http.createServer(app)
server.listen(port)

console.log("http server listening on %d", port)

var wss = new WebSocketServer({ server: server })
console.log("websocket server created")

wss.on("connection", function (ws) {
  ws.binaryType = 'arraybuffer';
  console.log("websocket connection open");

  ws.on("close", function () {
    console.log("websocket connection close");
  })

  ws.on("message", async function (data) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    console.log('received: %s', data);

    let dotNum = 0;

    const interval = setInterval(() => {
      dotNum = dotNum + 1;
      ws.send(encoder.encode(`parsing${Array.from(Array(dotNum)).map(() => '.').join('')}`));
    }, 1000);

    try {
      ws.send(encoder.encode('scraping...'));
      var uniqueGames = await scraper.extractGames(decoder.decode(data));
      console.log('here 2');
      ws.send(encoder.encode('converting...'));
      console.log('here 3');
      var convertedGames = await converter.convert(uniqueGames);
      console.log('here 4');
      console.log('convertedGames', convertedGames);

      ws.send(encoder.encode(convertedGames));
      console.log('done');
    } catch (e) {
      ws.send(encoder.encode(e));
    } finally {
      clearInterval(interval);
    }


  });
})
