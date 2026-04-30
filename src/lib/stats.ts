import { jStat } from 'jstat';

// --- Core Descriptive Statistics ---
export function getMean(data: number[]): number {
  if (!data.length) return 0;
  return data.reduce((a, b) => a + b, 0) / data.length;
}

export function getStdDev(data: number[], isPopulation = false): number {
  if (data.length < 2) return 0;
  const mean = getMean(data);
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (data.length - (isPopulation ? 0 : 1));
  return Math.sqrt(variance);
}

export function getPercentile(data: number[], p: number): number {
  if (!data.length) return 0;
  const sorted = [...data].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const fraction = index - lower;
  if (lower + 1 >= sorted.length) return sorted[lower];
  return sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

// --- Process Capability Engine ---
export function analyzeCapability(params: any) {
  const { data, usl, lsl, target, isLslBoundary, isUslBoundary, subgroupType, subgroupSize, subgroupIds } = params;
  
  const n = data.length;
  const mean = getMean(data);
  const stdevOverall = getStdDev(data, false); // Long-term SD

  // 1. Normality Check (Anderson-Darling Approximation)
  // For production, jStat doesn't have native AD, so we use a standard approximation or Shapiro-Wilk. 
  // We'll use a robust empirical CDF check here.
  const adTestResult = calculateAndersonDarling(data);
  const isNormal = adTestResult.pValue > 0.05;

  // 2. Stability Check (I-MR Rule 1 violation check)
  const isStable = checkStability(data);

  // 3. Calculate "Within" (Short-term) Standard Deviation
  let stdevWithin = stdevOverall; 
  if (subgroupType === 'fixed' && subgroupSize === 1) {
    // Moving Range Method (n=2, d2 = 1.128)
    let mrSum = 0;
    for (let i = 1; i < n; i++) {
      mrSum += Math.abs(data[i] - data[i - 1]);
    }
    const mrBar = mrSum / (n - 1);
    stdevWithin = mrBar / 1.128; 
  } else if (subgroupType === 'fixed' && subgroupSize > 1) {
    // R-Bar Method
    stdevWithin = calculateRBarStdDev(data, subgroupSize);
  }

  // 4. Calculate Indices
  let Cp = null, Cpk = null, Pp = null, Ppk = null;

  if (isNormal) {
    // Standard Normal Method
    if (usl !== null && lsl !== null) {
      Cp = (usl - lsl) / (6 * stdevWithin);
      Pp = (usl - lsl) / (6 * stdevOverall);
    }
    
    const cpu = usl !== null ? (usl - mean) / (3 * stdevWithin) : Infinity;
    const cpl = lsl !== null ? (mean - lsl) / (3 * stdevWithin) : Infinity;
    Cpk = Math.min(cpu, cpl) === Infinity ? null : Math.min(cpu, cpl);

    const ppu = usl !== null ? (usl - mean) / (3 * stdevOverall) : Infinity;
    const ppl = lsl !== null ? (mean - lsl) / (3 * stdevOverall) : Infinity;
    Ppk = Math.min(ppu, ppl) === Infinity ? null : Math.min(ppu, ppl);
  } else {
    // ISO 22514-2 Percentile Method (Non-Normal)
    const p99865 = getPercentile(data, 0.99865);
    const p00135 = getPercentile(data, 0.00135);
    const p50 = getPercentile(data, 0.50);

    if (usl !== null && lsl !== null) {
      Pp = (usl - lsl) / (p99865 - p00135);
    }
    
    const ppu = usl !== null ? (usl - p50) / (p99865 - p50) : Infinity;
    const ppl = lsl !== null ? (p50 - lsl) / (p50 - p00135) : Infinity;
    Ppk = Math.min(ppu, ppl) === Infinity ? null : Math.min(ppu, ppl);
    
    // Within indices are usually omitted for non-normal, but we mirror overall for UI consistency
    Cp = Pp; 
    Cpk = Ppk;
  }

  // 5. PPM Calculations
  // Actual Observed
  const observedPpmLsl = lsl !== null ? (data.filter((x: number) => x < lsl).length / n) * 1000000 : 0;
  const observedPpmUsl = usl !== null ? (data.filter((x: number) => x > usl).length / n) * 1000000 : 0;
  
  // Expected (Model) - Using jStat Normal CDF
  let expectedPpmLsl = 0;
  let expectedPpmUsl = 0;
  let overallPpmLsl = 0;
  let overallPpmUsl = 0;

  if (isNormal) {
    if (lsl !== null && !isLslBoundary) {
      expectedPpmLsl = jStat.normal.cdf(lsl, mean, stdevWithin) * 1000000;
      overallPpmLsl = jStat.normal.cdf(lsl, mean, stdevOverall) * 1000000;
    }
    if (usl !== null && !isUslBoundary) {
      expectedPpmUsl = (1 - jStat.normal.cdf(usl, mean, stdevWithin)) * 1000000;
      overallPpmUsl = (1 - jStat.normal.cdf(usl, mean, stdevOverall)) * 1000000;
    }
  } else {
    // For non-normal, we rely primarily on observed or complex empirical models. 
    // Defaulting to observed for expected in non-normal state to prevent bad normal math.
    expectedPpmLsl = observedPpmLsl;
    expectedPpmUsl = observedPpmUsl;
    overallPpmLsl = observedPpmLsl;
    overallPpmUsl = observedPpmUsl;
  }

  return {
    mean,
    stdevOverall,
    stdevWithin,
    isNormal,
    normalityPValue: adTestResult.pValue,
    isStable,
    Cp, Cpk, Pp, Ppk,
    observedPpmLsl, observedPpmUsl, observedPpmTotal: observedPpmLsl + observedPpmUsl,
    expectedPpmLsl, expectedPpmUsl, expectedPpmTotal: expectedPpmLsl + expectedPpmUsl,
    overallPpmLsl, overallPpmUsl, overallPpmTotal: overallPpmLsl + overallPpmUsl
  };
}

// --- Dynamic Visual Generators ---

export function generateDynamicHistogram(data: number[]) {
  const n = data.length;
  if (n === 0) return [];

  // Sturges' Formula for dynamic bin count
  const numBins = Math.max(5, Math.ceil(Math.log2(n) + 1));
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  
  if (min === max) return [{ x: min, count: n }];

  const binWidth = (max - min) / numBins;
  const bins = Array.from({ length: numBins }, (_, i) => ({
    x: min + (i + 0.5) * binWidth, // Midpoint
    min: min + i * binWidth,
    max: min + (i + 1) * binWidth,
    count: 0
  }));

  data.forEach(val => {
    for (let i = 0; i < numBins; i++) {
      if (val >= bins[i].min && (val < bins[i].max || (i === numBins - 1 && val <= bins[i].max))) {
        bins[i].count++;
        break;
      }
    }
  });

  return bins;
}

export function generateNormalCurve(mean: number, stdev: number, histData: any[]) {
  if (!histData.length || stdev === 0) return [];
  
  const minX = histData[0].min;
  const maxX = histData[histData.length - 1].max;
  const binWidth = histData[0].max - histData[0].min;
  const n = histData.reduce((sum, bin) => sum + bin.count, 0);
  
  // Calculate area to scale the PDF properly to the frequency histogram
  const area = n * binWidth; 

  const curveData = [];
  const points = 50; // High resolution for a smooth curve
  const step = (maxX - minX) / points;

  for (let i = 0; i <= points; i++) {
    const x = minX + i * step;
    const pdf = jStat.normal.pdf(x, mean, stdev);
    curveData.push({ x, y: pdf * area });
  }

  return curveData;
}

// --- Internal Helper Functions ---

function calculateAndersonDarling(data: number[]) {
  // Simplified approximation for React UI speed. 
  // In a full node environment, a heavy AD library is preferred.
  // We use jStat's z-scores to approximate fitness.
  const n = data.length;
  if (n < 7) return { pValue: 0.01 }; // Too small to prove normality
  
  const mean = getMean(data);
  const stdev = getStdDev(data);
  const sorted = [...data].sort((a, b) => a - b);
  
  let S = 0;
  for (let i = 0; i < n; i++) {
    const cdfVal = jStat.normal.cdf(sorted[i], mean, stdev);
    // Clamp to prevent log(0)
    const f = Math.max(Math.min(cdfVal, 0.9999999), 0.0000001);
    const revF = Math.max(Math.min(jStat.normal.cdf(sorted[n - 1 - i], mean, stdev), 0.9999999), 0.0000001);
    S += ((2 * (i + 1) - 1) / n) * (Math.log(f) + Math.log(1 - revF));
  }
  
  const A2 = -n - S;
  const A2_adjusted = A2 * (1 + 0.75 / n + 2.25 / Math.pow(n, 2));
  
  let pValue = 0;
  if (A2_adjusted >= 0.6) pValue = Math.exp(1.2937 - 5.709 * A2_adjusted + 0.0186 * Math.pow(A2_adjusted, 2));
  else if (A2_adjusted >= 0.34) pValue = Math.exp(0.9177 - 4.279 * A2_adjusted - 1.38 * Math.pow(A2_adjusted, 2));
  else if (A2_adjusted > 0.2) pValue = 1 - Math.exp(-8.318 + 42.796 * A2_adjusted - 59.938 * Math.pow(A2_adjusted, 2));
  else pValue = 1 - Math.exp(-13.436 + 101.14 * A2_adjusted - 223.73 * Math.pow(A2_adjusted, 2));

  return { statistic: A2_adjusted, pValue };
}

function checkStability(data: number[]): boolean {
  // Basic I-MR Rule 1 check: Are there points outside 3-sigma of moving range?
  const n = data.length;
  if (n < 2) return true;
  
  const mean = getMean(data);
  let mrSum = 0;
  for (let i = 1; i < n; i++) {
    mrSum += Math.abs(data[i] - data[i - 1]);
  }
  const mrBar = mrSum / (n - 1);
  const stdevWithin = mrBar / 1.128;
  
  const ucl = mean + 3 * stdevWithin;
  const lcl = mean - 3 * stdevWithin;
  
  return !data.some(val => val > ucl || val < lcl);
}

function calculateRBarStdDev(data: number[], subgroupSize: number): number {
  // Rough approximation for d2 based on standard Six Sigma constants up to n=10
  const d2_table: { [key: number]: number } = { 2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534, 7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078 };
  const d2 = d2_table[subgroupSize] || 3.0; // Fallback

  let rangeSum = 0;
  let validGroups = 0;
  
  for (let i = 0; i < data.length; i += subgroupSize) {
    const group = data.slice(i, i + subgroupSize);
    if (group.length === subgroupSize) {
      rangeSum += (Math.max(...group) - Math.min(...group));
      validGroups++;
    }
  }
  
  if (validGroups === 0) return getStdDev(data);
  return (rangeSum / validGroups) / d2;
}