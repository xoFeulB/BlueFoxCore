import http from "http";
import { WebSocketServer } from "ws";
import crypto from "crypto";
import url from "url";
import fs from "fs";

export class GateServer {
  constructor(wsEntrancePort = 9999, httpGatePort, wsGatePort) {
    this.wsEntrancePort = wsEntrancePort;
    this.httpGatePort = httpGatePort;
    this.wsGatePort = wsGatePort;
    this.httpServer;
    this.webSocketServer;
    this.webSocketGate;
    this.workspaceClients = {};
    this.BlueFoxClients = {};
    this.mime = {
      "txt": "text/plain",
      "html": "text/html",
      "css": "text/css",
      "js": "application/javascript",
      "jpg": "image/jpg",
      "jpeg": "image/jpeg",
      "png": "image/png",
      "gif": "image/gif",
      "ico": "image/ico",
      "mp4": "video/mp4",
      "mp3": "audio/mp3",
      "otf": "application/x-font-otf",
      "woff": "application/x-font-woff",
      "ttf": "application/x-font-ttf",
      "svg": "image/svg+xml",
      "json": "application/json",
      "md": "text/markdown",
    };
  }

  start() {
    /* httpServer */ {
      const GET_API = {
        "/GetWorkspace.get": async (query, response) => {
          const R = [];
          for (const uuid of Object.keys(this.workspaceClients)) {
            R.push(
              await this.workspaceClients[uuid].send(
                {
                  type: "GetWorkspace"
                }
              )
            );
          }
          response.writeHead(200, {
            "Content-Type": "application/json"
          });
          response.end(JSON.stringify(R), "utf-8");
        },
        "/GetFile.get": async (query, response) => {
          try {
            query = JSON.parse(query);
            const filepath = (await this.workspaceClients[query.id].send(
              Object.assign(
                query,
                {
                  type: "GetFilePath"
                }
              )
            )).filePath;
            const R = fs.readFileSync(filepath.replaceAll("../", ""), "utf-8");
            response.writeHead(200, { "Content-Type": "application/javascript" });
            response.end(R, "utf-8");
          } catch (e) {
            response.writeHead(200, { "Content-Type": "application/javascript" });
            response.end(`window.alert("^.,.^ Error !");`, "utf-8");
          }
        },
        "/R": async (query, response) => {
          query = query.split("/");
          const uuid = query[1];
          const workspace = query[2];
          const file_name = query.slice(-1)[0];
          const extension = file_name.split(".").slice(-1);
          const path = `/${query.slice(3).join("/")}`;

          const filepath = (await this.workspaceClients[uuid].send(
            {
              type: "GetFilePath",
              id: uuid,
              workspace: workspace,
              path: path
            },
          )).filePath;
          const R = fs.readFileSync(filepath.replaceAll("../", ""));

          const header = { "Content-Type": (extension in this.mime) ? this.mime[extension] : "application/octet-stream" };
          response.writeHead(200, header);
          response.end(R, "binary");
        }
      };
      const POST_API = {};

      const method = {
        "GET": (request, response) => {
          GET_API[url.parse(request.url).pathname](decodeURI(url.parse(request.url).query), response);
        },
        "POST": (request, response) => {
          let body = "";
          request.on('data', (chunk) => {
            body += chunk
          }).on('end', () => {
            POST_API[url.parse(request.url).pathname](body, response);
          })
        },
      };
      this.httpServer = http.createServer((request, response) => {
        try {
          method[request.method](request, response);
        } catch (e) {
          response.writeHead(404, { "Content-Type": "text/html" });
          response.end("^.,.^ < 404!", "utf-8");
        }
      }).listen(this.httpGatePort);
    }
    /* webSocketServer Browser communicate connection */ {
      this.webSocketServer = new WebSocketServer({ port: this.wsGatePort });

      this.webSocketServer.on("connection", async (webSocket) => {
        webSocket.id = crypto.randomUUID();

        webSocket.runScript = async (buf) => {
          return (await this.BlueFoxClients[webSocket.id].send(
            {
              type: "RunScript",
              content: buf
            }
          ));
        }
        this.BlueFoxClients[webSocket.id] = {
          webSocket: webSocket,
          messagePool: {},
          send: async (message) => {

            this.BlueFoxClients[webSocket.id].webSocket.send(
              JSON.stringify(Object.assign(message, { id: webSocket.id }))
            );
            const R = new Promise((resolve, reject) => {
              this.BlueFoxClients[webSocket.id].messagePool[webSocket.id] = (_) => {
                resolve(_);
              };
            });
            return R;
          }
        };
        webSocket.on("message", async (message) => {
          const data = JSON.parse(message);
          if (data.id in this.BlueFoxClients[webSocket.id].messagePool) {
            await this.BlueFoxClients[webSocket.id].messagePool[data.id](data);
            delete this.BlueFoxClients[webSocket.id].messagePool[data.id];
          }
        });
      });
    }
    /* WebSocketGate VSCode workspace connection */ {
      const push_function = {
        "RunScript": (data) => {
          [...this.webSocketServer.clients][0].send(
            JSON.stringify(data)
          );
        }
      }
      this.webSocketGate = new WebSocketServer({ port: this.wsEntrancePort });
      this.webSocketGate.on("connection", async (webSocket) => {
        webSocket.id = crypto.randomUUID();
        this.workspaceClients[webSocket.id] = {
          webSocket: webSocket,
          messagePool: {},
          send: async (message) => {
            this.workspaceClients[webSocket.id].webSocket.send(
              JSON.stringify(Object.assign(message, { id: webSocket.id }))
            );
            const R = new Promise((resolve, reject) => {
              this.workspaceClients[webSocket.id].messagePool[webSocket.id] = (_) => {
                resolve(_);
              };
            });
            return R;
          }
        };
        [...this.webSocketServer.clients].forEach((client) => {
          client.send(
            JSON.stringify(
              {
                type: "ReLoad",
              }
            )
          );
        });


        webSocket.on("message", async (message) => {
          const data = JSON.parse(message);
          if (data.id in this.workspaceClients[webSocket.id].messagePool) {
            await this.workspaceClients[webSocket.id].messagePool[data.id](data);
            delete this.workspaceClients[webSocket.id].messagePool[data.id];
          } else {
            push_function[data.type](data);
          }
        });
        webSocket.on("close", () => {
          delete this.workspaceClients[webSocket.id];
          [...this.webSocketServer.clients].forEach((client) => {
            client.send(
              JSON.stringify(
                {
                  type: "ReLoad",
                }
              )
            );
          });
        });
      });
    }
    this.OnLine = true;
  }

  stop() {
    this.httpServer.close();
    this.webSocketServer.close();
    this.webSocketGate.close();
  }
}
