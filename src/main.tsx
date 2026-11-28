import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { supabaseAuth } from "./core/auth";
import { getSupabase } from "./lib/supabase";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/components.css";

const supabase = getSupabase();
const auth = supabase ? supabaseAuth(supabase) : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App auth={auth} />
    </BrowserRouter>
  </StrictMode>,
);
