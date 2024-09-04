export class SendCommand {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.messagePool = {};
    this.isOpen = false;

    let array = new Uint16Array(1);
    this.message_id = crypto.getRandomValues(array)[0];
    let _resolve_ = () => { };
    let _reject_ = () => { };

    this.socket.addEventListener("message", (event) => {
      let message = JSON.parse(event.data);
      if (message.id in this.messagePool) {
        this.messagePool[message.id](message);
        delete this.messagePool[message.id];
      } else if (message.webSocketDebuggerUrl) {
        this.isOpen = true;
        _resolve_(this);
      }
    });
    this.socket.addEventListener("close", (event) => {
      this.isOpen = false;
    });
    this.socket.addEventListener("error", (event) => {
      this.isOpen = false;
      _reject_(event);
    });

    return new Promise((resolve, reject) => {
      this.isOpen ? resolve(this) : _resolve_ = resolve;
      _reject_ = reject;
    });
  }


  async send(message) {
    let id = ++this.message_id;

    this.socket.send(JSON.stringify(
      Object.assign(
        {
          id: id,
        },
        message
      )
    ));
    let R = new Promise((resolve, reject) => {
      this.messagePool[id] = (_) => {
        resolve(_);
      };
    });
    return R;
  }

  close() {
    this.socket.close();
  }
}
