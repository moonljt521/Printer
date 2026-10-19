export interface IppJobInfo {
  stateCode?: number;
  impressions?: number;
  impressionsCompleted?: number;
}

const STATE_TEXT: Record<string, number> = {
  pending: 3,
  'pending-held': 4,
  processing: 5,
  'processing-stopped': 6,
  canceled: 7,
  aborted: 8,
  completed: 9,
};

export const JOB_STATE_CANCELED = 7;
export const JOB_STATE_ABORTED = 8;
export const JOB_STATE_COMPLETED = 9;

export function parseIpptoolOutput(text: string): IppJobInfo {
  const info: IppJobInfo = {};
  const attr = (name: string): string | undefined => {
    const m = text.match(new RegExp(`^\\s+${name.replace(/-/g, '\\-')} \\([a-z-]+\\) = (.+)$`, 'm'));
    return m ? m[1].trim() : undefined;
  };

  const state = attr('job-state');
  if (state !== undefined) {
    const asNumber = Number(state);
    if (Number.isInteger(asNumber)) info.stateCode = asNumber;
    else if (STATE_TEXT[state.toLowerCase()] !== undefined) info.stateCode = STATE_TEXT[state.toLowerCase()];
  }

  const impressions = attr('job-impressions');
  if (impressions !== undefined && /^\d+$/.test(impressions)) info.impressions = Number(impressions);

  const completed = attr('job-impressions-completed');
  if (completed !== undefined && /^\d+$/.test(completed)) info.impressionsCompleted = Number(completed);

  return info;
}

export function parseNumericJobId(fullJobId: string): number | undefined {
  const m = fullJobId.match(/-(\d+)$/);
  if (!m) return undefined;
  return Number(m[1]);
}

export const IPPTOOL_GET_JOB_SCRIPT = `{
  OPERATION Get-Job-Attributes
  GROUP operation-attributes-tag
  ATTR charset attributes-charset utf-8
  ATTR language attributes-natural-language en
  ATTR uri printer-uri $uri
  ATTR integer job-id $jobid
  ATTR keyword requested-attributes job-state,job-impressions,job-impressions-completed
}
`;

export function buildIpptoolArgs(queueName: string, jobId: number, scriptPath: string): string[] {
  const uri = `ipp://localhost:631/printers/${encodeURIComponent(queueName)}`;
  return ['-t', '-v', '-d', `jobid=${jobId}`, uri, scriptPath];
}
