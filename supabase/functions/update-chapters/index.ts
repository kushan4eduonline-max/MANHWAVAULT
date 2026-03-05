import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const AGGREGATORS = [
  "https://comick.dev/",
  "https://mangadex.org/",
  "https://www.mgeko.cc/"
];

serve(async (req) => {
  try {
    // 1. Fetch all titles that are being tracked (status = Reading/Planned)
    const { data: titles, error } = await supabase
      .from('titles')
      .select('id, title, ch, site')
      .in('status', ['Reading', 'Planned']);

    if (error) throw error;

    const updates = [];

    for (const title of titles) {
      // Mock fetching logic - in a real scenario, we would parse the aggregator HTML/API
      // For this demo, we simulate finding a new chapter occasionally
      const randomChance = Math.random();
      if (randomChance > 0.7) {
        const newChapter = title.ch + 1 + Math.floor(Math.random() * 2);
        
        // Update latest_chapter column
        const { error: updateError } = await supabase
          .from('titles')
          .update({ latest_chapter: newChapter })
          .eq('id', title.id);
          
        if (!updateError) {
          updates.push({ title: title.title, newChapter });
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `Checked ${titles.length} titles. Updated ${updates.length}.`, updates }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
