"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = require("puppeteer");
const fs_1 = require("fs");
const _1 = require("../../");
const trace_1 = require("./trace");
const report_1 = require("./report");
const included_categories = ['devtools.timeline'];
class Puppeteer {
    static begin(url, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const browser = yield puppeteer_1.launch({
                headless: options.headless,
                devtools: false
            });
            return yield browser.newPage();
        });
    }
    static summary(url, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const browser = yield puppeteer_1.launch({
                headless: options.headless,
                devtools: true
            });
            const page = yield browser.newPage();
            const metrics = yield page.metrics();
            yield page.close();
            yield browser.close();
            return metrics;
        });
    }
    static detail(url, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const page = yield this.begin(url, options);
            const network_stats = report_1.report();
            const ReceivedTotal = report_1.get_report(network_stats, 'Received Total');
            const ReceivedStyleSheets = report_1.get_report(network_stats, 'Received Stylesheets');
            const ReceivedScripts = report_1.get_report(network_stats, 'Received Scripts');
            const ReceivedHTML = report_1.get_report(network_stats, 'Received HTML');
            const ReceivedImages = report_1.get_report(network_stats, 'Received Images');
            const ReceivedJSON = report_1.get_report(network_stats, 'Received JSON');
            const ReceivedFonts = report_1.get_report(network_stats, 'Received Fonts');
            const ReceivedBinary = report_1.get_report(network_stats, 'Received Binary');
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
            };
            const traceFile = _1.default_trace_path(options.cwd, url);
            yield page.tracing.start({
                path: traceFile,
                categories: included_categories
            });
            yield page.goto(url, {
                timeout: 600000,
                waitUntil: 'networkidle0'
            });
            const metrics = yield page._client.send('Performance.getMetrics');
            const nowTs = new Date().getTime();
            // const navigationStart = getTimeFromMetrics(metrics, 'NavigationStart');
            const navigationStart = trace_1.getTimeFromMetrics(metrics, 'Timestamp') + nowTs;
            yield page.tracing.stop();
            // --- extracting data from trace.json ---
            const tracing = JSON.parse(fs_1.readFileSync(traceFile, 'utf8').trim());
            const dataReceivedEvents = tracing.traceEvents.filter(x => x.name === 'ResourceReceivedData');
            const dataResponseEvents = tracing.traceEvents.filter(x => x.name === 'ResourceReceiveResponse');
            // find resource in responses or return default empty
            const content_response = (requestId) => dataResponseEvents.find((x) => x.args.data.requestId === requestId)
                || { args: { data: { encodedDataLength: 0 } } };
            const report_per_mime = (mime) => MimeMap[mime] || report_1.get_report(network_stats, mime);
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
                    report.value += x.args.data.encodedDataLength;
                    report.count++;
                }
                else {
                    report.cached_count++;
                }
                ReceivedTotal.count++;
                return first + x.args.data.encodedDataLength;
            }, ReceivedTotal.value);
            [ReceivedTotal, ReceivedHTML, ReceivedImages, ReceivedJSON,
                ReceivedScripts, ReceivedFonts, ReceivedBinary
            ].forEach((r) => r.formatted = _1.sizeToString(r.value));
            // --- end extracting data from trace.json ---
            yield page.close();
            let results = [];
            const browser = yield page.browser();
            browser.close();
            return {
                times: results,
                network: network_stats
            };
        });
    }
}
exports.Puppeteer = Puppeteer;
//# sourceMappingURL=index.js.map