import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { supabaseAuth } from "./core/auth";
import { supabaseSettings } from "./core/settings";
import { getSupabase } from "./lib/supabase";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/components.css";

const supabase = getSupabase();
const auth = supabase ? supabaseAuth(supabase) : null;
const settings = supabase ? supabaseSettings(supabase) : undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App auth={auth} settings={settings} />
    </BrowserRouter>
  </StrictMode>,
);
