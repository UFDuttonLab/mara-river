import { createClient } from '@supabase/supabase-js';
import type { CameraDatabase } from './camera-types';

const CAMERA_SUPABASE_URL = 'https://qkkuiojsexppquvxpgyu.supabase.co';
const CAMERA_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFra3Vpb2pzZXhwcHF1dnhwZ3l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1ODA4NzEsImV4cCI6MjA3NzE1Njg3MX0.DgDAuuMPPNcCK9-CSquv8oGJp4vVduYVqJHKZDnF4-I';

// Secondary Supabase client for camera images database
export const cameraSupabase = createClient<CameraDatabase>(
  CAMERA_SUPABASE_URL,
  CAMERA_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: false,
      autoRefreshToken: false,
    }
  }
);
