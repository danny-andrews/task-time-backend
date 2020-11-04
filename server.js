const WebSocket = require("ws");
const http = require("http");
const wss = new WebSocket.Server({ noServer: true });
const utils = require("y-websocket/bin/utils.js");
const faunadb = require("faunadb");
const q = faunadb.query;
const Y = require("yjs");

const port = process.env.PORT || 3004;

const client = new faunadb.Client({
  secret: "fnAD5dTZtZACCXhZj4HzSPWropUY3Z2Rf22u3EZc",
});

const getDocRefId = async (userId) => {
  const res = await client.query(
    q.Paginate(q.Match(q.Index("user-id"), userId))
  );

  return res.data.length > 0
    ? Promise.resolve(res.data[0].id)
    : Promise.resolve(null);
};

const bindState = async (userId, ydoc) => {
  const id = await getDocRefId(userId);
  if (!id) {
    const res = await client.query(
      q.Create(q.Collection("default"), {
        data: {
          doc: Y.encodeStateAsUpdate(ydoc),
          userId,
        },
      })
    );
    ydoc.getMap("meta").set("id", res.ref.id);
  } else {
    const res = await client.query(q.Get(q.Ref(q.Collection("default"), id)));
    const buff = Buffer.from(res.data.doc.value, "base64");
    const persistedDoc = new Y.Doc();
    Y.applyUpdate(persistedDoc, buff);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedDoc));
    ydoc.getMap("meta").set("id", id);
  }
};

utils.setPersistence({
  bindState: (userId, ydoc) => {
    try {
      bindState(userId, ydoc);
    } catch (e) {
      console.log(e, "error");
    }
  },
  writeState: (userId, ydoc) => {
    const id = ydoc.getMap("meta").get("id");
    return client.query(
      q.Update(q.Ref(q.Collection("default"), id), {
        data: {
          doc: Y.encodeStateAsUpdate(ydoc),
        },
      })
    );
  },
});

const server = http.createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("heyo");
});

wss.on("connection", (...args) => {
  console.log("connected");
  utils.setupWSConnection(...args);
});

server.on("upgrade", (request, socket, head) => {
  const handleAuth = (ws) => {
    wss.emit("connection", ws, request);
  };
  wss.handleUpgrade(request, socket, head, handleAuth);
});

server.listen(port);

console.log("running on port", port);

process.on("unhandledRejection", (error) => {
  console.log("unhandledRejection", error);
});
