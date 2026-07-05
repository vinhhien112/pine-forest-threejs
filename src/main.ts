import "./style.css";
import { startLaas } from "./render/app/startLaas";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

void startLaas(root);
