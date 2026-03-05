import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), { status: 400 });
    }

    // Fetch the HTML
    const response = await fetch(url);
    const html = await response.text();

    // Basic regex parsing for OG tags (since we can't use heavy scraping libs easily in Deno edge without imports)
    const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);

    const title = ogTitleMatch ? ogTitleMatch[1] : (titleMatch ? titleMatch[1] : "Unknown Title");
    const image = ogImageMatch ? ogImageMatch[1] : "";

    return new Response(
      JSON.stringify({ title, image }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
