import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://atkmhxljzbnmfrdgpoua.supabase.co";

const SUPABASE_KEY = "sb_publishable_VKi75xepvjQts6WTZCRs4A_eI_EZsmB";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);