/**
 * @file analysis.ts
 * @description
 * This module provides utilities for analyzing repository metrics, generating comparison reports,
 * detecting trends, and calculating health scores. It is designed to work with OpenDigger's
 * repository and user metrics, offering insights into performance, growth, and overall health.
 *
 * Key Features:
 * - Comparison analysis across multiple repositories and metrics
 * - Trend detection and statistical analysis of time-series data
 * - Health score calculation based on weighted metrics
 * - Error handling and suggestion generation
 */


/**
 * Represents the result of a comparison between repositories for a set of metrics.
 */
export interface ComparisonResult {
  repository: string;
  platform: string;
  metrics: Array<{
    metric: string;
    data?: any;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Represents the analysis result of comparing multiple repositories across various metrics.
 */
export interface ComparisonAnalysis {
  summary: Record<string, {
    highest: number;
    average: number;
    range: [number, number];
    winner: string;
  }>;
  winners: Record<string, string>;
  insights: string[];
  rankings: Record<string, Array<{repo: string; value: number; rank: number}>>;
  healthScores: Record<string, number>;
}

/**
 * Represents the analysis of a time-series trend for a specific metric.
 */
export interface TrendAnalysis {
  dataPoints: number;
  timeRange: {
    start?: string;
    end?: string;
  };
  values: {
    first: number;
    last: number;
    peak: number;
    lowest: number;
    average: number;
    median: number;
  };
  trend: {
    direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    totalGrowth: number;
    growthRate: string;
    momentum: 'accelerating' | 'decelerating' | 'stable' | 'insufficient_data';
    volatility: 'low' | 'medium' | 'high';
  };
  patterns: {
    hasSeasonality: boolean;
    growthPhases: Array<{
      phase: string;
      startDate: string;
      endDate: string;
      growth: number;
    }>;
  };
}

/**
 * Extracts the latest value from a metric data object.
 * Supports both flat and time-series data structures.
 *
 * @param data - The metric data object, which can be a number, a flat object, or a time-series object.
 * @returns The latest numeric value found, or 0 if none is found.
 */
export function extractLatestValue(data: any): number {
  if (typeof data === 'number') return data;

  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data)
      .filter(key => key.match(/^\d{4}-\d{2}(-\d{2})?$/)) // Match YYYY-MM or YYYY-MM-DD
      .sort();

    if (keys.length === 0) {
      const numericValues = Object.values(data).filter(val => typeof val === 'number');
      return numericValues.length > 0 ? Math.max(...numericValues) : 0;
    }

    const latestKey = keys[keys.length - 1] as string;
    const value = (data as Record<string, unknown>)[latestKey];
    return typeof value === 'number' ? value : 0;
  }

  return 0;
}

/**
 * Generates a comparison analysis across multiple repositories and metrics.
 *
 * @param results - Array of comparison results for each repository.
 * @param metrics - Array of metric names to analyze.
 * @returns A comprehensive analysis object with summaries, rankings, and insights.
 */
export function generateComparisonAnalysis(results: ComparisonResult[], metrics: string[]): ComparisonAnalysis {
  const analysis: ComparisonAnalysis = {
    summary: {},
    winners: {},
    insights: [],
    rankings: {},
    healthScores: {}
  };

  // Analyze each metric across repositories
  metrics.forEach(metric => {
    const metricData = results.map(repo => {
      const metricResult = repo.metrics.find(m => m.metric === metric && m.success);
      const value = metricResult ? extractLatestValue(metricResult.data) : null;
      return {
        repo: repo.repository,
        platform: repo.platform,
        value: value
      };
    }).filter((item): item is { repo: string; platform: string; value: number } => item.value !== null && item.value > 0);

    if (metricData.length > 0) {
      const values = metricData.map(item => item.value);
      const sortedData = metricData.sort((a, b) => b.value - a.value);

      const winner = sortedData[0]!;
      const highest = Math.max(...values);
      const lowest = Math.min(...values);
      const average = values.reduce((sum, val) => sum + val, 0) / values.length;

      analysis.winners[metric] = winner.repo;
      analysis.summary[metric] = {
        highest,
        average,
        range: [lowest, highest],
        winner: winner.repo
      };

      // Create rankings for this metric
      analysis.rankings[metric] = sortedData.map((item, index) => ({
        repo: item.repo,
        value: item.value,
        rank: index + 1
      }));
    }
  });

  // Calculate health scores for each repository
  results.forEach(repo => {
    const scores: number[] = [];
    metrics.forEach(metric => {
      const metricResult = repo.metrics.find(m => m.metric === metric && m.success);
      if (metricResult && analysis.summary[metric]) {
        const value = extractLatestValue(metricResult.data);
        const maxValue = analysis.summary[metric].highest;
        const normalizedScore = maxValue > 0 ? (value / maxValue) * 100 : 0;
        scores.push(normalizedScore);
      }
    });

    analysis.healthScores[repo.repository] = scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;
  });

  // Generate insights
  const topPerformer = Object.entries(analysis.healthScores)
    .sort(([,a], [,b]) => b - a)[0];

  const mostCompetitive = Object.entries(analysis.summary)
    .sort(([,a], [,b]) => (b.highest - b.range[0]) - (a.highest - a.range[0]))[0];

  analysis.insights.push(
    `Repository comparison across ${metrics.length} metrics for ${results.length} repositories`,
    `Top performer overall: ${topPerformer ? topPerformer[0] : 'N/A'} (${topPerformer ? topPerformer[1].toFixed(1) : 0}% health score)`,
    `Most competitive metric: ${mostCompetitive ? mostCompetitive[0] : 'N/A'}`,
    `Analysis completed at ${new Date().toISOString()}`
  );

  // Add metric-specific insights
  Object.entries(analysis.winners).forEach(([metric, winner]) => {
    const summary = analysis.summary[metric];
    if (summary && summary.highest > 0) {
      const margin = summary.highest - summary.average;
      const dominanceLevel = margin > summary.average * 0.5 ? 'dominates' : 'leads';
      analysis.insights.push(`${winner} ${dominanceLevel} in ${metric} with ${summary.highest.toLocaleString()}`);
    }
  });

  return analysis;
}

/**
 * Processes time-series data to generate a trend analysis.
 *
 * @param data - The time-series data object.
 * @param timeRange - Optional time range string (not currently used).
 * @returns A trend analysis object with statistics, trend direction, and patterns.
 */
export function processTrendData(data: any, timeRange: string): TrendAnalysis {
  if (!data || typeof data !== 'object') {
    return createEmptyTrendAnalysis();
  }

  // Extract time-based data points
  const timeSeriesKeys = Object.keys(data)
    .filter(key => key.match(/^\d{4}-\d{2}(-\d{2})?$/)) // Match YYYY-MM or YYYY-MM-DD
    .sort();

  if (timeSeriesKeys.length === 0) {
    return createEmptyTrendAnalysis();
  }

  const values = timeSeriesKeys.map(key => ({
    date: key,
    value: typeof data[key] === 'number' ? data[key] : 0
  })).filter(item => item.value >= 0); // Filter out negative values

  if (values.length === 0) {
    return createEmptyTrendAnalysis();
  }

  // Calculate basic statistics
  const numericValues = values.map(v => v.value);
  const firstValue = values[0]?.value || 0;
  const lastValue = values[values.length - 1]?.value || 0;
  const peakValue = Math.max(...numericValues);
  const lowestValue = Math.min(...numericValues);
  const averageValue = numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
  const sortedValues = [...numericValues].sort((a, b) => a - b);
  const medianValue = sortedValues.length % 2 === 0 && sortedValues.length >= 2
    ? ((sortedValues[sortedValues.length / 2 - 1] as number) + (sortedValues[sortedValues.length / 2] as number)) / 2
    : sortedValues[Math.floor(sortedValues.length / 2)] as number;

  // Calculate trend metrics
  const totalGrowth = lastValue - firstValue;
  const growthRate = firstValue > 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;

  // Determine trend direction
  let direction: 'increasing' | 'decreasing' | 'stable' | 'volatile' = 'stable';
  if (Math.abs(growthRate) < 5) {
    direction = 'stable';
  } else if (growthRate > 0) {
    direction = 'increasing';
  } else {
    direction = 'decreasing';
  }

  // Calculate volatility
  const variance = numericValues.reduce((sum, val) => sum + Math.pow(val - averageValue, 2), 0) / numericValues.length;
  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation = averageValue > 0 ? standardDeviation / averageValue : 0;

  let volatility: 'low' | 'medium' | 'high' = 'low';
  if (coefficientOfVariation > 0.3) volatility = 'high';
  else if (coefficientOfVariation > 0.15) volatility = 'medium';
  if (volatility === 'high') direction = 'volatile';

  // Calculate momentum
  const momentum = calculateMomentum(values);

  // Detect growth phases
  const growthPhases = detectGrowthPhases(values);

  // Simple seasonality detection
  const hasSeasonality = detectSeasonality(values);

  const timeRangeObj: { start?: string; end?: string } = {};
  const firstValueEntry = values[0];
  if (firstValueEntry) timeRangeObj.start = firstValueEntry.date;
  const lastValueEntry = values[values.length - 1];
  if (lastValueEntry) timeRangeObj.end = lastValueEntry.date;

  return {
    dataPoints: values.length,
    timeRange: timeRangeObj,
    values: {
      first: firstValue,
      last: lastValue,
      peak: peakValue,
      lowest: lowestValue,
      average: averageValue,
      median: medianValue
    },
    trend: {
      direction,
      totalGrowth,
      growthRate: `${growthRate.toFixed(2)}%`,
      momentum,
      volatility
    },
    patterns: {
      hasSeasonality,
      growthPhases
    }
  };
}

/**
 * Creates an empty trend analysis object with default values.
 *
 * @returns An empty TrendAnalysis object.
 */
function createEmptyTrendAnalysis(): TrendAnalysis {
  return {
    dataPoints: 0,
    timeRange: {},
    values: { first: 0, last: 0, peak: 0, lowest: 0, average: 0, median: 0 },
    trend: {
      direction: 'stable',
      totalGrowth: 0,
      growthRate: '0%',
      momentum: 'insufficient_data',
      volatility: 'low'
    },
    patterns: { hasSeasonality: false, growthPhases: [] }
  };
}

/**
 * Calculates the momentum of a time-series dataset.
 *
 * @param values - Array of time-series data points.
 * @returns The momentum classification: 'accelerating', 'decelerating', 'stable', or 'insufficient_data'.
 */
export function calculateMomentum(values: Array<{date: string; value: number}>): 'accelerating' | 'decelerating' | 'stable' | 'insufficient_data' {
  if (values.length < 6) return 'insufficient_data';

  const midpoint = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, midpoint);
  const secondHalf = values.slice(midpoint);

  const firstHalfGrowth = firstHalf.length > 1
    ? ((firstHalf[firstHalf.length - 1]!.value - firstHalf[0]!.value) / firstHalf.length)
    : 0;

  const secondHalfGrowth = secondHalf.length > 1
    ? ((secondHalf[secondHalf.length - 1]!.value - secondHalf[0]!.value) / secondHalf.length)
    : 0;

  const momentumDifference = secondHalfGrowth - firstHalfGrowth;
  const threshold = Math.max(0.1, (firstHalf[0]?.value ?? 0) * 0.01); // Dynamic threshold based on scale

  if (Math.abs(momentumDifference) < threshold) return 'stable';
  return momentumDifference > 0 ? 'accelerating' : 'decelerating';
}

/**
 * Detects growth phases in a time-series dataset.
 *
 * @param values - Array of time-series data points.
 * @returns Array of growth phase objects, each with start/end dates and growth value.
 */
function detectGrowthPhases(values: Array<{date: string; value: number}>): Array<{phase: string; startDate: string; endDate: string; growth: number}> {
  if (values.length < 3) return [];

  const phases = [];
  let currentPhaseStart = 0;
  let currentPhaseType = 'stable';

  for (let i = 1; i < values.length; i++) {
    const prevValue = values[i - 1]!.value;
    const currentValue = values[i]!.value;
    const growth = currentValue - prevValue;
    const growthRate = prevValue > 0 ? growth / prevValue : 0;

    let phaseType = 'stable';
    if (growthRate > 0.05) phaseType = 'growth';
    else if (growthRate < -0.05) phaseType = 'decline';

    if (phaseType !== currentPhaseType && i - currentPhaseStart >= 2) {
      const phaseGrowth = values[i - 1]!.value - values[currentPhaseStart]!.value;
      phases.push({
        phase: currentPhaseType,
        startDate: values[currentPhaseStart]!.date,
        endDate: values[i - 1]!.date,
        growth: phaseGrowth
      });
      currentPhaseStart = i - 1;
      currentPhaseType = phaseType;
    }
  }

  if (values.length - currentPhaseStart >= 2) {
    const phaseGrowth = values[values.length - 1]!.value - values[currentPhaseStart]!.value;
    phases.push({
      phase: currentPhaseType,
      startDate: values[currentPhaseStart]!.date,
      endDate: values[values.length - 1]!.date,
      growth: phaseGrowth
    });
  }

  return phases;
}

/**
 * Detects seasonality in a time-series dataset.
 *
 * @param values - Array of time-series data points.
 * @returns True if seasonality is detected, false otherwise.
 */
function detectSeasonality(values: Array<{date: string; value: number}>): boolean {
  if (values.length < 12) return false; // Need at least a year of data

  const monthlyAverages: Record<string, number[]> = {};

  values.forEach(item => {
    const month = item.date.substring(5, 7); // Extract MM from YYYY-MM
    if (!monthlyAverages[month]) monthlyAverages[month] = [];
    monthlyAverages[month].push(item.value);
  });

  const monthlyMeans = Object.entries(monthlyAverages)
    .map(([month, vals]) => ({
      month,
      mean: vals.reduce((sum, val) => sum + val, 0) / vals.length
    }));

  if (monthlyMeans.length < 6) return false; // Data from multiple months

  const overallMean = monthlyMeans.reduce((sum, m) => sum + m.mean, 0) / monthlyMeans.length;
  const variance = monthlyMeans.reduce((sum, m) => sum + Math.pow(m.mean - overallMean, 2), 0) / monthlyMeans.length;
  const coefficientOfVariation = overallMean > 0 ? Math.sqrt(variance) / overallMean : 0;

  // If monthly variations are significant, there might be seasonality
  return coefficientOfVariation > 0.2;
}

/**
 * Generates suggestions for handling specific error messages.
 * NOTE: The suggestions have been generated with AI, so I'd request @frank-zsy / @birdflyi to help enhance this further.
 *
 * @param errorMessage - The error message to analyze.
 * @returns Array of suggestions for resolving the error.
 */
export function generateErrorSuggestions(errorMessage: string): string[] {
  const suggestions = [];
  const message = errorMessage.toLowerCase();

  if (message.includes('validation') || message.includes('invalid input')) {
    suggestions.push('Check that all required parameters are provided');
    suggestions.push('Verify parameter types match the expected schema');
    suggestions.push('Ensure enum values are exactly as specified (case-sensitive)');
    suggestions.push('Review the tool documentation for parameter requirements');
  }

  if (message.includes('404') || message.includes('not found')) {
    suggestions.push('Verify the repository owner and name are correct');
    suggestions.push('Check if the repository exists on the specified platform');
    suggestions.push('Ensure the metric name is supported for this repository type');
    suggestions.push('Try a different metric or check OpenDigger documentation');
  }

  if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
    suggestions.push('Check your internet connection');
    suggestions.push('Try again in a few moments - the API might be temporarily unavailable');
    suggestions.push('Consider using cached data if available');
    suggestions.push('Verify the OpenDigger API is accessible');
  }

  if (message.includes('rate limit') || message.includes('too many requests')) {
    suggestions.push('Wait before making additional requests');
    suggestions.push('Use batch operations to reduce the number of API calls');
    suggestions.push('Consider implementing exponential backoff');
    suggestions.push('Check if you are making too many concurrent requests');
  }

  if (message.includes('missing required field')) {
    suggestions.push('For repository metrics: provide both owner and repo parameters');
    suggestions.push('For user metrics: provide the login parameter');
    suggestions.push('Check the entityType matches your provided parameters');
    suggestions.push('Ensure all required fields are specified and not empty');
  }

  if (message.includes('parse') || message.includes('json')) {
    suggestions.push('Check the data format returned by the API');
    suggestions.push('Verify the metric data is in the expected format');
    suggestions.push('Try a different metric or repository');
    suggestions.push('Report this issue if it persists across multiple requests');
  }

  if (suggestions.length === 0) {
    suggestions.push('Check the server logs for more detailed error information');
    suggestions.push('Verify all input parameters are correct');
    suggestions.push('Try a simpler request to isolate the issue');
    suggestions.push('Contact support if the problem persists');
  }

  return suggestions;
}

/**
 * Calculates a health score for a repository based on weighted metrics.
 *
 * @param metrics - Object containing metric names and their values.
 * @returns A health score between 0 and 100.
 */
export function calculateHealthScore(metrics: Record<string, any>): number {
  const weights = {
    openrank: 0.25,
    stars: 0.20,
    contributors: 0.20,
    participants: 0.15,
    forks: 0.10,
    commits: 0.10
  };

  let totalScore = 0;
  let totalWeight = 0;

  Object.entries(weights).forEach(([metric, weight]) => {
    if (metrics[metric] !== undefined) {
      const value = extractLatestValue(metrics[metric]);
      // Normalize score based on typical ranges with logarithmic scaling for better distribution
      let normalizedScore = 0;

      switch (metric) {
        case 'openrank':
          normalizedScore = Math.min(Math.log10(Math.max(1, value)) / Math.log10(1000), 1) * 100;
          break;
        case 'stars':
          normalizedScore = Math.min(Math.log10(Math.max(1, value)) / Math.log10(50000), 1) * 100;
          break;
        case 'contributors':
          normalizedScore = Math.min(Math.log10(Math.max(1, value)) / Math.log10(1000), 1) * 100;
          break;
        case 'participants':
          normalizedScore = Math.min(Math.log10(Math.max(1, value)) / Math.log10(5000), 1) * 100;
          break;
        case 'forks':
          normalizedScore = Math.min(Math.log10(Math.max(1, value)) / Math.log10(20000), 1) * 100;
          break;
        case 'commits':
          normalizedScore = Math.min(Math.log10(Math.max(1, value)) / Math.log10(100000), 1) * 100;
          break;
      }

      totalScore += normalizedScore * weight;
      totalWeight += weight;
    }
  });

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
}
