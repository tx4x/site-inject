import { launch, Page } from 'puppeteer'
import { readFileSync } from 'fs';
import * as moment from 'moment';
import { sync as unlink } from '@xblox/fs/remove';
import { async as iterator } from '@xblox/fs/iterator';
import {
    debug, inspect,
    Options, TraceEntry, TraceTiming,
    default_trace_path,
    ReportEntry,
    NetworkReportEntry,
    sizeToString,
    log,
    spinner,
    STATS_SUFFIX,
    TRACE_SUFFIX
} from '../../';
import { end_time } from './times';
import { find_time } from './trace';
import { rl } from './stdin';
import { report, find_report, get_report } from './report';
import { IProcessingNode } from '@xblox/fs/interfaces';

const included_categories = ['devtools.timeline'];

export class Puppeteer {

    static clean(url: string, options: Options) {
        iterator(options.cwd, {
            matching: [`*${STATS_SUFFIX}`, `*${TRACE_SUFFIX}`]
        }).then((it) => {
            let node: IProcessingNode = null;
            while (node = it.next()) {
                unlink(node.path);
            }
        })
    }

    static async begin(url: string, options: Options) {

        const browser = await launch({
            headless: options.headless,
            devtools: false
        });
        return await browser.newPage();
    }
    static async crawler(url: string, options?: Options) {
        
        const page = await this.begin(url, options);
        
    }
    static async repl(url: string, options?: Options) {
        
        const page = await this.begin(url, options);
        page.on('console', msg => inspect('Console Message:', msg.text()));

        await page.goto(url, {
            timeout: 600000,
            waitUntil: 'networkidle0'
        });

        const readline = rl(`${url}#`, (line: string) => {
            page.evaluate(line).then((results) => {
                inspect(`Did evaluate ${line} to `, results);
            })
        }, () => this.end(page));
    }


    static async end(page: Page) {

        const browser = await page.browser();
        await page.close();
        await browser.close();
    }

    static async summary(url: string, options?: Options) {

        const browser = await launch({
            headless: options.headless,
            devtools: true
        });
        const page = await browser.newPage();
        await page.goto(url, {
            timeout: 600000,
            waitUntil: 'networkidle0'
        });
        const metrics = await page.metrics();
        await this.end(page);
        return metrics;
    }

    static async detail(url: string, options?: Options) {

        const network_stats = report();
        const ReceivedTotal = get_report(network_stats, 'Received Total');
        const ReceivedStyleSheets = get_report(network_stats, 'Received Stylesheets');
        const ReceivedScripts = get_report(network_stats, 'Received Scripts');
        const ReceivedHTML = get_report(network_stats, 'Received HTML');
        const ReceivedImages = get_report(network_stats, 'Received Images');
        const ReceivedJSON = get_report(network_stats, 'Received JSON');
        const ReceivedFonts = get_report(network_stats, 'Received Fonts');
        const ReceivedBinary = get_report(network_stats, 'Received Binary');
        const MimeMap = {
            'application/javascript': ReceivedScripts,
            'text/javascript': ReceivedScripts,
            'text/css': ReceivedStyleSheets,
            'text/html': ReceivedHTML,
            'image/png': ReceivedImages,
            'image/gif': ReceivedImages,
            'image/svg+xml': ReceivedImages,
            'application/json': ReceivedJSON,
            'application/octet-stream': ReceivedBinary,
            'font/woff2': ReceivedFonts,
            'application/font-woff2': ReceivedFonts
        }

        const traceFile = default_trace_path(options.cwd, url);

        const page = await this.begin(url, options);
        await page.tracing.start({
            path: traceFile,
            categories: included_categories
        });
        await page.goto(url, {
            timeout: 600000,
            waitUntil: 'networkidle0'
        });
        const metrics = await (page as any)._client.send('Performance.getMetrics');
        const nowTs = new Date().getTime();
        // const navigationStart = getTimeFromMetrics(metrics, 'NavigationStart');
        const navigationStart = find_time(metrics, 'Timestamp') + nowTs;
        await page.tracing.stop();

        // --- extracting data from trace.json ---
        const tracing = JSON.parse(readFileSync(traceFile, 'utf8'));

        const dataReceivedEvents = tracing.traceEvents.filter(x => x.name === 'ResourceReceivedData');
        const dataResponseEvents = tracing.traceEvents.filter(x => x.name === 'ResourceReceiveResponse');

        // find resource in responses or return default empty
        const content_response = (requestId: string): TraceEntry => dataResponseEvents.find((x) =>
            x.args.data.requestId === requestId)
            || { args: { data: { encodedDataLength: 0 } } };

        const report_per_mime = (mime: string): NetworkReportEntry => MimeMap[mime] || get_report(network_stats, mime);

        // our iteration over the trace
        // @TODO: convert to a better tree structure to avoid O(n) lookups
        // @TODO: emit to extensions: events & aspects
        // @TODO: calculate times
        // @TODO: filter
        // @TODO: options.mask
        // @TODO: this iterator might get async
        ReceivedTotal.value = dataReceivedEvents.reduce((first, x) => {
            const content = content_response(x.args.data.requestId);
            const data = content.args.data;
            const report = report_per_mime(data.mimeType);
            if (data.fromCache === false) {
                report.value += x.args.data.encodedDataLength
                report.count++;
            } else {
                report.cached_count++;
            }
            ReceivedTotal.count++;
            return first + x.args.data.encodedDataLength;
        }, ReceivedTotal.value);

        // calulate finals
        [ReceivedTotal, ReceivedHTML, ReceivedImages, ReceivedJSON,
            ReceivedScripts, ReceivedFonts, ReceivedBinary
        ].forEach((r) => r.formatted = sizeToString(r.value))

        // --- end extracting data from trace.json ---

        let results = [];

        // lights off
        await this.end(page);

        return {
            times: [],
            network: network_stats
        }
    }
}
