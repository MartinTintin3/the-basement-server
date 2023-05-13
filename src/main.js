import http from "http";

import Server from "./server.js";

const server = new Server(http.createServer(), ":memory:");

server.http_server.listen(3000, () => {
	console.log("listening on *:3000");
});
