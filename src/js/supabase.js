// src/js/supabase.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = 'https://hpxfopnkewuasfmkpmsq.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hIYOpgosLz01TGzF8TQukw_M5e9e1YB';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);