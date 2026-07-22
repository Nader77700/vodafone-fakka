const fs = require('fs');
let code = fs.readFileSync('src/lib/api.ts', 'utf8');

const regex = /export async function getAdminOverview\(\): Promise<\{[\s\S]*?used_codes: number;\n\}> \{[\s\S]*?return \{[\s\S]*?used_codes:[\s\S]*?\}\s*;/;
const match = code.match(regex);
if (match) {
  const newFunc = `export async function getAdminOverview(): Promise<{
  total_users: number;
  active_subs: number;
  expired_subs: number;
  total_operations: number;
  total_success_operations: number;
  total_failed_operations: number;
  total_cards: number;
  total_revenue: number;
  total_codes: number;
  used_codes: number;
}> {
  const { data, error } = await supabase.rpc('get_admin_overview_stats_v2');
  if (error) {
    console.error('Error in getAdminOverview:', error);
    return {
      total_users: 0, active_subs: 0, expired_subs: 0, total_operations: 0,
      total_success_operations: 0, total_failed_operations: 0, total_cards: 0,
      total_revenue: 0, total_codes: 0, used_codes: 0
    };
  }
  return data as any;
}`;
  code = code.replace(match[0], newFunc);
  fs.writeFileSync('src/lib/api.ts', code);
  console.log("Patched successfully");
} else {
  console.log("Regex not found");
}
