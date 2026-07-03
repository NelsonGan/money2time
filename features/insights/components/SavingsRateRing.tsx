import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/**
 * Circular gauge for the savings-rate hero card. Draws a soft track, a
 * round-capped progress arc, and a small dot marking the healthy-rate goal
 * on the ring. Center content (icon, text) renders as children.
 */
export function SavingsRateRing({
  size,
  strokeWidth,
  progress,
  color,
  trackColor,
  goal,
  goalColor,
  children,
}: {
  size: number;
  strokeWidth: number;
  /** Arc fill, clamped to 0–1. */
  progress: number;
  color: string;
  trackColor: string;
  /** Goal marker position on the ring, 0–1. Omit to hide the marker. */
  goal?: number;
  goalColor?: string;
  children?: React.ReactNode;
}) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const filledLength = circumference * clamped;
  const goalAngle = goal === undefined ? null : -Math.PI / 2 + goal * 2 * Math.PI;

  return (
    <View style={buildRingSizeStyle(size)} className="items-center justify-center">
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {clamped > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${filledLength} ${Math.max(0, circumference - filledLength)}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
        {goalAngle !== null && goalColor ? (
          <Circle
            cx={center + radius * Math.cos(goalAngle)}
            cy={center + radius * Math.sin(goalAngle)}
            r={Math.max(2, strokeWidth / 2 - 1.5)}
            fill={goalColor}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

function buildRingSizeStyle(size: number) {
  return { width: size, height: size };
}
