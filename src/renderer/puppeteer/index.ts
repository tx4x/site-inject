import { launch, Page } from 'puppeteer'
import { readFileSync } from 'fs';
import * as moment from 'moment';

import {
    debug, inspect,
    Options, ResourceEntry, ResourceTiming,
    default_trace_path,
    ReportEntry,
    NetworkReportEntry,
    sizeToString
} from '../../';
import { end_time } from './times';
import { getTimeFromMetrics } from './trace';
import { report, find_report, get_report } from './report';

const included_categories = ['devtools.timeline'];

export class Puppeteer {
    static async begin(url: string, options: Options) {
        const browser = await launch({
            headless: options.headless,
            devtools: false
        });

        return await browser.newPage();
    }
    static async summary(url: string, options?: Options) {
        const browser = await launch({
            headless: options.headless,
            devtools: true
        });
        const page = await browser.newPage();
        const metrics = await page.metrics();
        await page.close();
        await browser.close();
        return metrics;
    }

    static async detail(url: string, options?: Options) {

        const page = await this.begin(url, options);

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
        const navigationStart = getTimeFromMetrics(metrics, 'Timestamp') + nowTs;
        await page.tracing.stop();

        // --- extracting data from trace.json ---
        const tracing = JSON.parse(readFileSync(traceFile, 'utf8').trim());

        const dataReceivedEvents = tracing.traceEvents.filter(x => x.name === 'ResourceReceivedData');
        const dataResponseEvents = tracing.traceEvents.filter(x => x.name === 'ResourceReceiveResponse');

        // find resource in responses or return default empty
        const content_response = (requestId: string): ResourceEntry => dataResponseEvents.find((x) =>
            x.args.data.requestId === requestId)
            || { args: { data: { encodedDataLength: 0 } } };

        const report_per_mime = (mime: string) => MimeMap[mime] || get_report(network_stats, mime);

        // our iteration over the trace
        // @TODO: convert to a better tree structure to avoid O(n) lookups
        // @TODO: emit to extensions: events & aspects
        // @TODO: calculate times
        // @TODO: filter
        // @TODO: options.mask
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

        [ReceivedTotal, ReceivedHTML, ReceivedImages, ReceivedJSON,
            ReceivedScripts, ReceivedFonts, ReceivedBinary
        ].forEach((r) => r.formatted = sizeToString(r.value))

        // --- end extracting data from trace.json ---

        await page.close();

        let results = [
        ];
        const browser = await page.browser();
        browser.close();

        return {
            times: results,
            network: network_stats
        }
    }
}
