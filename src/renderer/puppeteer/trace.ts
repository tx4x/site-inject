export const getTimeFromMetrics = (metrics, name) => metrics.metrics.find(x => x.name === name).value;