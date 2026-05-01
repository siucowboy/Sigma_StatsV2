import jStatModule from 'jstat';
const jStat: any = (jStatModule as any).jStat || jStatModule;

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

  const expectedPpmTotal = expectedPpmLsl + expectedPpmUsl;
  const overallPpmTotal = overallPpmLsl + overallPpmUsl;

  return {
    mean,
    stdevOverall,
    stdevWithin,
    isNormal,
    normalityPValue: adTestResult.pValue,
    isStable,
    Cp, Cpk, Pp, Ppk,
    // Z-Bench calculations
    zBenchWithin: expectedPpmTotal > 0 ? -jStat.normal.inv(expectedPpmTotal / 1000000, 0, 1) : (expectedPpmTotal === 0 ? 6 : null),
    zBenchOverall: overallPpmTotal > 0 ? -jStat.normal.inv(overallPpmTotal / 1000000, 0, 1) : (overallPpmTotal === 0 ? 6 : null),
    observedPpmLsl, observedPpmUsl, observedPpmTotal: observedPpmLsl + observedPpmUsl,
    expectedPpmLsl, expectedPpmUsl, expectedPpmTotal,
    overallPpmLsl, overallPpmUsl, overallPpmTotal
  };
}

// --- Regression Engine ---
import * as math from 'mathjs';

export function runMultipleRegression(yData: number[], xDataMatrix: number[][], xNames: string[]) {
  const n = yData.length;
  const k = xDataMatrix.length; // Number of predictors
  
  if (n <= k + 1) return null;

  // Build X matrix with intercept column
  const X = [];
  for (let i = 0; i < n; i++) {
    const row = [1];
    for (let j = 0; j < k; j++) {
      row.push(xDataMatrix[j][i]);
    }
    X.push(row);
  }

  const Y = yData.map(y => [y]);

  // Matrix Math: beta = (X'X)^-1 X'Y
  const Xt = math.transpose(X);
  const XtX = math.multiply(Xt, X);
  
  let XtX_inv;
  try {
    XtX_inv = math.inv(XtX);
  } catch (e) {
    return null; // Singular matrix
  }
  
  const XtY = math.multiply(Xt, Y);
  const beta = math.multiply(XtX_inv, XtY) as any;

  // Predictions & Residuals
  const Y_hat = math.multiply(X, beta) as any;
  const residuals = yData.map((y, i) => y - Y_hat[i][0]);

  // SSE, SSR, SST
  const yMean = getMean(yData);
  const sst = yData.reduce((acc, y) => acc + Math.pow(y - yMean, 2), 0);
  const sse = residuals.reduce((acc, r) => acc + Math.pow(r, 2), 0);
  const ssr = sst - sse;

  // Degrees of Freedom
  const dfTotal = n - 1;
  const dfModel = k;
  const dfError = n - k - 1;

  // Mean Squares
  const msModel = ssr / dfModel;
  const msError = sse / dfError;
  const s = Math.sqrt(msError);

  // F-statistic
  const fStat = msError === 0 ? 0 : msModel / msError;
  const pValueModel = 1 - jStat.centralF.cdf(fStat, dfModel, dfError);

  // R-squared
  const rSq = ssr / sst;
  const rSqAdj = 1 - ((1 - rSq) * (n - 1)) / (n - k - 1);

  // VIF & Tolerance
  const vif: number[] = [];
  if (k > 1) {
    for (let j = 0; j < k; j++) {
      // Regress Xj against other X's
      const y_vif = xDataMatrix[j];
      const x_vif = xDataMatrix.filter((_, idx) => idx !== j);
      const names_vif = xNames.filter((_, idx) => idx !== j);
      const subReg = runMultipleRegression(y_vif, x_vif, names_vif);
      if (subReg) {
        const v = 1 / (1 - subReg.rSq);
        vif.push(v);
      } else {
        vif.push(1); // Default if singular
      }
    }
  } else {
    vif.push(1);
  }

  // Standard Errors of Coefficients
  // SE(beta_j) = sqrt(MSE * (X'X)^-1_jj)
  const coeffs = [];
  for (let j = 0; j <= k; j++) {
    const b = beta[j][0];
    const se = Math.sqrt(msError * (XtX_inv as any)[j][j]);
    const t = se === 0 ? 0 : b / se;
    const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), dfError));
    
    coeffs.push({
      term: j === 0 ? 'Constant' : xNames[j - 1],
      coeff: b,
      se,
      t,
      p,
      vif: j === 0 ? null : (vif[j - 1] || 1),
      tolerance: j === 0 ? null : (1 / (vif[j-1] || 1))
    });
  }

  // Durbin-Watson Statistic
  let dwNumerator = 0;
  for (let i = 1; i < n; i++) {
    dwNumerator += Math.pow(residuals[i] - residuals[i - 1], 2);
  }
  const dwDenominator = residuals.reduce((acc, r) => acc + Math.pow(r, 2), 0);
  const dw = dwDenominator === 0 ? 0 : dwNumerator / dwDenominator;

  // Normal Probability Plot Calculation
  const sortedResiduals = [...residuals].sort((a, b) => a - b);
  const probPlot = sortedResiduals.map((val, i) => {
    const p = (i + 1 - 0.375) / (n + 0.25);
    const theoreticalZ = jStat.normal.inv(p, 0, 1);
    return { observed: val, theoretical: theoreticalZ };
  });

  return {
    coeffs,
    rSq,
    rSqAdj,
    s,
    anova: {
      model: { df: dfModel, ss: ssr, ms: msModel, f: fStat, p: pValueModel },
      error: { df: dfError, ss: sse, ms: msError },
      total: { df: dfTotal, ss: sst }
    },
    dw,
    probPlot,
    residuals: residuals.map((r, i) => ({
      order: i + 1,
      res: r,
      fit: Y_hat[i][0],
      // Z-residual
      z: s === 0 ? 0 : r / s
    }))
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

export function run1SampleTTest(data: number[], target: number, alternative: string = 'neq') {
  const n = data.length;
  if (n < 2) return { pValue: 1, statistic: 0, df: 0, mean: 0, sd: 0, n: 0 };

  const mean = getMean(data);
  const sd = getStdDev(data);
  const se = sd / Math.sqrt(n);
  const t = (mean - target) / se;
  const df = n - 1;

  let pValue: number;
  if (alternative === 'greater') {
    pValue = 1 - jStat.studentt.cdf(t, df);
  } else if (alternative === 'less') {
    pValue = jStat.studentt.cdf(t, df);
  } else {
    pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
  }

  return { pValue, statistic: t, df, mean, sd, n, testName: '1-Sample T-Test' };
}

export function run2SampleTTest(data1: number[], data2: number[], alternative: string = 'neq', pooled: boolean = false) {
  const n1 = data1.length;
  const n2 = data2.length;
  if (n1 < 2 || n2 < 2) return { pValue: 1, statistic: 0, df: 0, m1: 0, m2: 0, s1: 0, s2: 0, n1: 0, n2: 0 };

  const m1 = getMean(data1);
  const m2 = getMean(data2);
  const s1 = getStdDev(data1);
  const s2 = getStdDev(data2);

  let t: number, df: number;

  if (pooled) {
    const sp2 = ((n1 - 1) * s1 ** 2 + (n2 - 1) * s2 ** 2) / (n1 + n2 - 2);
    const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
    t = se === 0 ? 0 : (m1 - m2) / se;
    df = n1 + n2 - 2;
  } else {
    const se1 = s1 ** 2 / n1;
    const se2 = s2 ** 2 / n2;
    const seTotal = Math.sqrt(se1 + se2);
    t = seTotal === 0 ? 0 : (m1 - m2) / seTotal;
    df = (seTotal === 0) ? 1 : Math.pow(se1 + se2, 2) / (Math.pow(se1, 2) / (n1 - 1) + Math.pow(se2, 2) / (n2 - 1));
  }

  let pValue: number;
  if (alternative === 'greater') {
    pValue = 1 - jStat.studentt.cdf(t, df);
  } else if (alternative === 'less') {
    pValue = jStat.studentt.cdf(t, df);
  } else {
    pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(t), df));
  }

  return { pValue, statistic: t, df, m1, m2, s1, s2, n1, n2, testName: pooled ? "Student's T-Test (Equal Var)" : "Welch's T-Test (Unequal Var)" };
}

export function runANOVA(groups: number[][]) {
  const k = groups.length;
  const nTotal = groups.reduce((acc, g) => acc + g.length, 0);
  if (k < 2 || nTotal <= k) return { pValue: 1, statistic: 0, dfBetween: 0, dfWithin: 0 };

  const allData = groups.flat();
  const grandMean = getMean(allData);

  let ssBetween = 0;
  let ssWithin = 0;

  groups.forEach(g => {
    const m = getMean(g);
    ssBetween += g.length * Math.pow(m - grandMean, 2);
    g.forEach(x => {
      ssWithin += Math.pow(x - m, 2);
    });
  });

  const dfBetween = k - 1;
  const dfWithin = nTotal - k;
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;

  const f = msWithin === 0 ? 0 : msBetween / msWithin;
  const pValue = 1 - jStat.centralF.cdf(f, dfBetween, dfWithin);

  return { pValue, statistic: f, dfBetween, dfWithin, msBetween, msWithin };
}

export function calculateAndersonDarling(data: number[]) {
  // Simplified approximation for React UI speed. 
  // In a full node environment, a heavy AD library is preferred.
  // We use jStat's z-scores to approximate fitness.
  const n = data.length;
  if (n < 7) return { pValue: 0.01, statistic: 0 }; // Too small to prove normality
  
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

export function generateQQData(data: number[]) {
  if (data.length < 2) return [];
  const sorted = [...data].sort((a, b) => a - b);
  const n = data.length;
  const mean = getMean(data);
  const stdev = getStdDev(data);

  return sorted.map((val, i) => {
    // Blom's plotting position: (i - 0.375) / (n + 0.25)
    const p = (i + 1 - 0.375) / (n + 0.25);
    const z = jStat.normal.inv(p, 0, 1);
    const expected = mean + z * stdev;
    return { x: expected, y: val };
  });
}

export function getVarianceConfidenceInterval(data: number[], confidence = 0.95) {
  const n = data.length;
  if (n < 2) return { var: 0, lcl: 0, ucl: 0, sd: 0, sdLcl: 0, sdUcl: 0 };
  const variance = Math.pow(getStdDev(data), 2);
  const alpha = 1 - confidence;
  const chi2Lower = jStat.chisquare.inv(alpha / 2, n - 1);
  const chi2Upper = jStat.chisquare.inv(1 - alpha / 2, n - 1);
  
  const vLcl = ((n - 1) * variance) / chi2Upper;
  const vUcl = ((n - 1) * variance) / chi2Lower;
  
  return {
    var: variance,
    lcl: vLcl,
    ucl: vUcl,
    sd: Math.sqrt(variance),
    sdLcl: Math.sqrt(vLcl),
    sdUcl: Math.sqrt(vUcl)
  };
}

export function runFTest(data1: number[], data2: number[]) {
  const v1 = Math.pow(getStdDev(data1), 2);
  const v2 = Math.pow(getStdDev(data2), 2);
  const df1 = data1.length - 1;
  const df2 = data2.length - 1;

  const f = v1 / v2;
  // Two-tailed F-test
  let pValue = 2 * (1 - jStat.centralF.cdf(Math.max(f, 1 / f), df1, df2));
  if (pValue > 1) pValue = 1;

  return { statistic: f, pValue, df1, df2 };
}

export function runLeveneTest(groups: number[][]) {
  const groupMedians = groups.map(g => jStat.median(g));
  const absDevs = groups.map((g, i) => g.map(x => Math.abs(x - groupMedians[i])));
  
  // Levene's is essentially an ANOVA on absolute deviations from median
  return runANOVA(absDevs);
}

export function runKruskalWallis(groups: number[][]) {
  const k = groups.length;
  const nTotal = groups.reduce((acc, g) => acc + g.length, 0);
  if (k < 2 || nTotal <= k) return { pValue: 1, statistic: 0, df: 0 };

  const combined = groups.flatMap((g, idx) => g.map(v => ({ v, g: idx }))).sort((a, b) => a.v - b.v);

  // Assign ranks
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].v === combined[i].v) {
      j++;
    }
    const rank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      (combined[k] as any).rank = rank;
    }
    i = j;
  }

  const groupRankSums = groups.map((_, idx) => 
    combined.filter(x => x.g === idx).reduce((acc, x) => acc + (x as any).rank, 0)
  );

  const term1 = 12 / (nTotal * (nTotal + 1));
  const rankSumPart = groupRankSums.reduce((acc, sum, idx) => acc + (sum ** 2 / groups[idx].length), 0);
  const h = term1 * rankSumPart - 3 * (nTotal + 1);
  const df = k - 1;
  const pValue = 1 - jStat.chisquare.cdf(h, df);

  return { statistic: h, pValue, df, testName: 'Kruskal-Wallis Test' };
}

export function runWelchANOVA(groups: number[][]) {
  const k = groups.length;
  const ns = groups.map(g => g.length);
  const means = groups.map(g => jStat.mean(g));
  const vars = groups.map(g => jStat.variance(g, true));

  // 1. Calculate weights (w_i = n_i / s_i^2)
  const weights = ns.map((n, i) => n / vars[i]);
  const sumWeights = jStat.sum(weights);

  // 2. Calculate the weighted grand mean
  const weightedGrandMean = weights.reduce((acc, w, i) => acc + (w * means[i]), 0) / sumWeights;

  // 3. Calculate Lambda (Adjustment factor)
  const lambdaNum = weights.reduce((acc, w, i) => {
    return acc + (Math.pow(1 - (w / sumWeights), 2) / (ns[i] - 1));
  }, 0);
  const lambda = lambdaNum / (Math.pow(k, 2) - 1);

  // 4. Calculate Welch's F-statistic
  const msBetween = weights.reduce((acc, w, i) => {
    return acc + (w * Math.pow(means[i] - weightedGrandMean, 2));
  }, 0) / (k - 1);
  
  const fStat = msBetween / (1 + (2 * (k - 2) * lambda));

  // 5. Calculate Degrees of Freedom (Numerator and Denominator)
  const df1 = k - 1;
  const df2 = (k * k - 1) / (3 * lambdaNum);

  // 6. Calculate P-Value
  const pValue = 1 - jStat.centralF.cdf(fStat, df1, df2);

  return { statistic: fStat, pValue, df1, df2, testName: "Welch's ANOVA" };
}

export function runMannWhitneyU(data1: number[], data2: number[], alternative: string = 'neq') {
  const n1 = data1.length;
  const n2 = data2.length;
  
  const combined = [
    ...data1.map(v => ({ v, g: 1 })),
    ...data2.map(v => ({ v, g: 2 }))
  ].sort((a, b) => a.v - b.v);

  // Assign ranks
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].v === combined[i].v) {
      j++;
    }
    const rank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      (combined[k] as any).rank = rank;
    }
    i = j;
  }

  const r1 = combined.filter(x => x.g === 1).reduce((acc, x) => acc + (x as any).rank, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  
  // For Mann-Whitney, U1 + U2 = n1*n2. 
  // Standard test statistic is typically min(U1, U2) for two-tailed.
  // For one-tailed:
  // If H1: S1 > S2, we expect U2 to be large and U1 to be small (S1 ranks > S2 ranks)
  // Wait, if S1 > S2, S1 has higher ranks, so R1 is larger. 
  // U1 = R1 - n1(n1+1)/2. So U1 is larger if S1 > S2.
  // U2 = n1*n2 - U1. So U2 is smaller if S1 > S2.
  // Let's use the standard normal approximation.
  const mU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  
  // Z for U1
  const z = (u1 - mU) / sigmaU;
  
  let pValue: number;
  if (alternative === 'greater') {
    pValue = 1 - jStat.normal.cdf(z, 0, 1);
  } else if (alternative === 'less') {
    pValue = jStat.normal.cdf(z, 0, 1);
  } else {
    pValue = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
  }

  return { 
    statistic: u1, 
    pValue, 
    u1, 
    u2, 
    n1, 
    n2, 
    z,
    testName: 'Mann-Whitney U' 
  };
}

export function getConfidenceInterval(data: number[], confidence = 0.95) {
  const n = data.length;
  if (n < 2) return { mean: 0, lcl: 0, ucl: 0 };
  const mean = getMean(data);
  const sd = getStdDev(data);
  const se = sd / Math.sqrt(n);
  const alpha = 1 - confidence;
  const t = jStat.studentt.inv(1 - alpha / 2, n - 1);
  return {
    mean,
    lcl: mean - t * se,
    ucl: mean + t * se
  };
}

// --- Chi-Squared Tests ---

export function runChiSquareGoodnessOfFit(observed: number[], expected: number[]) {
  const n = observed.length;
  if (n < 2) return null;

  let chi2 = 0;
  for (let i = 0; i < n; i++) {
    const e = expected[i];
    if (e <= 0) continue;
    chi2 += Math.pow(observed[i] - e, 2) / e;
  }

  const df = n - 1;
  const pValue = 1 - jStat.chisquare.cdf(chi2, df);

  return { statistic: chi2, pValue, df, expected, testName: 'Chi-Square Goodness-of-Fit' };
}

export function runChiSquareIndependence(matrix: number[][]) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  if (rows < 2 || cols < 2) return null;

  const rowTotals = matrix.map(r => r.reduce((a, b) => a + b, 0));
  const colTotals = Array(cols).fill(0).map((_, j) => matrix.reduce((acc, r) => acc + r[j], 0));
  const grandTotal = rowTotals.reduce((a, b) => a + b, 0);

  if (grandTotal === 0) return null;

  let chi2 = 0;
  const expected: number[][] = [];
  
  for (let i = 0; i < rows; i++) {
    expected[i] = [];
    for (let j = 0; j < cols; j++) {
      const e = (rowTotals[i] * colTotals[j]) / grandTotal;
      expected[i][j] = e;
      if (e > 0) {
        chi2 += Math.pow(matrix[i][j] - e, 2) / e;
      }
    }
  }

  const df = (rows - 1) * (cols - 1);
  const pValue = 1 - jStat.chisquare.cdf(chi2, df);

  return { statistic: chi2, pValue, df, expected, testName: 'Chi-Square Test of Independence' };
}

// --- Proportion Tests ---

export function run1SampleProportion(events: number, trials: number, target: number, alternative: string = 'neq') {
  if (trials <= 0) return null;
  const p = events / trials;
  
  // Z-test approximation (standard for large-ish samples)
  // Null hypothesis: Proportion = target
  const se = Math.sqrt((target * (1 - target)) / trials);
  const z = se === 0 ? 0 : (p - target) / se;

  let pValue: number;
  if (alternative === 'greater') {
    pValue = 1 - jStat.normal.cdf(z, 0, 1);
  } else if (alternative === 'less') {
    pValue = jStat.normal.cdf(z, 0, 1);
  } else {
    pValue = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
  }

  return { statistic: z, pValue, p, trials, events, target, testName: '1-Sample Proportion (Z-Test)' };
}

export function run2SampleProportion(e1: number, n1: number, e2: number, n2: number, alternative: string = 'neq', pooled: boolean = true, confidence: number = 0.95) {
  if (n1 <= 0 || n2 <= 0) return null;
  const p1 = e1 / n1;
  const p2 = e2 / n2;
  const diff = p1 - p2;
  
  // Test Statistic (using pooled estimate if selected)
  const pPool = (e1 + e2) / (n1 + n2);
  const seTest = pooled 
    ? Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2))
    : Math.sqrt((p1 * (1 - p1) / n1) + (p2 * (1 - p2) / n2));
  
  const z = seTest === 0 ? 0 : diff / seTest;

  let pValue: number;
  if (alternative === 'greater') {
    pValue = 1 - jStat.normal.cdf(z, 0, 1);
  } else if (alternative === 'less') {
    pValue = jStat.normal.cdf(z, 0, 1);
  } else {
    pValue = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
  }

  // Confidence Intervals for individual proportions (Wilson Score interval or normal approx)
  const zAlpha = jStat.normal.inv(1 - (1 - confidence) / 2, 0, 1);
  const getCI = (events: number, trials: number) => {
    const phat = events / trials;
    const se = Math.sqrt((phat * (1 - phat)) / trials);
    return {
      nominal: phat,
      lower: Math.max(0, phat - zAlpha * se),
      upper: Math.min(1, phat + zAlpha * se)
    };
  };

  // Confidence Bound for the Difference (Normal approximation)
  const seDiff = Math.sqrt((p1 * (1 - p1) / n1) + (p2 * (1 - p2) / n2));
  let diffLower: number | null = null;
  let diffUpper: number | null = null;

  if (alternative === 'greater') {
    // 1-sided lower bound
    const zCrit = jStat.normal.inv(confidence, 0, 1);
    diffLower = diff - zCrit * seDiff;
  } else if (alternative === 'less') {
    // 1-sided upper bound
    const zCrit = jStat.normal.inv(confidence, 0, 1);
    diffUpper = diff + zCrit * seDiff;
  } else {
    // 2-sided
    diffLower = diff - zAlpha * seDiff;
    diffUpper = diff + zAlpha * seDiff;
  }

  return { 
    statistic: z, 
    pValue, 
    p1, p2, n1, n2, e1, e2, 
    diff,
    diffLower,
    diffUpper,
    ci1: getCI(e1, n1),
    ci2: getCI(e2, n2),
    testName: '2-Sample Proportion' 
  };
}

// --- Poisson Tests ---

export function run1SamplePoisson(events: number, sampleSize: number, targetRate: number, alternative: string = 'neq') {
  if (sampleSize <= 0) return null;
  const rate = events / sampleSize;
  const lambda = targetRate * sampleSize;

  // Exact Poisson p-values
  let pValue: number;
  if (alternative === 'greater') {
    // P(X >= events) = 1 - P(X <= events - 1)
    pValue = 1 - (events === 0 ? 0 : jStat.poisson.cdf(events - 1, lambda));
  } else if (alternative === 'less') {
    // P(X <= events)
    pValue = jStat.poisson.cdf(events, lambda);
  } else {
    // Two-sided is trickier for Poisson, sum probabilities less than or equal to current point
    const pObs = jStat.poisson.pdf(events, lambda);
    // Find points where PDF <= pObs
    // Simplified: iterate to a reasonable bound
    let sumP = 0;
    const bound = Math.ceil(lambda * 3 + 10);
    for (let x = 0; x <= bound; x++) {
      const p = jStat.poisson.pdf(x, lambda);
      if (p <= pObs + 0.0000001) sumP += p;
    }
    pValue = Math.min(1, sumP);
  }

  return { statistic: rate, pValue, rate, events, sampleSize, targetRate, testName: '1-Sample Poisson Rate Test' };
}

export function run2SamplePoisson(e1: number, s1: number, e2: number, s2: number, alternative: string = 'neq') {
  if (s1 <= 0 || s2 <= 0) return null;
  const r1 = e1 / s1;
  const r2 = e2 / s2;
  
  // Z-test approximation for difference in Poisson rates
  // Se = sqrt(r1/s1 + r2/s2)
  const se = Math.sqrt(r1 / s1 + r2 / s2);
  const z = se === 0 ? 0 : (r1 - r2) / se;

  let pValue: number;
  if (alternative === 'greater') {
    pValue = 1 - jStat.normal.cdf(z, 0, 1);
  } else if (alternative === 'less') {
    pValue = jStat.normal.cdf(z, 0, 1);
  } else {
    pValue = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
  }

  return { statistic: z, pValue, r1, r2, s1, s2, e1, e2, testName: '2-Sample Poisson Rate (Z-Test)' };
}

export function getMedianConfidenceInterval(data: number[], confidence = 0.95) {
  // Using Thompson-Savur (Non-parametric)
  const n = data.length;
  const sorted = [...data].sort((a,b) => a-b);
  const median = jStat.median(sorted);
  if (n < 5) return { median, lcl: sorted[0], ucl: sorted[n-1] };
  
  const z = jStat.normal.inv(1 - (1 - confidence) / 2, 0, 1);
  const j = Math.floor(n/2 - z * Math.sqrt(n/4));
  const k = Math.ceil(n/2 + 1 + z * Math.sqrt(n/4));
  
  return {
    median,
    lcl: sorted[Math.max(0, j - 1)],
    ucl: sorted[Math.min(n - 1, k - 1)]
  };
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