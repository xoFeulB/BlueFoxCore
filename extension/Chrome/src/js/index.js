// © BlueFoxEnterprise
// https://github.com/xoFeulB

import { BlueFoxJs } from "/src/js/modules/BlueFoxJs/bluefox.es.min.js";
import { BlueFoxScript as _BlueFoxScript } from "/src/js/modules/BlueFoxScript/bluefox.script.js";
import { DEFINE } from "/src/js/modules/Values/define.js";


(async () => {
  /* Global */ {
    window.define = await DEFINE;
    window.sleep = (msec) => new Promise((resolve) => setTimeout(resolve, msec));
    window.workspaces = [];
    window.BlueFoxJs = BlueFoxJs;
    window.BlueFoxScript = class extends _BlueFoxScript {
      async runWorkspaceScript(path) {
        let regexp_object = new RegExp(path, "g");
        await (window.workspaces.filter((_) => {
          return regexp_object.test(_.path);
        })[0]).play();
      }
      async getWorkspaceFile(path) {
        let regexp_object = new RegExp(path, "g");
        let workspaceObject = (window.workspaces.filter((_) => {
          return regexp_object.test(_.path);
        })[0]).workspaceObject;

        let fetch_result = await fetch(
          `${window.define.BluefoxGateHttpServer}/R?/${workspaceObject.id}/${workspaceObject.workspace}${workspaceObject.path}`
        );
        let B = await fetch_result.blob();

        return {
          name: workspaceObject.path.split("/").slice(-1)[0],
          type: fetch_result.headers.get("Content-Type"),
          blob: [...new Uint8Array(await B.arrayBuffer())],
          object: "Uint8Array",
        };
      }
      async runScript(script) {
        let CurrentTab = await chrome.tabs.getCurrent();
        let R = await chrome.runtime.sendMessage(
          {
            tabId: CurrentTab.id,
            object: {
              method: "Runtime.evaluate",
              params: {
                expression: script,
                objectGroup: "BlueFox-js-lanch",
                awaitPromise: true,
                returnByValue: true,
                userGesture: true,
              },
            },
          }
        );
        return R.result;
      }
    }
  }

  /* WebSocket */ {
    let webSocket;
    let start_ws = async () => {
      try {
        webSocket?.close();
        webSocket = (new WebSocket(window.define.BluefoxGateWebSocketServer));
        let webSocketMessageHandler = {
          "getFileTree": async (data) => {
            let workspaces = await (await fetch(`${window.define.BluefoxGateHttpServer}/GetWorkspace.get`)).json();
            window.workspaces = [];
            workspaces.forEach((workspace) => {
              workspace.workspace.forEach((folder) => {
                folder.objects
                  .filter((object) => {
                    return [
                      object.isFile,
                    ].every((_) => { return _; });
                  })
                  .forEach((object) => {
                    window.workspaces.push({
                      id: workspace.id,
                      workspace: folder.name,
                      path: object.path,
                      play: async (event) => {
                        await webSocketMessageHandler["dispatch"](
                          {
                            id: workspace.id,
                            workspace: folder.name,
                            path: object.path
                          }
                        );
                      },
                    });
                  });
              });
            });
          },
          "RunScript": async (data) => {
            let CurrentTab = await chrome.tabs.getCurrent();
            let R = await chrome.runtime.sendMessage(
              {
                tabId: CurrentTab.id,
                object: {
                  method: "Runtime.evaluate",
                  params: {
                    tabId: CurrentTab.id,
                    expression: data.content,
                    objectGroup: "BlueFox-js-lanch",
                    awaitPromise: true,
                    returnByValue: true,
                    userGesture: true,
                  },
                },
              }
            );
            delete data.content;
            webSocket.send(
              JSON.stringify(
                Object.assign(data, R.result)
              )
            );
          },
          "ReLoad": async (data) => {
            window.dispatchEvent(new CustomEvent("reload_ws"));
          },
        };
        webSocket.addEventListener("message", async (event) => {
          let data = JSON.parse(event.data);
          if (data.type in webSocketMessageHandler) {
            await webSocketMessageHandler[data.type](data);
          }
        });
        webSocket.addEventListener("error", async (event) => {
          await sleep(3000);
          window.dispatchEvent(new CustomEvent("reload_ws"));
        });
        webSocket.addEventListener("close", async (event) => {
        });

        await webSocketMessageHandler["getFileTree"](null);
      } catch (e) {
        log(e);
        await sleep(3000);
        window.dispatchEvent(new CustomEvent("reload_ws"));
      }
    }
    window.addEventListener("reload_ws", () => {
      start_ws();
    });
    window.dispatchEvent(new CustomEvent("reload_ws"));
  }
})();

