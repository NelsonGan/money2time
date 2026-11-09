import type config from './searchAnimation.json';
export const animation: typeof config;
export const PAYMENT_LAYERS: readonly string[];
export function phoneProgress(time: number): number;
export function layerOpacity(layer: keyof typeof config.layers, time: number): number;
export function paymentKeyframes(): string;
export function phoneMotionExpression(): string;
export function insertionProgress(time: number): number;
export function insertionMotionExpression(variable?: string): string;
