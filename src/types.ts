/////////////////////////////////////////////////////
//
//  Application types
//
export enum OutputTarget {
    STDOUT = 'console',
    FILE = 'file'
}

export enum OutputFormat {
    text = 'text',
    json = 'json'
}

export interface Options {
    // @TODO: support many
    url?: string;
    format?: OutputFormat;
    // @TODO: support many
    target?: OutputTarget;
    headless?: boolean;
    // output path
    path?: string;
    // @TODO: required to pick profile/config files
    cwd?: string;
    // @TODO: time of sesssion, mapped to Puppeteer waitUntil, if it's a number, the session will be opened for that 
    // time window, time=-1 means infinty, useful for repl. sessions
    time?: number;
    // @TODO: reload interval
    reload?: number;
    // @TODO: repl. --repl=true=interactive or repl=path to specify script
    repl?: string;
}

export type OutputResult = boolean;

export interface ReportEntry {
    name: string;
}

export type NetworkReportEntry = ReportEntry & {
    value: number;
    formatted: string;
    count: number;
    cached_count: number;
    external_count: number;
    local_count: number;
    times: {
        end: number,
        formatted: string;
    }
}

/////////////////////////////////////////////////////
//
//  Foreign data types (trace data)
//

// type for a network resource's timing
export interface ResourceTiming {
    requestTime: number;
    proxyStart: number;
    proxyEnd: number;
    dnsStart: number;
    dnsEnd: number;
    connectStart: number;
    connectEnd: number;
    sslStart: number;
    sslEnd: number;
    workerStart: number;
    workerReady: number;
    sendStart: number;
    sendEnd: number;
    receiveHeadersEnd: number;
    pushStart: number;
    pushEnd: number;
}

export interface Data {
    requestId: string;
    frame: string;
    statusCode: number;
    mimeType: string;
    encodedDataLength: number;
    fromCache: boolean;
    fromServiceWorker: boolean;
    timing: ResourceTiming;
}
export interface Args {
    data: Data;
}

export interface ResourceEntry {
    pid: number;
    tid: number;
    ts: number;
    ph: string;
    cat: string;
    name: string;
    args: Args;
    tts: number;
    s: string;
}
