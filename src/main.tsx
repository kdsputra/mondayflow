import { createRoot } from "react-dom/client";
import App from "./App";
import { registerPwa } from "./pwa";
import { startObservability } from "./reliability";
import "./styles.css";

registerPwa();
startObservability();
createRoot(document.getElementById("root")!).render(<App />);
