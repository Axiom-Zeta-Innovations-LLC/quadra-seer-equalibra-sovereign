
// This service generates metrics for visual diagnostics.
// It now supports "Live Stress" inputs to reflect actual API performance.

let currentTime = 0;
let currentStability = 0.8;
let lastAdjustment = 0;

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

/**
 * Generates a simulation data point.
 * @param stressFactor 0 to 1, representing real-world "stress" like API latency or throughput.
 * @param activity Intensity of the current "neural" activity.
 */
export const runSimulationStep = (stressFactor: number = 0.1, activity: number = 0) => {
    currentTime += 0.1;

    // Simulate stability fluctuation
    // Higher stress leads to more volatility
    const volatility = 0.05 + (stressFactor * 0.15);
    const chaos = (Math.random() - 0.5) * volatility;
    
    currentStability += chaos;
    
    // Recovery factor: System tries to return to 0.8 stability
    const recovery = (0.8 - currentStability) * 0.05;
    currentStability += recovery;
    currentStability = clamp(currentStability, 0.2, 0.95);

    // Derive Coherence from stability and activity
    // High activity + Low stability = Low coherence (system is struggling)
    const coherence = clamp(currentStability - (activity * 0.3), 0.1, 1);
    
    // Drift increases with time and stress
    const drift = clamp((stressFactor * 0.5) + (Math.sin(currentTime * 0.5) * 0.1), 0, 1);
    
    // Load is a direct reflection of activity + stress
    const load = clamp(activity + (stressFactor * 0.4), 0, 1);

    return {
        id: `vec-${Date.now()}`,
        time: currentTime,
        timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        stability: currentStability,
        coherence: coherence,
        drift: drift,
        load: load,
        q_entropy: clamp(1 - coherence + (stressFactor * 0.2), 0, 1),
        is_live_event: activity > 0
    };
};

export const resetSimulation = () => {
    currentTime = 0;
    currentStability = 0.8;
    lastAdjustment = 0;
};
