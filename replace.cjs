const fs = require('fs');
let content = fs.readFileSync('src/pages/HomePage.tsx', 'utf8');

const oldStr = `                    </div>
                    <div className="divide-y divide-white/[0.04]">
                      {seamlessDebug && (`

const newStr = `                    </div>
                    <div className="divide-y divide-white/[0.04]">
                      {/* ── FULL TRACE REPORT ── */}
                      {traceReport && (
                        <div className="px-3 py-2 space-y-2 bg-yellow-400/5">
                           <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0 bg-yellow-400/20 text-yellow-300">
                                FULL PIPELINE TRACE
                              </span>
                              <span className="text-[10px] font-mono font-semibold truncate text-yellow-200">
                                {traceReport.traceId}
                              </span>
                           </div>
                           
                           <div className="space-y-1">
                             {traceReport.steps.map((step: any, idx: number) => (
                               <div key={idx} className="flex flex-col text-[10px] font-mono mb-1 p-1.5 rounded" style={{ background: step.status === 'Failed' ? '#ff000015' : 'transparent' }}>
                                 <div className="flex items-center justify-between">
                                   <span style={{ color: step.status === 'Success' ? '#4ade80' : step.status === 'Failed' ? '#f87171' : '#94a3b8' }}>
                                     {step.status === 'Success' ? '✅' : step.status === 'Failed' ? '❌' : '⏳'} [{step.id}] {step.name} {step.executionTimeMs ? \`(\${step.executionTimeMs}ms)\` : ''}
                                   </span>
                                   <span style={{ color: '#ffffff50', fontSize: '8px' }}>
                                     {new Date(step.timestamp).toISOString().split('T')[1].replace('Z', '')}
                                   </span>
                                 </div>
                                 <div style={{ color: '#ffffff50', fontSize: '9px', marginTop: '2px' }}>
                                   {step.file} -&gt; {step.className ? step.className + '.' : ''}{step.funcName}()
                                 </div>
                                 {step.status === 'Failed' && step.details && (
                                   <div className="mt-1 p-1.5 rounded bg-red-500/10 text-red-300 whitespace-pre-wrap break-all text-[8.5px]">
                                      {typeof step.details === 'object' ? JSON.stringify(step.details, null, 2) : String(step.details)}
                                   </div>
                                 )}
                               </div>
                             ))}
                           </div>

                           {traceReport.requests && traceReport.requests.length > 0 && (
                             <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                               <div className="text-[9px] font-bold text-blue-400 mb-1.5">NETWORK DIAGNOSTICS:</div>
                               {traceReport.requests.map((req: any, idx: number) => (
                                 <div key={idx} className="p-1.5 rounded border border-blue-500/20 bg-blue-500/5 text-[8.5px] font-mono text-blue-200">
                                   <div className="font-bold text-white mb-0.5">{req.method} {req.url}</div>
                                   <div className="flex justify-between mt-1">
                                     <span>TCP: {req.tcpConnected ? '✅' : '❌'}</span>
                                     <span>Sent: {req.requestSent ? '✅' : '❌'}</span>
                                     <span>Bytes: {req.bytesReceived || 0}</span>
                                   </div>
                                   <div className="mt-1 opacity-70">
                                     Timeouts (Conn/Read): {req.timeoutValue}ms
                                   </div>
                                   {req.error && <div className="text-red-400 mt-1.5 p-1 bg-red-500/10 rounded">Error ({req.errorSource}): {req.error}</div>}
                                 </div>
                               ))}
                             </div>
                           )}

                           <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                              <div className="text-[10px] font-bold text-red-400">PROBLEM SOURCE:</div>
                              <div className="text-[10px] font-bold text-white px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30">
                                {traceReport.analysis?.problemSource || 'Unknown'}
                              </div>
                           </div>
                        </div>
                      )}

                      {seamlessDebug && (`

content = content.split(oldStr).join(newStr);
fs.writeFileSync('src/pages/HomePage.tsx', content);
