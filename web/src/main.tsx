import "@fontsource/noto-sans-thai/thai-400.css";
import "@fontsource/noto-sans-thai/thai-500.css";
import "@fontsource/noto-sans-thai/thai-700.css";
import "./index.css";
import { render } from "preact";
import { App } from "./App";

render(<App />, document.getElementById("app")!);
