const fs = require('fs');
let code = fs.readFileSync('src/lib/api.ts', 'utf8');

const regex = /export async function getAdminChartData\(period: ChartPeriod\): Promise<AdminChartPoint\[\]> \{[\s\S]*?return points;\n\}/;
const match = code.match(regex);
if (match) {
  const newFunc = `export async function getAdminChartData(period: ChartPeriod): Promise<AdminChartPoint[]> {
  const { data, error } = await supabase.rpc('get_admin_chart_data_v2', { p_period: period });
  if (error) {
    console.error('Error in getAdminChartData:', error);
    return [];
  }
  return data || [];
}`;
  code = code.replace(match[0], newFunc);
  fs.writeFileSync('src/lib/api.ts', code);
  console.log("Patched chart successfully");
} else {
  console.log("Regex not found for chart");
}
