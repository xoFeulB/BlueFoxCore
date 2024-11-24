import { GateServer } from "@xofeulb/bluefox-core-server/GateServer";
import { WorkspaceServer } from "@xofeulb/bluefox-core-server/WorkspaceServer";
import WebSocket, { WebSocketServer } from "ws";
import net from "net"
import open, { apps } from "open";
import fs from "fs";

let log = console.log;

export class BlueFoxCoreServer {
  constructor(UserDataDir, BlueFoxCoreExtensionDir) {
    // UserDataDir="C:\\Users\\<UserName>\\AppData\\Local\\BlueFoxEnterprise\\Chrome"
    this.UserDataDir = UserDataDir;
    // BlueFoxCoreExtensionDir="<PathToBlueFoxCore>\\BlueFoxCore\\Extension"
    this.BlueFoxCoreExtensionDir = BlueFoxCoreExtensionDir;
  }
  async sleep(msec) { return new Promise((resolve) => setTimeout(resolve, msec)) }

  async start(workspacePath) {
    this.wsCoreServerPort = await this.getFreePort();
    this.httpDebugPort = await this.getFreePort();
    this.wsWorkspaceGatePort = await this.getFreePort();
    this.httpGatePort = await this.getFreePort();
    this.wsGatePort = await this.getFreePort();
    this.wsCoreServer = (new WebSocketServer({ port: this.wsCoreServerPort })).on("connection", async (blueFoxCore) => {
      let version = await (await fetch(`http://localhost:${this.httpDebugPort}/json/version`)).json();
      // log(version);
      let debugSocket = new WebSocket(version.webSocketDebuggerUrl);
      await new Promise((resolve) => { debugSocket.once("open", resolve); });
      debugSocket.addEventListener("message", async (event) => {
        // log(event.data);
        blueFoxCore.send(event.data);
      });
      blueFoxCore.addEventListener("message", async (event) => {
        // log(event.data);
        debugSocket.send(event.data);
      });
      blueFoxCore.addEventListener("close", (event) => {
        debugSocket.close();
      });

      blueFoxCore.send(JSON.stringify(version));
    });

    this.gateServer = new GateServer(this.wsWorkspaceGatePort, this.httpGatePort, this.wsGatePort);
    this.workspaceServer = new WorkspaceServer(workspacePath, `ws://localhost:${this.wsWorkspaceGatePort}`);
    this.gateServer.start();
    this.workspaceServer.start();
    await this.writeOutConfig();
  }

  async writeOutConfig() {
    await fs.mkdirSync(`${this.BlueFoxCoreExtensionDir}/Chrome/src/json/`, { recursive: true });
    await fs.writeFileSync(`${this.BlueFoxCoreExtensionDir}/Chrome/src/json/config.json`,
      JSON.stringify({
        "BlueFoxCoreServer": `ws://localhost:${this.wsCoreServerPort}`,
        "BluefoxGateHttpServer": `http://localhost:${this.httpGatePort}`,
        "BluefoxGateWebSocketServer": `ws://localhost:${this.wsGatePort}`
      }), "utf-8");
  }

  async openChrome(headless = false, windowSize = "1920,1080") {
    await open(`BlueFoxCore`, {
      app: {
        name: apps.chrome,
        arguments: headless ? [
          `--disable-dev-shm-usage`,
          `--disable-blink-features=AutomationControlled`,
          `--no-sandbox`,
          `--headless=new`,
          `--disable-gpu`,
          `--user-data-dir=${this.UserDataDir}`,
          `--load-extension=${this.BlueFoxCoreExtensionDir}/Chrome`,
          `--window-size=${windowSize}`,
          `--remote-debugging-port=${this.httpDebugPort}`,
        ] : [
          `--no-sandbox`,
          `--disable-gpu`,
          `--user-data-dir=${this.UserDataDir}`,
          `--load-extension=${this.BlueFoxCoreExtensionDir}/Chrome`,
          `--window-size=${windowSize}`,
          `--remote-debugging-port=${this.httpDebugPort}`,
        ]
      }
    });

    return new Promise((resolve, reject) => {
      let polling_count = 100;
      let polling = () => {
        setTimeout(async () => {
          try {
            if (!polling_count--) {
              reject();
              return;
            }
            if ([...this.gateServer.webSocketServer.clients].length) {
              resolve([...this.gateServer.webSocketServer.clients][0]);
            } else {
              polling();
            }
          } catch (e) {
            polling();
          }
        }, 100)
      }
      polling();
    });
  }

  stop() {
    this.gateServer.stop();
    this.workspaceServer.stop();
    this.wsCoreServer.close();
  }

  async getFreePort() {
    return new Promise(res => {
      const srv = net.createServer();
      srv.listen(0, () => {
        const port = srv.address().port
        srv.close((err) => res(port))
      });
    })
  }
}



