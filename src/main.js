import express from "express";
const app = express();
import http from "http";

import Server from "./server.js";

const server = new Server(http.createServer(app), ":memory:");

app.use(express.static("client"));

server.http_server.listen(3000, () => {
	console.log("listening on *:3000");
});