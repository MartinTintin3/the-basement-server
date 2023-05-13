import User from "./user.js";
import sqlite3 from "sqlite3";
import * as socketio from "socket.io";

export default class Server {
	constructor(server, db_path) {
		this.http_server = server;
		if (this.http_server == null) throw new Error("server cannot be null");

		this.users = [];

		if (db_path == null) this.db_path = ":memory:";

		this.db = new (sqlite3.verbose().Database)(db_path);

		this.db.serialize(() => {
			this.db.run("CREATE TABLE IF NOT EXISTS message (data TEXT, author TEXT, time INTEGER)");

			this.db_stmts = {
				chat: this.db.prepare("INSERT INTO message VALUES (?, ?, ?)"),
				fetch: this.db.prepare("SELECT * FROM message ORDER BY time DESC LIMIT ? OFFSET ?"),
			};
		});

		this.io = new socketio.Server(this.http_server, cors: { origin: "*", });
		this.io.on("connection", this.#onConnection);
	}

	#onConnection = socket => {
		const user = new User(socket);
	
		socket.on("login", ({ username }) => {
			if (user.username != null) return socket.emit("login", { success: false, message: "You already have a username" });
			if (username == null) return socket.emit("login", { success: false, message: "Username cannot be null" });
			if (username.length < 3) return socket.emit("login", { success: false, message: "Username too short" });
			if (username.length > 16) return socket.emit("login", { success: false, message: "Username too long" });
			if (this.users.find(u => u.username == username)) return socket.emit("login", { success: false, message: "Username already taken" });

			user.username = username;
			this.users.push(user);
			console.log(`User logged in: ${username}`);

			socket.emit("login", { success: true });
			this.io.emit("users", { success: true, users: this.users.map(u => u.username) });
		});

		socket.on("message", ({ data }) => {
			if (user.username == null || typeof data != "string" || data.length <= 0 || data.length > 256) return;

			const time = Date.now();

			console.log(`Message: ${user.username}: ${data}`);
			this.io.emit("message", ({ author: user.username, data, time }));
		});

		socket.on("fetch", ({ limit, offset }) => {
			if (user.username == null) return socket.emit("fetch", { success: false, message: "You must be logged in to fetch messages" });
			if (typeof limit != "number" || typeof offset != "number") return socket.emit("fetch", { success: false, message: "limit and offset have to be numbers" });
			if (offset == null) offset = 0;
			if (offset < 0) return socket.emit("fetch", { success: false, message: `Offset(${offset}) must be positive` });
			if (limit < 1) return socket.emit("fetch", { success: false, message: `Limit(${limit}) must be at least 1` });
			if (limit > 100) return socket.emit("fetch", { success: false, message: `Limit${limit} must be less than 100` });

			this.db_stmts.fetch.all(limit, offset, (err, rows) => {
				console.error(`Error fetching messsages(${limit}, ${offset}): ${err}`);
				if (err) return socket.emit("fetch", { success: false, message: "Error fetching messages" });

				socket.emit("fetch", { success: true, messages: rows, offset, limit });
			});
		});

		socket.on("users", () => {
			if (user.username == null) return socket.emit("users", { success: false, message: "You must be logged in to fetch users" });

			socket.emit("users", { success: true, users: this.users.map(u => u.username) });
		});

		socket.on("disconnect", () => {
			if (user.username == null) return;

			this.users.splice(this.users.indexOf(user), 1);
			this.io.emit("users", { success: true, users: this.users.map(u => u.username) });
		});
	}

	message = (author, data, time) => {
		this.io.emit("message", { author, data, time });
	}

	close = () => {
		for (const stmt of Object.values(this.db_stmts)) stmt.finalize();
		this.db.close();
		this.io.close();
	}
}
