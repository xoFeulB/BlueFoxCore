import path from "path";
import WebSocket from "ws";
import { glob } from "glob";
import crypto from "crypto";
import fs from "fs";

export class WorkspaceServer {
  constructor(root, wsEntrance = "ws://127.0.0.1:9999") {
    this.root = path.resolve(root).split(path.sep).join(path.posix.sep);
    this.wsEntrance = wsEntrance;
    this.webSocketClient;
    this.workspaceName = crypto.randomUUID();

    this.API = {
      "GetWorkspace": (data) => {
        return {
          workspace: [{
            name: this.workspaceName,
            objects: glob.sync(`${this.root}/**/*`).map(
              (_) => {
                const r = {
                  path: _.replace(/\\/g, "/").slice(this.root.length),
                  isFile: fs.statSync(_).isFile(),
                }
                return r;
              }
            ),
          }]
        };
      },
      "GetFilePath": (data) => {
        const workspaceFolders = {};
        workspaceFolders[this.workspaceName] = this.root;
        return { filePath: `${workspaceFolders[data.workspace]}${data.path}` };
      }
    };
  }

  start() {
    this.webSocketClient = new WebSocket(this.wsEntrance);
    this.webSocketClient.addEventListener("open", (event) => { });
    this.webSocketClient.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      const R = this.API[data.type](data);
      delete data.type;
      this.webSocketClient.send(
        JSON.stringify(Object.assign(data, R))
      );
    });
    this.webSocketClient.addEventListener("close", (event) => { });
    this.webSocketClient.addEventListener("error", (event) => { });
  }
  stop() {
    this.webSocketClient.close();
  }
  runScript(buf) {
    this.webSocketClient.send(
      JSON.stringify({
        type: "RunScript",
        content: buf
      })
    );
  }
}
