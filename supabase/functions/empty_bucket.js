import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://vchmsnavyhripakyvzom.supabase.co";
const supabaseKey = "";
const supabase = createClient(supabaseUrl, supabaseKey);

async function emptyBucket(bucketName) {
  let hasMore = true;
  let totalDeleted = 0;
  
  while (hasMore) {
    const { data: files, error } = await supabase.storage.from(bucketName).list('', { limit: 100 });
    if (error) {
      console.error("Error listing files:", error);
      break;
    }
    if (!files || files.length === 0) {
      hasMore = false;
      break;
    }
    
    let allPaths = [];
    for (const file of files) {
      if (!file.id) { // Folder
        const { data: subFiles } = await supabase.storage.from(bucketName).list(file.name, { limit: 100 });
        if (subFiles) {
          allPaths.push(...subFiles.map(f => `${file.name}/${f.name}`));
        }
      } else {
        allPaths.push(file.name);
      }
    }
    
    if (allPaths.length === 0) break;
    
    const { error: delError } = await supabase.storage.from(bucketName).remove(allPaths);
    if (delError) {
      console.error("Error deleting:", delError);
      break;
    }
    totalDeleted += allPaths.length;
    console.log(`Deleted ${allPaths.length} files from ${bucketName}...`);
  }
  console.log(`Finished emptying ${bucketName}. Total deleted: ${totalDeleted}`);
}

await emptyBucket('web-live');
await emptyBucket('apk-files');
await emptyBucket('app-assets');
