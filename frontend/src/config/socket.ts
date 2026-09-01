import { io } from "socket.io-client";
import { WS_URL } from "./api";

export const socket = io(WS_URL, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});