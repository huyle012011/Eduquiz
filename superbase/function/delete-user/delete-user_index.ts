// supabase/functions/delete-user/index.ts
//
// Supabase Edge Function — hard-delete the authenticated user from auth.users.
//
// DEPLOY:
//   supabase functions deploy delete-user --no-verify-jwt
//   (no-verify-jwt is NOT set — we want JWT verification ON, see below)
//
//   Or via Supabase Dashboard → Edge Functions → New Function
//
// CALL FROM FRONTEND (replace authService.deleteAccount):
//
//   const { error } = await supabase.functions.invoke('delete-user');
//   if (error) throw new Error(error.message);
//   await supabase.auth.signOut();
//
// HOW IT WORKS:
//   1. The client sends its JWT in the Authorization header (automatic via supabase.functions.invoke)
//   2. This function verifies the JWT to get the caller's user ID
//   3. Uses the service-role key (set as SUPABASE_SERVICE_ROLE_KEY secret) to delete the user
//   4. Cascade: profiles row is deleted by ON DELETE CASCADE on auth.users FK
//      Quizzes author_id is set to NULL by ON DELETE SET NULL
//      Attempts remain (they reference quiz_id, not user_id FK)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- Verify the caller is authenticated ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Client (anon key) to verify JWT and get the user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Delete the user using service-role key (bypasses RLS) ---
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('Delete user error:', deleteError);
      return new Response(
        JSON.stringify({ error: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
