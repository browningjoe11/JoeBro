import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { supabaseAuth } from "./core/auth";
import { supabaseCalendar } from "./core/calendar";
import { supabaseContacts } from "./core/contacts";
import { supabaseCrews } from "./core/crews";
import { supabasePriceBook } from "./core/pricebook";
import { supabaseSettings } from "./core/settings";
import { supabaseTickets } from "./core/tickets";
import { supabaseImport } from "./core/import";
import { supabaseEstimates } from "./core/estimate";
import { getSupabase } from "./lib/supabase";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/components.css";

const supabase = getSupabase();
const auth = supabase ? supabaseAuth(supabase) : null;
const settings = supabase ? supabaseSettings(supabase) : undefined;
const tickets = supabase ? supabaseTickets(supabase) : undefined;
const contacts = supabase ? supabaseContacts(supabase) : undefined;
const calendar = supabase ? supabaseCalendar(supabase) : undefined;
const priceBook = supabase ? supabasePriceBook(supabase) : undefined;
const crmImport = supabase ? supabaseImport(supabase) : undefined;
const crews = supabase ? supabaseCrews(supabase) : undefined;
const estimates = supabase ? supabaseEstimates(supabase) : undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App auth={auth} settings={settings} tickets={tickets} contacts={contacts} calendar={calendar} priceBook={priceBook} crmImport={crmImport} crews={crews} estimates={estimates} />
    </BrowserRouter>
  </StrictMode>,
);
