export type TraceStep = {
  id: number;
  name: string;
  file: string;
  className: string;
  funcName: string;
  timestamp: number; // Date.now()
  executionTimeMs?: number;
  status: 'Started' | 'Success' | 'Failed';
  details?: any;
};

export type TraceRequest = {
  method: string;
  url: string;
  headers: any;
  bodyPreview: string; // no sensitive data
  timeoutValue: number;
  startTime: number;
  endTime?: number;
  responseSize?: number;
  responseCode?: number;
  error?: string;
};

export class DiagnosticTrace {
  public traceId: string;
  public steps: TraceStep[] = [];
  public requests: TraceRequest[] = [];
  private stepCounter = 1;
  private startTime = Date.now();

  constructor(prefix: string = 'CHG') {
    const now = new Date();
    const dateStr = now.toISOString().replace(/T/, '-').replace(/:/g, '').split('.')[0];
    this.traceId = `TRACE:${prefix}-${dateStr}-${Math.floor(Math.random() * 1000)}`;
  }

  addStep(name: string, file: string, className: string, funcName: string, status: 'Started' | 'Success' | 'Failed', details?: any) {
    const ts = Date.now();
    let execTimeMs = undefined;
    
    // Find matching started step to calculate execution time
    if (status === 'Success' || status === 'Failed') {
      const startStep = [...this.steps].reverse().find(s => s.name === name && s.status === 'Started');
      if (startStep) {
        execTimeMs = ts - startStep.timestamp;
      }
    }

    const step: TraceStep = {
      id: this.stepCounter++,
      name,
      file,
      className,
      funcName,
      timestamp: ts,
      executionTimeMs: execTimeMs,
      status,
      details
    };
    this.steps.push(step);
    return step;
  }

  logRequestStart(method: string, url: string, headers: any, bodyPreview: string, timeoutValue: number): number {
    const req: TraceRequest = {
      method,
      url,
      headers: { ...headers }, // Clone
      bodyPreview,
      timeoutValue,
      startTime: Date.now()
    };
    this.requests.push(req);
    return this.requests.length - 1; // return index
  }

  logRequestEnd(index: number, responseCode: number, responseSize: number, error?: string) {
    if (this.requests[index]) {
      this.requests[index].endTime = Date.now();
      this.requests[index].responseCode = responseCode;
      this.requests[index].responseSize = responseSize;
      this.requests[index].error = error;
    }
  }

  getReport() {
    const lastSuccessful = [...this.steps].reverse().find(s => s.status === 'Success');
    const firstFailed = this.steps.find(s => s.status === 'Failed');
    const lastExecuted = this.steps[this.steps.length - 1];

    let problemSource = 'Unknown';
    if (firstFailed) {
      if (firstFailed.name.includes('Native Bridge') || firstFailed.name.includes('CapacitorHttp')) problemSource = 'Native Bridge';
      else if (firstFailed.name.includes('Vodafone API') || firstFailed.name.includes('Token')) problemSource = 'Vodafone API';
      else if (firstFailed.name.includes('Edge Function') || firstFailed.name.includes('Server')) problemSource = 'Edge Function';
      else if (firstFailed.name.includes('UI')) problemSource = 'UI';
      else if (firstFailed.name.includes('Timeout') || firstFailed.details?.error?.includes('timeout')) problemSource = 'Timeout';
      else problemSource = firstFailed.name;
    }

    return {
      traceId: this.traceId,
      totalDurationMs: Date.now() - this.startTime,
      steps: this.steps,
      requests: this.requests,
      analysis: {
        lastSuccessfulStep: lastSuccessful ? `${lastSuccessful.name} (${lastSuccessful.funcName})` : 'None',
        firstFailedStep: firstFailed ? `${firstFailed.name} (${firstFailed.funcName})` : 'None',
        lastExecutedStep: lastExecuted ? `${lastExecuted.name} (${lastExecuted.funcName}) in ${lastExecuted.file}` : 'None',
        responsibleFile: firstFailed ? firstFailed.file : (lastExecuted ? lastExecuted.file : 'Unknown'),
        responsibleFunction: firstFailed ? firstFailed.funcName : (lastExecuted ? lastExecuted.funcName : 'Unknown'),
        failureReason: firstFailed ? JSON.stringify(firstFailed.details) : 'None',
        problemSource
      }
    };
  }
}
