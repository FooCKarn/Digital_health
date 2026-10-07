import "@fontsource/noto-sans-thai/thai-400.css";
import "@fontsource/noto-sans-thai/thai-500.css";
import "@fontsource/noto-sans-thai/thai-700.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/redesign.css";
import "./index.css";
import { render } from "preact";
import { App } from "./App";

render(<App />, document.getElementById("app")!);
