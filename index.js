var WebSocketServer = require("ws").Server
var http = require("http")
var express = require("express")
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

  ws.on("message", function (data) {
    console.log('received: %s', data);
    ws.send(data);
  });
})
