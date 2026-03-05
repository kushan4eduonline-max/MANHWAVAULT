import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  try {
    const { user_id } = await req.json();

    // 1. Get user's high-rated titles (7+)
    const { data: highRated } = await supabase
      .from('titles')
      .select('title, tags, rating')
      .gte('rating', 7)
      .eq('user_id', user_id);

    if (!highRated || highRated.length === 0) {
      return new Response(JSON.stringify({ message: "No high-rated titles found." }), { status: 200 });
    }

    // 2. Extract tags and genres
    const favoriteTags = new Set<string>();
    highRated.forEach(t => t.tags.forEach(tag => favoriteTags.add(tag)));

    // 3. Generate recommendations (Mock logic for now, as we don't have a full external DB)
    // In a real scenario, we would query an external API or a large internal DB of titles
    // Here we will generate some mock recommendations based on the tags
    
    const recommendations = [];
    const mockTitles = [
      { title: "Solo Leveling", tags: ["Action", "Fantasy"], cover: "https://example.com/sl.jpg" },
      { title: "The Beginning After The End", tags: ["Fantasy", "Magic"], cover: "https://example.com/tbate.jpg" },
      { title: "Omniscient Reader's Viewpoint", tags: ["Action", "System"], cover: "https://example.com/orv.jpg" },
      { title: "Tower of God", tags: ["Fantasy", "Adventure"], cover: "https://example.com/tog.jpg" },
      { title: "Eleceed", tags: ["Action", "Comedy"], cover: "https://example.com/eleceed.jpg" }
    ];

    for (const rec of mockTitles) {
      // Simple matching
      const matchScore = rec.tags.filter(t => favoriteTags.has(t)).length;
      if (matchScore > 0) {
        recommendations.push({
          user_id,
          title: rec.title,
          cover: rec.cover,
          tags: rec.tags,
          source_title: highRated[0].title, // Just pick one for "Because you liked"
          score: matchScore * 3 // Simple scoring
        });
      }
    }

    // 4. Store recommendations
    if (recommendations.length > 0) {
      await supabase.from('recommendations').delete().eq('user_id', user_id); // Clear old
      await supabase.from('recommendations').insert(recommendations);
    }

    return new Response(
      JSON.stringify({ message: `Generated ${recommendations.length} recommendations.` }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
