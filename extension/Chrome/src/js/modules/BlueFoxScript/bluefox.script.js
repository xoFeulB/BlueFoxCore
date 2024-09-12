// © BlueFoxEnterprise
// https://github.com/xoFeulB

import { BlueFoxJs } from "/src/js/modules/BlueFoxJs/bluefox.es.min.js";
import { Connector } from "/src/js/modules/PostMessage/postMessage.awaitable.module.js";

("use strict");

class Tab {
  constructor(tabInfo, responsesLimit = 3) {
    try {
      tabInfo.url = new URL(tabInfo.url);
    } catch (e) { }
    this.info = tabInfo;
    this.cookie = {
      get: async (option) => {
        let R = await chrome.cookies.getAll(Object.assign({ domain: this.info.url.hostname }, option));
        return R;
      },
      set: async (cookie) => {
        let R = await chrome.cookies.set(Object.assign({ url: this.info.url.href }, cookie));
        return R;
      },
      remove: async (cookie) => {
        let R = await chrome.cookies.remove(Object.assign({ url: this.info.url.href }, cookie));
        return R;
      },
    };
    this.tails = (config) => {
      return new (
        class extends (BlueFoxJs.Automation.BlueFoxScript) {
          constructor() {
            super(config);
            return this;
          }
          async getProperties(selector = this.selector) {
            let connector = new Connector();
            await connector.load(tabInfo.id);
            let message = await connector.post({
              BlueFoxGetElementProperties: {
                selector: selector,
              },
            });
            return message.BlueFoxGetElementProperties;
          }
          async run(object) {
            let connector = new Connector();
            await connector.load(tabInfo.id);
            let R = await connector.post({
              BlueFoxDispatchAction: JSON.stringify(Object.assign(this.tail, object)),
            });
            return R.BlueFoxDispatchAction;
          }
          async runTillNextOnLoad(object, max_polling = 20) {
            let connector = new Connector();
            let uuid_prev = await new Promise((resolve, reject) => {
              let polling_count = max_polling;
              let polling = () => {
                setTimeout(async () => {
                  try {
                    if (!polling_count--) {
                      reject();
                      return;
                    }
                    await connector.load(tabInfo.id);
                    let uuid = (await connector.post({
                      TabWindowOnLoad: {},
                    })).TabWindowOnLoad;
                    if (!uuid) {
                      polling();
                    } else {
                      resolve(uuid);
                    }
                  } catch (e) {
                    polling();
                  }
                }, 100)
              }
              polling();
            });
            await connector.load(tabInfo.id);
            let R = await connector.post({
              BlueFoxDispatchAction: JSON.stringify(Object.assign(this.tail, object)),
            });
            return await new Promise((resolve, reject) => {
              let polling_count = max_polling;
              let polling = () => {
                setTimeout(async () => {
                  try {
                    if (!polling_count--) {
                      reject();
                      return;
                    }
                    await connector.load(tabInfo.id);
                    let uuid = (await connector.post({
                      TabWindowOnLoad: {},
                    })).TabWindowOnLoad;
                    if (!uuid || uuid_prev == uuid) {
                      polling();
                    } else {
                      resolve(await R.BlueFoxDispatchAction);
                    }
                  } catch (e) {
                    polling();
                  }
                }, 100)
              }
              polling();
            });
          }
          saveTail(title, description, object) {
            let R = JSON.parse(JSON.stringify(this.tail));

            R.meta.title = title;
            R.meta.description = description;

            Object.assign(document.createElement("a"), {
              href: window.URL.createObjectURL(
                new Blob([JSON.stringify(Object.assign(R, object), null, 4)], {
                  type: "application/json",
                })
              ),
              download: `${title}.json`,
            }).click();
            return this;
          }
          saveJSON(file_name, object) {
            Object.assign(document.createElement("a"), {
              href: window.URL.createObjectURL(
                new Blob([JSON.stringify(object, null, 4)], {
                  type: "application/json",
                })
              ),
              download: `${file_name}.json`,
            }).click();
            return this;
          }
        }
      )();
    }
  }

  async setUserAgentOverride(parameters) {
    // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setUserAgentOverride
    return await this.sendCommand(
      "Emulation.setUserAgentOverride",
      parameters
    );
  }
  async emulateNetworkConditions(parameters) {
    // https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions
    return await this.sendCommand(
      "Network.emulateNetworkConditions",
      parameters
    );
  }
  async setCPUThrottlingRate(parameters) {
    // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate
    return await this.sendCommand(
      "Emulation.setCPUThrottlingRate",
      parameters
    );
  }
  async setDeviceMetricsOverride(parameters) {
    // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setDeviceMetricsOverride
    return await this.sendCommand(
      "Emulation.setDeviceMetricsOverride",
      parameters
    );
  }
  async setTimezoneOverride(parameters) {
    // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setTimezoneOverride
    return await this.sendCommand(
      "Emulation.setTimezoneOverride",
      parameters
    );
  }
  async setDownloadBehavior(parameters) {
    // https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-setDownloadBehavior
    return await this.sendCommand(
      "Page.setDownloadBehavior",
      parameters
    );
  }
  async sendCommand(method, params) {
    return chrome.runtime.sendMessage(
      {
        tabId: this.info.id,
        object: {
          method: method,
          params: params,
        },
      }
    );
  }

  async close() {
    return await chrome.windows.remove(this.info.windowId);
  }
  async reload() {
    await chrome.tabs.reload(this.info.id);
  }
  async dispatchScript(callable) {
    let R = await this.sendCommand(
      "Runtime.evaluate",
      {
        expression: `(${callable.toString()})();`,
        objectGroup: "BlueFox-js-lanch",
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      }
    );
    return R.result;
  }
  async dispatchAction(object) {
    let connector = new Connector();
    await connector.load(this.info.id);
    return (await connector.post({
      BlueFoxDispatchAction: JSON.stringify(object),
    })).BlueFoxDispatchAction;
  }
  async getScreenshot(selector, config = { format: "png", quality: 100, captureBeyondViewport: true }) {
    let target = (await this.sendCommand(
      "Runtime.evaluate",
      {
        expression: `(() => {return JSON.parse(JSON.stringify({domRect:document.querySelector(\`${selector}\`).getBoundingClientRect(),scrollY:window.scrollY}));})();`,
        objectGroup: "BlueFox-js-lanch",
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      }
    )).result.result.value;
    let base64 = (await this.sendCommand(
      "Page.captureScreenshot",
      Object.assign(
        {
          format: "png",
          quality: 100,
          captureBeyondViewport: true,
          clip: {
            x: target.domRect.x,
            y: target.domRect.top + target.scrollY,
            width: target.domRect.width,
            height: target.domRect.height,
            scale: 1,
          },
        },
        config
      )
    )).result.data;
    return new Uint8Array(
      [...atob(base64.replace(/^.*,/, ''))].map((_) => {
        return _.charCodeAt(0);
      })
    );
  }
  async dispatchScriptTillTrue(callable, max_polling = 20) {
    return new Promise((resolve, reject) => {
      let polling_count = max_polling;
      let polling = () => {
        setTimeout(async () => {
          try {
            if (!polling_count--) {
              reject();
              return;
            }
            let R = (await this.sendCommand(
              "Runtime.evaluate",
              {
                expression: `(${callable.toString()})();`,
                objectGroup: "BlueFox-js-lanch",
                awaitPromise: true,
                returnByValue: true,
                userGesture: true,
              }
            )).result;
            if (!R.result.value) {
              polling();
            } else {
              resolve(R);
            }
          } catch (e) {
            polling();
          }
        }, 100)
      }
      polling();
    });
  }
  async addEventListeners(selector, event_type, callback) {
    let connector = new Connector();
    let uuid = crypto.randomUUID();
    await connector.load(this.info.id);
    connector.connector.onMessage.addListener((P) => {
      if (P.uuid == uuid) {
        callback(P.object);
      }
    });
    return (await connector.post({
      BlueFoxScriptAddEventListener: {
        uuid: uuid,
        selector: selector,
        event_type: event_type
      },
    })).BlueFoxScriptAddEventListener;
  }
  async getEventListners() {
    let R = (
      await this.sendCommand(
        "DOMDebugger.getEventListeners",
        {
          objectId: (
            await this.sendCommand(
              "Runtime.evaluate",
              {
                expression: "(()=>{return document;})()",
                objectGroup: "event-listeners-test",
              }
            )
          ).result.objectId,
          depth: -1,
        }
      )
    );
    return R;
  }
  async getSelectors(selector) {
    let connector = new Connector();
    await connector.load(this.info.id);
    let R = await connector.post({
      BlueFoxGetSelectors: {
        selector: selector,
      },
    });
    return R.BlueFoxGetSelectors;
  }
}

export class BlueFoxScript extends (Object) {
  constructor(option) {
    super();
    return new Promise((resolve, reject) => {
      this.init(resolve, option);
    });
  }

  async init(resolve, option = {}) {
    /* Tab */{
      chrome.debugger.onDetach.addListener(
        async (source, reason) => {
          let handler = {
            "canceled_by_user": async (source) => {
              this[source.tabId].isDebugging = false;
            },
            "target_closed": async (source) => { },
          };
          if (reason in handler) {
            await handler[reason](source);
          }
        }
      );
      chrome.tabs.onRemoved.addListener(
        async (tabId, removeInfo) => {
          delete this[tabId];
        }
      );
      chrome.tabs.onUpdated.addListener(
        async (tabId, changeInfo, tab) => {
          if (tabId in this) {
            tab.url = new URL(tab.url);
            this[tabId].info = tab;
          } else {
            this[tab.id] = new Tab(tab);
            // await this[tab.id].setUserAgentOverride({ userAgent: "^.,.^ BlueFox" });
          }
        }
      );
      chrome.tabs.onCreated.addListener(
        async (tabInfo) => {
          this[tabInfo.id] = new Tab(tabInfo);
          Object.entries(option).forEach(([key, value]) => {
            if (key in this[tabInfo.id]) {
              this[tabInfo.id][key](value);
            }
          });
        }
      );

      for (let tabInfo of [...(await chrome.tabs.query({ url: "<all_urls>" }))]) {
        this[tabInfo.id] = new Tab(tabInfo);
        Object.entries(option).forEach(([key, value]) => {
          if (key in this[tabInfo.id]) {
            this[tabInfo.id][key](value);
          }
        });
      }
    }

    resolve(this);
  }

  // interface
  async runWorkspaceScript() { }
  async getWorkspaceFile() { }
  async runScript() { }

  closeBlowser() {
    return chrome.runtime.sendMessage(
      {
        object: {
          method: "Browser.close",
          params: {},
        },
      }
    );
  }

  findTab(regexp) {
    let regexp_object = new RegExp(regexp, "g");
    return Object.entries(this).filter(([key, tab]) => {
      return regexp_object.test(tab.info.url.href);
    }).map(([key, tab]) => {
      return tab;
    });
  }
  async createWindow(url, max_polling = 20, option = { focused: false, top: 0, left: 0 }) {
    let connector = new Connector();
    let created = await chrome.windows.create(
      Object.assign(
        {
          url: url,
        }, option
      )
    );

    await new Promise((resolve, reject) => {
      let polling_count = max_polling;
      let polling = () => {
        setTimeout(async () => {
          try {
            if (!polling_count--) {
              reject();
              return;
            }
            await connector.load(created.tabs[0].id);
            let uuid = (await connector.post({
              TabWindowOnLoad: {},
            })).TabWindowOnLoad;
            if (!uuid) {
              polling();
            } else {
              resolve(uuid);
            }
          } catch (e) {
            polling();
          }
        }, 100)
      }
      polling();
    });
    return Object.entries(this).filter(([key, tab]) => {
      return tab.info.id == created.tabs[0].id;
    }).map(([key, tab]) => {
      return tab;
    })[0];
  }
}
